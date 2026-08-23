from django.db import transaction
from rest_framework import viewsets
from rest_framework.exceptions import PermissionDenied
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

    def _reject_non_admin_wholesale_price(self):
        is_admin = self.request.user.role == self.request.user.Role.ADMIN
        if "wholesale_price" in self.request.data and not is_admin:
            raise PermissionDenied("Only Admin can set wholesale_price.")

    def perform_create(self, serializer):
        self._reject_non_admin_wholesale_price()

        with transaction.atomic():
            product = serializer.validated_data["product"]
            ProductPricing.objects.filter(product=product, is_current=True).update(is_current=False)
            serializer.save(is_current=True)

    def perform_update(self, serializer):
        self._reject_non_admin_wholesale_price()
        serializer.save()
