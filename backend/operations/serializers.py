from rest_framework import serializers

from accounts.models import Employee
from catalog.models import Product
from operations.models import InternalConsumption, ShopAsset, ShopAssetEvent
from stock.models import EquipmentUnit, StockMovement

STAFF_ROLES = (Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN)


def _is_staff(context):
    request = context.get("request")
    user = getattr(request, "user", None)
    return user is None or getattr(user, "role", None) in STAFF_ROLES


def _name(employee):
    return employee.full_name if employee else None


class CostHidingSerializer(serializers.ModelSerializer):
    """Drops money fields for sales staff and technicians (they never see cost)."""

    cost_fields = ()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if _is_staff(self.context):
            for field in self.cost_fields:
                data.pop(field, None)
        return data


class InternalConsumptionSerializer(CostHidingSerializer):
    cost_fields = ("unit_cost", "total_value")
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    taken_by_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    shop_asset_name = serializers.SerializerMethodField()

    class Meta:
        model = InternalConsumption
        fields = [
            "consumption_id", "product", "product_name", "product_barcode", "quantity", "unit_cost",
            "total_value", "purpose", "reason", "taken_by", "taken_by_name", "recorded_by", "recorded_by_name",
            "approved_by", "approved_by_name", "shop_asset", "shop_asset_name", "created_at",
        ]
        read_only_fields = fields

    def get_taken_by_name(self, obj):
        return _name(obj.taken_by)

    def get_recorded_by_name(self, obj):
        return _name(obj.recorded_by)

    def get_approved_by_name(self, obj):
        return _name(obj.approved_by)

    def get_shop_asset_name(self, obj):
        return obj.shop_asset.name if obj.shop_asset_id else None


class ShopAssetSerializer(CostHidingSerializer):
    cost_fields = ("acquisition_value",)
    product_name = serializers.SerializerMethodField()
    product_barcode = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    replaces_name = serializers.SerializerMethodField()
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ShopAsset
        fields = [
            "asset_id", "name", "product", "product_name", "product_barcode", "equipment_unit", "serial",
            "status", "status_label", "location", "assigned_to", "assigned_to_name", "source", "acquired_at",
            "acquisition_value", "is_spare", "replaces", "replaces_name", "notes", "created_by",
            "created_by_name", "created_at",
        ]
        read_only_fields = fields

    def get_product_name(self, obj):
        return obj.product.name if obj.product_id else None

    def get_product_barcode(self, obj):
        return obj.product.barcode if obj.product_id else None

    def get_assigned_to_name(self, obj):
        return _name(obj.assigned_to)

    def get_created_by_name(self, obj):
        return _name(obj.created_by)

    def get_replaces_name(self, obj):
        return obj.replaces.name if obj.replaces_id else None


class ShopAssetEventSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    replaced_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ShopAssetEvent
        fields = [
            "event_id", "asset", "from_status", "to_status", "reason", "user", "user_name", "approved_by",
            "approved_by_name", "replaced_by", "replaced_by_name", "consumption", "created_at",
        ]
        read_only_fields = fields

    def get_user_name(self, obj):
        return _name(obj.user)

    def get_approved_by_name(self, obj):
        return _name(obj.approved_by)

    def get_replaced_by_name(self, obj):
        return obj.replaced_by.name if obj.replaced_by_id else None


# --- inputs ------------------------------------------------------------------

class ApprovalSerializer(serializers.Serializer):
    approver_username = serializers.CharField()
    pin = serializers.CharField()


class ConsumeSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    purpose = serializers.ChoiceField(choices=InternalConsumption.Purpose.choices)
    reason = serializers.CharField()
    taken_by = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    shop_asset = serializers.PrimaryKeyRelatedField(queryset=ShopAsset.objects.all(), required=False, allow_null=True)
    approval = ApprovalSerializer(required=False, allow_null=True)


class RegisterAssetSerializer(serializers.Serializer):
    name = serializers.CharField()
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False, allow_null=True)
    serial = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    status = serializers.ChoiceField(choices=ShopAsset.Status.choices, required=False)
    location = serializers.CharField(required=False, allow_blank=True)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    acquired_at = serializers.DateField(required=False, allow_null=True)
    acquisition_value = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=0, required=False,
                                                 allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    is_spare = serializers.BooleanField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True)


class _UnitPickMixin(serializers.Serializer):
    def _resolve_unit(self, attrs, unit_key, serial_key, product):
        unit = attrs.pop(unit_key, None)
        serial = (attrs.pop(serial_key, "") or "").strip()
        if unit is None and serial:
            unit = EquipmentUnit.objects.filter(serial_number__iexact=serial).first()
            if unit is None:
                raise serializers.ValidationError({serial_key: f"No unit with serial {serial}."})
        if unit is not None and product is not None and unit.product_id != product.pk:
            raise serializers.ValidationError({serial_key: "That serial belongs to another product."})
        return unit


class FromStockSerializer(_UnitPickMixin):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    unit = serializers.PrimaryKeyRelatedField(queryset=EquipmentUnit.objects.all(), required=False, allow_null=True)
    serial = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    is_spare = serializers.BooleanField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    reason = serializers.CharField()
    approval = ApprovalSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        attrs["unit"] = self._resolve_unit(attrs, "unit", "serial", attrs["product"])
        return attrs


class StatusSerializer(serializers.Serializer):
    to_status = serializers.ChoiceField(choices=ShopAsset.Status.choices)
    reason = serializers.CharField()
    approval = ApprovalSerializer(required=False, allow_null=True)


class ReplaceSerializer(_UnitPickMixin):
    new_status = serializers.ChoiceField(choices=ShopAsset.Status.choices)
    reason = serializers.CharField()
    replacement_product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), required=False, allow_null=True
    )
    replacement_unit = serializers.PrimaryKeyRelatedField(
        queryset=EquipmentUnit.objects.all(), required=False, allow_null=True
    )
    replacement_serial = serializers.CharField(required=False, allow_blank=True)
    spare_asset = serializers.PrimaryKeyRelatedField(queryset=ShopAsset.objects.all(), required=False, allow_null=True)
    name = serializers.CharField(required=False, allow_blank=True)
    location = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    assigned_to = serializers.PrimaryKeyRelatedField(queryset=Employee.objects.all(), required=False, allow_null=True)
    approval = ApprovalSerializer(required=False, allow_null=True)

    def validate(self, attrs):
        unit = self._resolve_unit(attrs, "replacement_unit", "replacement_serial", attrs.get("replacement_product"))
        if unit is not None and attrs.get("replacement_product") is None:
            attrs["replacement_product"] = unit.product
        attrs["replacement_unit"] = unit
        return attrs


class ReturnToStockSerializer(serializers.Serializer):
    bucket = serializers.ChoiceField(choices=[StockMovement.Bucket.IN_STOCK, StockMovement.Bucket.DAMAGED])
    reason = serializers.CharField()
