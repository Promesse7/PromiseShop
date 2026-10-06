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
        # Cost figures are visible to admins and managers (the roles that run
        # purchasing); sales staff and technicians never see what was paid.
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role in (request.user.Role.ADMIN, request.user.Role.MANAGER)
        )
        if not is_admin:
            for field in ("unit_cost_paid", "unit_cost_invoiced", "subtotal_paid", "subtotal_invoiced"):
                data.pop(field, None)
        return data


class BulkPurchaseItemResultSerializer(PurchaseItemSerializer):
    """A saved bulk row, with what the frontend needs to print its labels."""

    product_name = serializers.CharField(source="product.name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    product_retail_price = serializers.SerializerMethodField()

    class Meta(PurchaseItemSerializer.Meta):
        fields = PurchaseItemSerializer.Meta.fields + ["product_name", "product_barcode", "product_retail_price"]
        read_only_fields = fields

    def get_product_retail_price(self, item):
        price = item.product.pricing_history.filter(is_current=True).values_list("retail_price", flat=True).first()
        return str(price) if price is not None else None


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
        # Cost figures are visible to admins and managers (the roles that run
        # purchasing); sales staff and technicians never see what was paid.
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role in (request.user.Role.ADMIN, request.user.Role.MANAGER)
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


class BulkNewProductSerializer(serializers.Serializer):
    """The explicit "create this product" half of a bulk purchase row."""

    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    name = serializers.CharField(max_length=150)
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    brand = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    model_number = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    specifications = serializers.CharField(required=False, allow_blank=True, default="")
    usage_instructions = serializers.CharField(required=False, allow_blank=True, default="")
    warranty_months = serializers.IntegerField(required=False, default=0, min_value=0)
    reorder_level = serializers.IntegerField(required=False, default=5, min_value=0)


class BulkPurchaseItemRowSerializer(serializers.Serializer):
    """One row of POST /purchases/<id>/items/bulk/.

    Exactly one of `product` (an existing catalog product) or `new_product` (an
    explicit request to create one) — a row naming neither is refused, so no
    product is ever created silently.
    """

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    new_product = BulkNewProductSerializer(required=False)
    quantity = serializers.IntegerField(min_value=1)
    unit_cost_paid = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    unit_cost_invoiced = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    price_discrepancy_note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        has_product = attrs.get("product") is not None
        has_new = attrs.get("new_product") is not None
        if has_product == has_new:
            raise serializers.ValidationError(
                {"product": "Choose an existing product or explicitly create a new one (not both)."}
            )
        if attrs["unit_cost_paid"] != attrs["unit_cost_invoiced"] and not attrs.get("price_discrepancy_note"):
            raise serializers.ValidationError({
                "price_discrepancy_note": "Required when unit_cost_paid differs from unit_cost_invoiced."
            })
        return attrs


class UpdatePurchaseItemSerializer(serializers.Serializer):
    """PATCH /purchases/<id>/items/<item_id>/ — any subset of these fields."""

    quantity = serializers.IntegerField(min_value=1, required=False)
    unit_cost_paid = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    unit_cost_invoiced = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    price_discrepancy_note = serializers.CharField(required=False, allow_blank=True)

