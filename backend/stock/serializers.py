from rest_framework import serializers

from accounts.models import Employee
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory


class InventorySerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            "inventory_id", "product", "quantity_in_stock", "quantity_in_use",
            "quantity_damaged", "storage_location", "last_updated", "is_low_stock",
        ]
        read_only_fields = [
            "inventory_id", "product", "quantity_in_stock", "quantity_in_use",
            "quantity_damaged", "last_updated", "is_low_stock",
        ]

    def get_is_low_stock(self, obj):
        return obj.quantity_in_stock <= obj.product.reorder_level


class EquipmentStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentStatusHistory
        fields = ["history_id", "previous_status", "new_status", "changed_by", "change_date", "notes"]
        read_only_fields = fields


class EquipmentUnitSerializer(serializers.ModelSerializer):
    status_history = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentUnit
        fields = [
            "unit_id", "product", "serial_number", "status", "assigned_to",
            "storage_location", "condition_notes", "status_changed_at", "status_history",
        ]
        read_only_fields = ["unit_id", "status", "status_changed_at", "status_history"]

    def get_status_history(self, obj):
        history = obj.status_history.order_by("-change_date")
        return EquipmentStatusHistorySerializer(history, many=True).data


class EquipmentUnitUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentUnit
        fields = ["storage_location", "condition_notes", "assigned_to"]


class ChangeStatusSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=EquipmentUnit.UnitStatus.choices)
    reason = serializers.CharField()
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True
    )
