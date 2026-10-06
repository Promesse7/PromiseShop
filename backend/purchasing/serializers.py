from decimal import Decimal
from rest_framework import serializers
from catalog.models import Category, Product
from purchasing.costing import component_unit_costs, line_unit_costs
from purchasing.models import (
    BundleTemplate, BundleTemplateComponent, Purchase, PurchaseItem, PurchaseItemComponent, Supplier,
)


def _can_see_cost(context):
    request = context.get("request")
    return bool(
        request and request.user.is_authenticated
        and request.user.role in (request.user.Role.ADMIN, request.user.Role.MANAGER)
    )


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["supplier_id", "name", "contact_person", "phone", "email", "address"]
        read_only_fields = ["supplier_id"]


COMPONENT_COST_FIELDS = ("allocated_paid_cost", "allocated_invoiced_cost", "unit_paid_cost", "unit_invoiced_cost")


class PurchaseItemComponentSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    units = serializers.SerializerMethodField()
    unit_paid_cost = serializers.SerializerMethodField()
    unit_invoiced_cost = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseItemComponent
        fields = [
            "component_id", "product", "product_name", "product_barcode", "qty_per_bundle", "units",
            "allocated_paid_cost", "allocated_invoiced_cost", "unit_paid_cost", "unit_invoiced_cost",
        ]
        read_only_fields = fields

    def get_units(self, component):
        return component.purchase_item.quantity * component.qty_per_bundle

    def get_unit_paid_cost(self, component):
        return str(component_unit_costs(component)[0])

    def get_unit_invoiced_cost(self, component):
        return str(component_unit_costs(component)[1])

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if not _can_see_cost(self.context):
            for field in COMPONENT_COST_FIELDS:
                data.pop(field, None)
        return data


LINE_COST_FIELDS = (
    "unit_cost_paid", "unit_cost_invoiced", "subtotal_paid", "subtotal_invoiced",
    "unit_cost_paid_per_unit", "unit_cost_invoiced_per_unit",
)


class PurchaseItemSerializer(serializers.ModelSerializer):
    units_received = serializers.IntegerField(read_only=True)
    unit_cost_paid_per_unit = serializers.SerializerMethodField()
    unit_cost_invoiced_per_unit = serializers.SerializerMethodField()
    components = PurchaseItemComponentSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseItem
        fields = [
            "purchase_item_id", "purchase", "product", "line_kind", "units_per_pack", "bundle_name",
            "quantity", "units_received", "unit_cost_paid", "unit_cost_invoiced",
            "unit_cost_paid_per_unit", "unit_cost_invoiced_per_unit",
            "price_discrepancy_note", "subtotal_paid", "subtotal_invoiced", "components",
        ]
        read_only_fields = fields

    def get_unit_cost_paid_per_unit(self, item):
        return None if item.line_kind == PurchaseItem.LineKind.BUNDLE else str(line_unit_costs(item)[0])

    def get_unit_cost_invoiced_per_unit(self, item):
        return None if item.line_kind == PurchaseItem.LineKind.BUNDLE else str(line_unit_costs(item)[1])

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Cost figures are visible to admins and managers (the roles that run
        # purchasing); sales staff and technicians never see what was paid.
        if not _can_see_cost(self.context):
            for field in LINE_COST_FIELDS:
                data.pop(field, None)
        return data


class BulkPurchaseItemResultSerializer(PurchaseItemSerializer):
    """A saved bulk row, with what the frontend needs to print its labels.

    For a bundle line the product fields are null; its components carry theirs.
    """

    product_name = serializers.SerializerMethodField()
    product_barcode = serializers.SerializerMethodField()
    product_retail_price = serializers.SerializerMethodField()

    class Meta(PurchaseItemSerializer.Meta):
        fields = PurchaseItemSerializer.Meta.fields + ["product_name", "product_barcode", "product_retail_price"]
        read_only_fields = fields

    def get_product_name(self, item):
        return item.product.name if item.product else None

    def get_product_barcode(self, item):
        return item.product.barcode if item.product else None

    def get_product_retail_price(self, item):
        if item.product is None:
            return None
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
        if not _can_see_cost(self.context):
            data.pop("total_paid", None)
            data.pop("total_invoiced", None)
        return data


class BulkNewProductSerializer(serializers.Serializer):
    """The explicit "create this product" half of a purchase row or bundle component."""

    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    name = serializers.CharField(max_length=150)
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    brand = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    model_number = serializers.CharField(required=False, allow_blank=True, default="", max_length=80)
    specifications = serializers.CharField(required=False, allow_blank=True, default="")
    usage_instructions = serializers.CharField(required=False, allow_blank=True, default="")
    warranty_months = serializers.IntegerField(required=False, default=0, min_value=0)
    reorder_level = serializers.IntegerField(required=False, default=5, min_value=0)


class BundleComponentInputSerializer(serializers.Serializer):
    """One component of a bundle line: an existing product or an explicit new one."""

    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    new_product = BulkNewProductSerializer(required=False)
    qty_per_bundle = serializers.IntegerField(min_value=1)
    allocated_paid_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )
    allocated_invoiced_cost = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=Decimal("0"), required=False, allow_null=True
    )

    def validate(self, attrs):
        if (attrs.get("product") is None) == (attrs.get("new_product") is None):
            raise serializers.ValidationError(
                {"product": "Choose an existing product or explicitly create a new one (not both)."}
            )
        return attrs


class LineKindFieldsMixin(serializers.Serializer):
    """Fields shared by every "add a line" payload (Module F)."""

    line_kind = serializers.ChoiceField(
        choices=PurchaseItem.LineKind.choices, required=False, default=PurchaseItem.LineKind.SINGLE
    )
    units_per_pack = serializers.IntegerField(min_value=1, required=False, default=1)
    bundle_name = serializers.CharField(required=False, allow_blank=True, default="", max_length=150)
    components = BundleComponentInputSerializer(many=True, required=False)
    save_as_template = serializers.BooleanField(required=False, default=False)
    template_name = serializers.CharField(required=False, allow_blank=True, default="", max_length=150)

    def validate_line_kind_fields(self, attrs, *, has_product):
        if attrs.get("line_kind") == PurchaseItem.LineKind.BUNDLE:
            if has_product:
                raise serializers.ValidationError({"product": "A bundle line has components, not a product."})
            if not attrs.get("components"):
                raise serializers.ValidationError({"components": "A bundle needs at least one component."})
            if not (attrs.get("bundle_name") or "").strip():
                raise serializers.ValidationError({"bundle_name": "Name the bundle."})
        elif attrs.get("components"):
            raise serializers.ValidationError({"components": "Only a bundle line has components."})
        return attrs


class AddPurchaseItemSerializer(LineKindFieldsMixin):
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
        is_bundle = attrs.get("line_kind") == PurchaseItem.LineKind.BUNDLE
        self.validate_line_kind_fields(attrs, has_product=attrs.get("product") is not None)
        is_new_product = attrs.get("product") is None and not is_bundle
        if is_new_product:
            missing = [f for f in ("category", "name", "selling_price") if f not in attrs]
            if missing:
                raise serializers.ValidationError(
                    {f: "Required when not referencing an existing product." for f in missing}
                )
        attrs["_is_new_product"] = is_new_product
        return attrs

    def to_row(self):
        """The validated data in the shape services.add_row takes."""
        data = dict(self.validated_data)
        if data.pop("_is_new_product"):
            data["new_product"] = {
                key: data.pop(key) for key in (
                    "category", "name", "selling_price", "brand", "model_number", "specifications",
                    "usage_instructions", "warranty_months", "reorder_level",
                ) if key in data
            }
        return data


class BulkPurchaseItemRowSerializer(LineKindFieldsMixin):
    """One row of POST /purchases/<id>/items/bulk/.

    A single or pack row has exactly one of `product` (an existing catalog product)
    or `new_product` (an explicit request to create one) — a row naming neither is
    refused, so no product is ever created silently. A bundle row has neither: it
    has `components`, each of which follows the same rule.
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
        if attrs.get("line_kind") == PurchaseItem.LineKind.BUNDLE:
            self.validate_line_kind_fields(attrs, has_product=has_product or has_new)
        else:
            self.validate_line_kind_fields(attrs, has_product=has_product)
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
    # Pack lines: switch single <-> pack and change the pack size.
    line_kind = serializers.ChoiceField(
        choices=[PurchaseItem.LineKind.SINGLE, PurchaseItem.LineKind.PACK], required=False
    )
    units_per_pack = serializers.IntegerField(min_value=1, required=False)
    # Bundle lines.
    bundle_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    components = BundleComponentInputSerializer(many=True, required=False)


class BundleSplitPreviewSerializer(serializers.Serializer):
    unit_cost_paid = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))
    unit_cost_invoiced = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0"), required=False
    )
    components = BundleComponentInputSerializer(many=True)


class BundleTemplateComponentSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)

    class Meta:
        model = BundleTemplateComponent
        fields = ["template_component_id", "product", "product_name", "product_barcode", "qty_per_bundle"]
        read_only_fields = ["template_component_id", "product_name", "product_barcode"]


class BundleTemplateSerializer(serializers.ModelSerializer):
    components = BundleTemplateComponentSerializer(many=True)

    class Meta:
        model = BundleTemplate
        fields = ["template_id", "name", "supplier", "components", "created_by", "created_at"]
        read_only_fields = ["template_id", "created_by", "created_at"]

    def validate_components(self, value):
        if not value:
            raise serializers.ValidationError("A template needs at least one component.")
        products = [c["product"].pk for c in value]
        if len(products) != len(set(products)):
            raise serializers.ValidationError("Each product can appear only once in a template.")
        return value

    def validate_name(self, value):
        value = " ".join(value.split())
        if not value:
            raise serializers.ValidationError("Name the template.")
        return value

    def _write_components(self, template, components):
        template.components.all().delete()
        BundleTemplateComponent.objects.bulk_create([
            BundleTemplateComponent(template=template, product=c["product"], qty_per_bundle=c["qty_per_bundle"])
            for c in components
        ])

    def create(self, validated_data):
        components = validated_data.pop("components")
        template = BundleTemplate.objects.create(**validated_data)
        self._write_components(template, components)
        return template

    def update(self, instance, validated_data):
        components = validated_data.pop("components", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if components is not None:
            self._write_components(instance, components)
        return instance
