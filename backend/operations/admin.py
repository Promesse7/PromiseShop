from django.contrib import admin

from operations.models import InternalConsumption, ShopAsset, ShopAssetEvent


@admin.register(InternalConsumption)
class InternalConsumptionAdmin(admin.ModelAdmin):
    list_display = ("consumption_id", "product", "quantity", "purpose", "total_value", "taken_by", "created_at")

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request):
        return False


@admin.register(ShopAsset)
class ShopAssetAdmin(admin.ModelAdmin):
    list_display = ("asset_id", "name", "status", "location", "assigned_to", "source", "is_spare")


@admin.register(ShopAssetEvent)
class ShopAssetEventAdmin(admin.ModelAdmin):
    list_display = ("event_id", "asset", "from_status", "to_status", "user", "created_at")

    def has_change_permission(self, request, obj=None):
        return False
