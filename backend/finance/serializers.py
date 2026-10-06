from decimal import Decimal

from rest_framework import serializers

from finance.models import Expense, Payment, ShopProfile
from purchasing.models import Purchase
from sales.models import Customer


class ExpenseSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )

    class Meta:
        model = Expense
        fields = [
            "expense_id", "category", "amount", "expense_date",
            "description", "recorded_by",
        ]
        read_only_fields = ["expense_id", "recorded_by"]

    def create(self, validated_data):
        validated_data["recorded_by"] = self.context["request"].user
        return super().create(validated_data)


class ShopProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopProfile
        fields = ["business_name", "tin", "po_box", "phone", "email", "address"]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True)
    customer = serializers.IntegerField(source="sale.customer_id", read_only=True, default=None)
    supplier = serializers.IntegerField(source="purchase.supplier_id", read_only=True, default=None)
    is_reversed = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "payment_id", "direction", "sale", "purchase", "customer", "supplier", "amount",
            "method", "reference", "paid_at", "recorded_by", "recorded_by_name", "note",
            "receipt_group", "reversal_of", "is_reversed", "created_at",
        ]
        read_only_fields = fields

    def get_is_reversed(self, obj):
        return hasattr(obj, "reversal") and obj.reversal is not None


class _PaymentInputBase(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    reference = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class CustomerPaymentInputSerializer(_PaymentInputBase):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.all())
    sale_ids = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)


class SupplierPaymentInputSerializer(_PaymentInputBase):
    purchase = serializers.PrimaryKeyRelatedField(queryset=Purchase.objects.all())


class ReversePaymentInputSerializer(serializers.Serializer):
    reason = serializers.CharField()
