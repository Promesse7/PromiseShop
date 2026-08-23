from rest_framework import serializers
from catalog.models import Category, Product, ProductPricing


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["category_id", "name", "code", "description"]
        read_only_fields = ["category_id"]

    def validate_code(self, value):
        # code is writable on create but immutable afterwards: it's baked
        # into every barcode already generated for this category's products.
        if self.instance is not None and value != self.instance.code:
            raise serializers.ValidationError("code cannot be changed after creation.")
        return value


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "product_id", "category", "barcode", "name", "brand", "model_number",
            "description", "specifications", "usage_instructions", "warranty_months",
            "reorder_level", "unit", "is_active", "created_at",
        ]
        read_only_fields = ["product_id", "barcode", "created_at"]

    def validate_category(self, value):
        # category is writable on create but immutable afterwards: changing
        # it would desync the product's already-generated barcode, which
        # encodes the original category's code.
        if self.instance is not None and value != self.instance.category:
            raise serializers.ValidationError("category cannot be changed after creation.")
        return value


class ProductPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPricing
        fields = ["price_id", "product", "wholesale_price", "retail_price", "effective_date", "is_current"]
        read_only_fields = ["price_id", "is_current"]
        # wholesale_price is optional at the serializer layer: the view resolves
        # it server-side (carried forward from the product's current price) for
        # non-admin submissions that omit it. See ProductPricingViewSet.
        extra_kwargs = {"wholesale_price": {"required": False}}

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
