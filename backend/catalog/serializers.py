from rest_framework import serializers
from catalog.models import Category, Product, ProductPricing


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


class ProductPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPricing
        fields = ["price_id", "product", "wholesale_price", "retail_price", "effective_date", "is_current"]
        read_only_fields = ["price_id", "is_current"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role == request.user.Role.ADMIN
        )
        if not is_admin:
            data.pop("wholesale_price", None)
        return data
