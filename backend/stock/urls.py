from rest_framework.routers import DefaultRouter
from stock.views import InventoryViewSet

router = DefaultRouter()
router.register("inventory", InventoryViewSet, basename="inventory")

urlpatterns = router.urls
