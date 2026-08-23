from django.db import transaction
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated

from catalog.models import Category, Product, ProductPricing
from catalog.serializers import CategorySerializer, ProductSerializer, ProductPricingSerializer
from catalog.services import generate_barcode


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("category_id")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("product_id")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        with transaction.atomic():
            category = serializer.validated_data["category"]
            barcode = generate_barcode(category)
            serializer.save(barcode=barcode)


class ProductPricingViewSet(viewsets.ModelViewSet):
    serializer_class = ProductPricingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ProductPricing.objects.all().order_by("-effective_date")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
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
