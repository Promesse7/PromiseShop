from decimal import Decimal

from rest_framework import serializers

from accounts.models import Employee
from finance.models import DailyClose, Expense, Payment, ShopProfile
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
    max_staff_discount_pct = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100"), required=False
    )

    class Meta:
        model = ShopProfile
        fields = [
            "business_name", "tin", "po_box", "phone", "email", "address", "max_staff_discount_pct",
        ]


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


class DailyCloseSerializer(serializers.ModelSerializer):
    cashier_name = serializers.CharField(source="cashier.full_name", read_only=True)
    closed_by_name = serializers.CharField(source="closed_by.full_name", read_only=True)

    class Meta:
        model = DailyClose
        fields = [
            "close_id", "cashier", "cashier_name", "business_date", "opening_float", "expected_cash",
            "expected_by_method", "summary", "counted_cash", "variance", "note", "closed_by",
            "closed_by_name", "closed_at",
        ]
        read_only_fields = fields


class DailyCloseApprovalSerializer(serializers.Serializer):
    approver_username = serializers.CharField()
    pin = serializers.CharField()


class CreateDailyCloseSerializer(serializers.Serializer):
    # Omitted: the signed-in employee closes their own day.
    cashier = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    business_date = serializers.DateField()
    opening_float = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"), default=Decimal("0"))
    counted_cash = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0"))
    note = serializers.CharField(required=False, allow_blank=True, default="")
    approval = DailyCloseApprovalSerializer()
