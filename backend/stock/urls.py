from rest_framework.routers import DefaultRouter
from stock.views import InventoryViewSet, EquipmentUnitViewSet

router = DefaultRouter()
router.register("inventory", InventoryViewSet, basename="inventory")
router.register("equipment-units", EquipmentUnitViewSet, basename="equipment-unit")

urlpatterns = router.urls
