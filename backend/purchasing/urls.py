from rest_framework.routers import DefaultRouter
from purchasing.views import SupplierViewSet, PurchaseViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchases", PurchaseViewSet, basename="purchase")

urlpatterns = router.urls
