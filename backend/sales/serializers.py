from rest_framework import serializers
from catalog.models import Product
from sales.models import Customer, Sale, SaleItem


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["customer_id", "name", "phone", "email", "address"]
        read_only_fields = ["customer_id"]


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = [
            "sale_item_id", "sale", "product", "quantity", "unit_price", "subtotal",
            "tax_category", "tax_amount",
        ]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "sale_id", "customer", "employee", "sale_date", "payment_method",
            "total_amount", "status", "items",
        ]
        read_only_fields = ["sale_id", "employee", "sale_date", "total_amount", "status", "items"]


class SaleItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class CreateSaleSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    payment_method = serializers.ChoiceField(
        choices=Sale.PaymentMethod.choices, required=False, allow_null=True
    )
    items = SaleItemInputSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one line item is required.")
        return value
