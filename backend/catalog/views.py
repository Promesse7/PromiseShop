from django.db import transaction
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from catalog.models import Category, Product
from catalog.serializers import CategorySerializer, ProductSerializer
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
