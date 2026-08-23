from rest_framework import serializers
from catalog.models import Category, Product


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["category_id", "name", "code", "description"]
        read_only_fields = ["category_id"]


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "product_id", "category", "barcode", "name", "brand", "model_number",
            "description", "specifications", "usage_instructions", "warranty_months",
            "reorder_level", "unit", "is_active", "created_at",
        ]
        read_only_fields = ["product_id", "barcode", "created_at"]
