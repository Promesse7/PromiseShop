from decimal import Decimal

from django.db import transaction
from django.http import HttpResponse
from rest_framework import serializers, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrManager, IsAdminOrManagerOrReadOnly
from catalog.models import Category, Product, ProductBarcodeAlias, ProductPricing
from catalog.serializers import CategorySerializer, ProductSerializer, ProductPricingSerializer
from catalog.merge import find_duplicate_pairs, merge_preview, merge_products
from catalog.importer import COLUMNS as IMPORT_COLUMNS, ImportHasErrors, commit_import, dry_run, opening_stock_status, set_opening_stock, template_csv
from catalog.search import DEFAULT_LIMIT, MAX_LIMIT, TIER_NAMES, search_products
from catalog.services import generate_barcode


def _can_see_cost(user):
    return user.role in (user.Role.ADMIN, user.Role.MANAGER)


def _search_rows(products, include_cost):
    """Shape search hits, fetching stock, price and last paid cost in bulk."""
    from purchasing.costing import last_paid_unit_costs
    from stock.models import Inventory

    ids = [p.product_id for p in products]
    stock = dict(Inventory.objects.filter(product_id__in=ids).values_list("product_id", "quantity_in_stock"))
    prices = dict(
        ProductPricing.objects.filter(product_id__in=ids, is_current=True).values_list("product_id", "retail_price")
    )
    # Per single unit: a pack's price divided out, a bundle component's share.
    last_cost = last_paid_unit_costs(ids) if include_cost else {}

    rows = []
    for p in products:
        price = prices.get(p.product_id)
        row = {
            "product_id": p.product_id,
            "name": p.name,
            "brand": p.brand,
            "model_number": p.model_number,
            "barcode": p.barcode,
            "category": p.category_id,
            "category_name": p.category.name,
            "is_active": p.is_active,
            "in_stock": stock.get(p.product_id),
            "retail_price": str(price) if price is not None else None,
            "match": TIER_NAMES[p.match_tier],
            "score": 1.0 if p.match_tier <= 2 else round(float(p.match_score or 0), 3),
        }
        if include_cost:
            cost = last_cost.get(p.product_id)
            row["last_paid_cost"] = str(cost) if cost is not None else None
        rows.append(row)
    return rows


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("category_id")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAdminOrManager()]
        return super().get_permissions()

    def perform_destroy(self, instance):
        if instance.products.exists():
            raise ValidationError(
                "This category still has products assigned to it and cannot be deleted."
            )
        instance.delete()


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("product_id")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsAdminOrManager()]
        return super().get_permissions()

    def perform_destroy(self, instance):
        # PurchaseItem/SaleItem point at Product with on_delete=PROTECT, so a raw delete
        # would raise ProtectedError (an unhandled 500). Check first and return a clean
        # 400 so the UI can steer the user to "deactivate" instead. Everything else that
        # hangs off a product (pricing history, inventory, equipment units) is CASCADE
        # and is meant to go with it — a product with no trade history is an entry
        # mistake, not a record worth keeping.
        if (
            instance.purchase_items.exists() or instance.sale_items.exists()
            or instance.purchase_item_components.exists()
        ):
            raise ValidationError(
                "This product has purchase or sale history and cannot be deleted. "
                "Deactivate it instead so past records stay intact."
            )
        if instance.bundle_template_components.exists():
            raise ValidationError(
                "This product is part of a saved bundle template. Remove it from the template first."
            )
        instance.delete()

    def _guard_min_price(self):
        # The minimum (floor) price is set by admin and manager only.
        user = self.request.user
        if "min_price" in self.request.data and user.role not in (user.Role.ADMIN, user.Role.MANAGER):
            raise PermissionDenied("Only an admin or manager can set a minimum price.")

    def perform_create(self, serializer):
        self._guard_min_price()
        with transaction.atomic():
            category = serializer.validated_data["category"]
            barcode = generate_barcode(category)
            serializer.save(barcode=barcode)

    @action(detail=False, methods=["get"], url_path="search")
    def search(self, request):
        raw_limit = request.query_params.get("limit")
        if raw_limit in (None, ""):
            limit = DEFAULT_LIMIT
        else:
            try:
                limit = int(raw_limit)
            except ValueError:
                raise ValidationError({"limit": "Must be a whole number."})
            limit = max(1, min(limit, MAX_LIMIT))
        products = search_products(
            request.query_params.get("q", ""),
            include_inactive=request.query_params.get("include_inactive") == "true",
            limit=limit,
        )
        return Response({"results": _search_rows(products, include_cost=_can_see_cost(request.user))})

    @action(detail=False, methods=["get"], url_path="duplicates", permission_classes=[IsAdmin])
    def duplicates(self, request):
        return Response({"results": find_duplicate_pairs()})

    @action(detail=True, methods=["get", "post"], url_path="merge", permission_classes=[IsAdmin])
    def merge(self, request, pk=None):
        keep = self.get_object()
        source = request.query_params if request.method == "GET" else request.data
        raw = source.get("duplicate") if hasattr(source, "get") else None
        try:
            duplicate = Product.objects.get(pk=int(raw))
        except (TypeError, ValueError, Product.DoesNotExist):
            raise ValidationError({"duplicate": "Choose the duplicate product to merge."})
        if request.method == "GET":
            return Response(merge_preview(keep, duplicate))
        merge = merge_products(keep, duplicate, request.user, request.data.get("reason", ""))
        return Response(
            {"merge_id": merge.merge_id, "keep": keep.pk, "duplicate": duplicate.pk, "counts": merge.counts},
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"], url_path="opening-stock", permission_classes=[IsAdmin])
    def opening_stock(self, request, pk=None):
        product = self.get_object()
        if request.method == "GET":
            return Response(opening_stock_status(product))
        serializer = OpeningStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        movement = set_opening_stock(product, user=request.user, **serializer.validated_data)
        return Response(
            {"movement_id": movement.movement_id, "in_stock": movement.balance_after, **opening_stock_status(product)},
            status=http_status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        self._guard_min_price()
        serializer.save()

    @action(detail=True, methods=["post"], url_path="set-active", permission_classes=[IsAdminOrManager])
    def set_active(self, request, pk=None):
        is_active = request.data.get("is_active")
        if not isinstance(is_active, bool):
            raise ValidationError({"is_active": "This field is required and must be a boolean."})

        product = self.get_object()
        product.is_active = is_active
        product.save()
        return Response(ProductSerializer(product).data)


class ProductPricingViewSet(viewsets.ModelViewSet):
    serializer_class = ProductPricingSerializer
    permission_classes = [IsAdminOrManagerOrReadOnly]

    def get_queryset(self):
        queryset = ProductPricing.objects.all().order_by("-effective_date")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if self.request.query_params.get("is_current") == "true":
            queryset = queryset.filter(is_current=True)
        return queryset

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def _is_admin(self):
        return self.request.user.role == self.request.user.Role.ADMIN

    def _reject_non_admin_wholesale_price(self):
        if "wholesale_price" in self.request.data and not self._is_admin():
            raise PermissionDenied("Only Admin can set wholesale_price.")

    def _resolve_wholesale_price(self, serializer):
        """Determine wholesale_price for a new pricing row.

        Admin must always supply it explicitly. Non-admin may omit it, in
        which case it's carried forward from the product's current pricing
        row (non-admins can never set it themselves, per
        `_reject_non_admin_wholesale_price`). If the product has no existing
        pricing row to carry forward from, only Admin can create the first one.
        """
        if "wholesale_price" in self.request.data:
            return serializer.validated_data["wholesale_price"]

        if self._is_admin():
            raise ValidationError({"wholesale_price": "This field is required."})

        product = serializer.validated_data["product"]
        current = ProductPricing.objects.filter(product=product, is_current=True).first()
        if current is None:
            raise ValidationError(
                {
                    "wholesale_price": (
                        "This field is required: the product has no existing pricing row to "
                        "carry it forward from, and only Admin can set the first price."
                    )
                }
            )
        return current.wholesale_price

    def perform_create(self, serializer):
        self._reject_non_admin_wholesale_price()
        wholesale_price = self._resolve_wholesale_price(serializer)

        with transaction.atomic():
            product = serializer.validated_data["product"]
            ProductPricing.objects.filter(product=product, is_current=True).update(is_current=False)
            serializer.save(is_current=True, wholesale_price=wholesale_price)

    def perform_update(self, serializer):
        self._reject_non_admin_wholesale_price()
        serializer.save()


class ProductBarcodeAliasSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductBarcodeAlias
        fields = ["alias_id", "barcode", "product", "created_at"]
        read_only_fields = fields


class ProductBarcodeAliasViewSet(viewsets.ReadOnlyModelViewSet):
    """Extra barcodes that scan as a product (e.g. a merged duplicate's label)."""

    queryset = ProductBarcodeAlias.objects.all().order_by("alias_id")
    serializer_class = ProductBarcodeAliasSerializer
    permission_classes = [IsAuthenticated]


class OpeningStockSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class ImportProductsView(APIView):
    """POST {csv: "<text>", commit: bool} — dry run (default) or commit. Admin only."""

    permission_classes = [IsAdmin]

    def post(self, request):
        text = request.data.get("csv") if hasattr(request.data, "get") else None
        commit = request.data.get("commit") is True if hasattr(request.data, "get") else False
        if not commit:
            return Response(dry_run(text))
        try:
            result = commit_import(text, request.user)
        except ImportHasErrors as exc:
            return Response(
                {
                    "detail": "Some rows have errors; nothing was imported. Fix them and try again.",
                    "code": "row_errors",
                    **exc.result,
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(result, status=http_status.HTTP_201_CREATED)


class ImportTemplateView(APIView):
    permission_classes = [IsAdmin]

    filename = "promiseshop-products-template.csv"

    def get(self, request):
        # ?as=json for the frontend, whose API proxy only relays JSON.
        if request.query_params.get("as") == "json":
            return Response({"filename": self.filename, "columns": IMPORT_COLUMNS, "csv": template_csv()})
        response = HttpResponse(template_csv(), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{self.filename}"'
        return response

