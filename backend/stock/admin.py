from django.contrib import admin
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory, StockMovement

admin.site.register(Inventory)
admin.site.register(EquipmentUnit)
admin.site.register(EquipmentStatusHistory)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    """Read-only: the ledger is append-only and written by services."""

    list_display = ["created_at", "product", "movement_type", "bucket", "quantity_delta", "balance_after", "created_by"]
    list_filter = ["movement_type", "bucket"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
