from rest_framework.routers import DefaultRouter
from stock.views import InventoryViewSet, EquipmentUnitViewSet, StockMovementViewSet

router = DefaultRouter()
router.register("stock/movements", StockMovementViewSet, basename="stock-movement")
router.register("inventory", InventoryViewSet, basename="inventory")
router.register("equipment-units", EquipmentUnitViewSet, basename="equipment-unit")

urlpatterns = router.urls
