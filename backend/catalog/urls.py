from rest_framework.routers import DefaultRouter
from catalog.views import CategoryViewSet, ProductViewSet, ProductPricingViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("product-pricing", ProductPricingViewSet, basename="product-pricing")

urlpatterns = router.urls
