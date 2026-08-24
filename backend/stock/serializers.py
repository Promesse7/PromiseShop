from rest_framework import serializers

from stock.models import Inventory


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
