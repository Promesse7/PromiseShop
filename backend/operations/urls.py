from rest_framework.routers import DefaultRouter

from operations.views import ConsumptionViewSet, ShopAssetViewSet

router = DefaultRouter()
router.register("operations/consumptions", ConsumptionViewSet, basename="consumption")
router.register("operations/assets", ShopAssetViewSet, basename="shop-asset")

urlpatterns = router.urls
