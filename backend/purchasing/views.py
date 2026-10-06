from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, MethodNotAllowed
from rest_framework.response import Response
from rest_framework import status as http_status

from accounts.permissions import IsAdminOrManager, IsAdminOrManagerOrReadOnly
from purchasing.models import Supplier, Purchase, PurchaseItem
from purchasing.serializers import (
    AddPurchaseItemSerializer,
    BulkPurchaseItemResultSerializer,
    BulkPurchaseItemRowSerializer,
    PurchaseItemSerializer,
    PurchaseSerializer,
    SupplierSerializer,
    UpdatePurchaseItemSerializer,
)
from purchasing.services import (
    BulkRowErrors,
    add_existing_product_item,
    add_items_bulk,
    add_new_product_item,
    cancel_purchase,
    receive_purchase,
    recent_products_for_supplier,
    remove_item,
    update_item,
)

MAX_BULK_ROWS = 500


def _can_see_cost(user):
    return user.role in (user.Role.ADMIN, user.Role.MANAGER)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("supplier_id")
    serializer_class = SupplierSerializer
    permission_classes = [IsAdminOrManagerOrReadOnly]

    def perform_destroy(self, instance):
        # Purchase.supplier is PROTECT; check first so this is a clean 400, not a 500.
        if instance.purchases.exists():
            raise ValidationError("This supplier has purchases on record and cannot be deleted.")
        instance.delete()

    @action(detail=True, methods=["get"], url_path="recent-products")
    def recent_products(self, request, pk=None):
        supplier = self.get_object()
        include_cost = _can_see_cost(request.user)
        rows = []
        for line in recent_products_for_supplier(supplier):
            row = {
                "product_id": line.product_id,
                "name": line.product.name,
                "brand": line.product.brand,
                "model_number": line.product.model_number,
                "barcode": line.product.barcode,
                "last_purchase_date": line.purchase.purchase_date.isoformat(),
                "last_quantity": line.quantity,
            }
            if include_cost:
                row["last_unit_cost_paid"] = str(line.unit_cost_paid)
                row["last_unit_cost_invoiced"] = str(line.unit_cost_invoiced)
            rows.append(row)
        return Response({"results": rows})


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by("-purchase_date").prefetch_related("items")
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != Purchase.Status.DRAFT:
            raise ValidationError("Cannot edit a purchase that has already been received.")
        serializer.save()

    def update(self, request, *args, **kwargs):
        # Only PATCH (partial update) is supported on the purchase header; full PUT
        # replacement has no legitimate use case here and is rejected. Note: DRF's
        # partial_update() delegates into this same method with partial=True, so
        # PATCH must keep flowing through to super().update() below.
        if not kwargs.get("partial", False):
            raise MethodNotAllowed("PUT")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        # There's no legitimate reason to ever delete a Purchase header via this API:
        # removing individual line items is already handled by the dedicated
        # items/{item_id} DELETE action. Deleting the header would CASCADE-delete its
        # PurchaseItems while leaving any stock increments a "received" purchase
        # already caused unreversed (see final review finding #1).
        raise MethodNotAllowed("DELETE")

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        purchase = self.get_object()
        serializer = AddPurchaseItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        is_new_product = data.pop("_is_new_product")
        if is_new_product:
            item = add_new_product_item(
                purchase, category=data["category"], name=data["name"],
                quantity=data["quantity"], unit_cost_paid=data["unit_cost_paid"],
                unit_cost_invoiced=data["unit_cost_invoiced"], selling_price=data["selling_price"],
                brand=data.get("brand", ""), model_number=data.get("model_number", ""),
                specifications=data.get("specifications", ""),
                usage_instructions=data.get("usage_instructions", ""),
                warranty_months=data.get("warranty_months", 0),
                reorder_level=data.get("reorder_level", 5),
                price_discrepancy_note=data.get("price_discrepancy_note", ""),
            )
        else:
            item = add_existing_product_item(
                purchase, data["product"], data["quantity"], data["unit_cost_paid"],
                data["unit_cost_invoiced"], data.get("price_discrepancy_note", ""),
            )
        return Response(
            PurchaseItemSerializer(item, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="items/bulk")
    def add_items_bulk_action(self, request, pk=None):
        purchase = self.get_object()
        rows = request.data.get("items") if hasattr(request.data, "get") else None
        if not isinstance(rows, list) or not rows:
            raise ValidationError({"items": "Send a non-empty list of rows."})
        if len(rows) > MAX_BULK_ROWS:
            raise ValidationError({"items": f"At most {MAX_BULK_ROWS} rows per save."})

        validated, row_errors = [], {}
        for index, row in enumerate(rows):
            serializer = BulkPurchaseItemRowSerializer(data=row)
            if serializer.is_valid():
                validated.append(serializer.validated_data)
            else:
                row_errors[index] = serializer.errors
        if not row_errors:
            try:
                items = add_items_bulk(purchase, validated)
            except BulkRowErrors as exc:
                row_errors = exc.row_errors
        if row_errors:
            return Response(
                {
                    "detail": f"{len(row_errors)} row(s) have errors; nothing was saved.",
                    "code": "row_errors",
                    "row_errors": {str(index): errors for index, errors in row_errors.items()},
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"items": BulkPurchaseItemResultSerializer(items, many=True, context={"request": request}).data},
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["patch", "delete"], url_path=r"items/(?P<item_id>[0-9]+)")
    def item_action(self, request, pk=None, item_id=None):
        purchase = self.get_object()
        item = get_object_or_404(PurchaseItem, pk=item_id, purchase=purchase)
        if request.method == "DELETE":
            remove_item(purchase, item)
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        serializer = UpdatePurchaseItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = update_item(purchase, item, **serializer.validated_data)
        return Response(PurchaseItemSerializer(item, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        purchase = self.get_object()
        purchase = receive_purchase(purchase, user=request.user)
        return Response(PurchaseSerializer(purchase, context={"request": request}).data)

    @action(detail=True, methods=["post"], permission_classes=[IsAdminOrManager])
    def cancel(self, request, pk=None):
        purchase = self.get_object()
        purchase = cancel_purchase(purchase, user=request.user)
        return Response(PurchaseSerializer(purchase, context={"request": request}).data)
