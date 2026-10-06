from decimal import Decimal
from rest_framework import serializers
from catalog.models import Product
from finance.models import Payment
from finance.serializers import PaymentSerializer
from sales.models import Customer, Sale, SaleItem, SaleReturn, SaleReturnItem


def _is_admin_or_manager(context):
    request = context.get("request")
    return bool(
        request and request.user.is_authenticated
        and request.user.role in (request.user.Role.ADMIN, request.user.Role.MANAGER)
    )


class CustomerSerializer(serializers.ModelSerializer):
    # Open balance (completed sales not yet fully paid). The list view annotates
    # it in SQL; other paths fall back to a per-customer query.
    balance = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = ["customer_id", "name", "phone", "email", "address", "credit_limit", "balance"]
        read_only_fields = ["customer_id", "balance"]

    def get_balance(self, obj):
        value = getattr(obj, "open_balance", None)
        if value is None:
            from finance.services import customer_balance
            value = customer_balance(obj)
        return str(Decimal(value).quantize(Decimal("0.01")))

    def validate_credit_limit(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("The credit limit cannot be negative.")
        return value

    def validate_phone(self, value):
        if self.instance is not None and not (value or "").strip():
            from finance.services import customer_balance
            if customer_balance(self.instance) > 0:
                raise serializers.ValidationError("A customer who owes money must keep a phone number.")
        return value


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True, default=None)

    class Meta:
        model = SaleItem
        fields = [
            "sale_item_id", "sale", "product", "product_name", "quantity", "unit_price",
            "list_price", "subtotal", "tax_category", "tax_amount", "cost_at_sale",
            "discount_amount", "approved_by", "approved_by_name", "price_note",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Cost is never sent to sales staff or technicians.
        if not _is_admin_or_manager(self.context):
            data.pop("cost_at_sale", None)
        return data


class SaleReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="sale_item.product.name", read_only=True)

    class Meta:
        model = SaleReturnItem
        fields = ["return_item_id", "sale_item", "product_name", "quantity", "refund_amount", "condition"]
        read_only_fields = fields


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    class Meta:
        model = SaleReturn
        fields = [
            "return_id", "sale", "reason", "refund_method", "refund_reference", "refund_total",
            "paid_out", "balance_reduced", "refund_payment", "created_by", "created_by_name",
            "approved_by", "created_at", "items",
        ]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    returns = SaleReturnSerializer(many=True, read_only=True)
    balance = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True, default=None)
    employee_name = serializers.CharField(source="employee.full_name", read_only=True)
    voided_by_name = serializers.CharField(source="voided_by.full_name", read_only=True, default=None)
    discount_total = serializers.SerializerMethodField()
    can_void = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = [
            "sale_id", "customer", "customer_name", "customer_phone", "employee", "employee_name",
            "sale_date", "payment_method", "total_amount", "returned_amount", "amount_paid", "balance",
            "payment_status", "due_date", "status", "void_reason", "voided_by", "voided_by_name",
            "voided_at", "discount_total", "can_void", "items", "payments", "returns",
        ]
        read_only_fields = fields

    def get_discount_total(self, obj):
        # Discounts only (markups are negative discount_amount and don't count).
        total = sum((item.discount_amount for item in obj.items.all() if item.discount_amount > 0), Decimal("0"))
        return str(total.quantize(Decimal("0.01")))

    def get_can_void(self, obj):
        """Whether the sale can still be voided today (the role check is the caller's)."""
        from sales.services import is_same_business_day

        return (
            obj.status == Sale.SaleStatus.COMPLETED
            and is_same_business_day(obj)
            and not obj.returns.all()
        )


class ReturnLineInputSerializer(serializers.Serializer):
    sale_item = serializers.PrimaryKeyRelatedField(queryset=SaleItem.objects.select_related("product"))
    quantity = serializers.IntegerField(min_value=1)
    condition = serializers.ChoiceField(choices=SaleReturnItem.Condition.choices)
    refund_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )


class CreateReturnSerializer(serializers.Serializer):
    reason = serializers.CharField()
    refund_method = serializers.ChoiceField(choices=SaleReturn.RefundMethod.choices, required=False, allow_null=True)
    refund_reference = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    items = ReturnLineInputSerializer(many=True)


class VoidSaleSerializer(serializers.Serializer):
    reason = serializers.CharField()


class SaleItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    # Optional point-of-sale override (VAT-inclusive, like the catalog price).
    # Omitted means "sell at the current catalog retail price".
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False
    )
    # Why the price is what it is; required for a line below the price floor.
    price_note = serializers.CharField(required=False, allow_blank=True, default="")


class PriceCheckLineSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    unit_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False
    )


class PriceCheckSerializer(serializers.Serializer):
    items = PriceCheckLineSerializer(many=True)


class PaymentLineInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Payment.Method.choices)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    reference = serializers.CharField(required=False, allow_blank=True, default="", max_length=100)
    tendered = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0.01"), required=False, allow_null=True
    )


class ApprovalInputSerializer(serializers.Serializer):
    approver_username = serializers.CharField()
    pin = serializers.CharField()


class CreateSaleSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    # Legacy single-method form: one full payment in this method.
    payment_method = serializers.ChoiceField(
        choices=Sale.PaymentMethod.choices, required=False, allow_null=True
    )
    payments = PaymentLineInputSerializer(many=True, required=False)
    approval = ApprovalInputSerializer(required=False, allow_null=True)
    due_date = serializers.DateField(required=False, allow_null=True)
    items = SaleItemInputSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one line item is required.")
        return value
