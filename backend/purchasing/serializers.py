from decimal import Decimal
from rest_framework import serializers
from catalog.models import Category, Product
from purchasing.models import Supplier, Purchase, PurchaseItem


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["supplier_id", "name", "contact_person", "phone", "email", "address"]
        read_only_fields = ["supplier_id"]


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = [
            "purchase_item_id", "purchase", "product", "quantity", "unit_cost_paid",
            "unit_cost_invoiced", "price_discrepancy_note", "subtotal_paid", "subtotal_invoiced",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role == request.user.Role.ADMIN
        )
        if not is_admin:
            for field in ("unit_cost_paid", "unit_cost_invoiced", "subtotal_paid", "subtotal_invoiced"):
                data.pop(field, None)
        return data


class PurchaseSerializer(serializers.ModelSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)

    class Meta:
        model = Purchase
        fields = [
            "purchase_id", "supplier", "employee", "invoice_number", "purchase_date",
            "total_paid", "total_invoiced", "payment_status", "status", "items",
        ]
        read_only_fields = ["purchase_id", "employee", "total_paid", "total_invoiced", "status"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role == request.user.Role.ADMIN
        )
        if not is_admin:
            data.pop("total_paid", None)
            data.pop("total_invoiced", None)
        return data


class AddPurchaseItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False)
    name = serializers.CharField(required=False, max_length=150)
    brand = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    model_number = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    specifications = serializers.CharField(required=False, allow_blank=True, default="")
    usage_instructions = serializers.CharField(required=False, allow_blank=True, default="")
    warranty_months = serializers.IntegerField(required=False, default=0)
    reorder_level = serializers.IntegerField(required=False, default=5)
    selling_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=Decimal("0")
    )
    quantity = serializers.IntegerField(min_value=1)
    unit_cost_paid = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    unit_cost_invoiced = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    price_discrepancy_note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        is_new_product = attrs.get("product") is None
        if is_new_product:
            missing = [f for f in ("category", "name", "selling_price") if f not in attrs]
            if missing:
                raise serializers.ValidationError(
                    {f: "Required when not referencing an existing product." for f in missing}
                )
        attrs["_is_new_product"] = is_new_product
        return attrs
