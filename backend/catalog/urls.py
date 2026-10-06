from rest_framework.routers import DefaultRouter
from django.urls import path

from catalog.views import CategoryViewSet, ImportProductsView, ImportTemplateView, ProductPricingViewSet, ProductViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("products", ProductViewSet, basename="product")
router.register("product-pricing", ProductPricingViewSet, basename="product-pricing")

urlpatterns = [
    path("setup/import-products/", ImportProductsView.as_view(), name="import-products"),
    path("setup/import-products/template/", ImportTemplateView.as_view(), name="import-products-template"),
] + router.urls
