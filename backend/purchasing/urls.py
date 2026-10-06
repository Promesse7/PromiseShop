from django.urls import path
from rest_framework.routers import DefaultRouter
from purchasing.views import BundleSplitPreviewView, BundleTemplateViewSet, SupplierViewSet, PurchaseViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchases", PurchaseViewSet, basename="purchase")
router.register("bundle-templates", BundleTemplateViewSet, basename="bundle-template")

urlpatterns = [
    path("purchasing/bundle-split-preview/", BundleSplitPreviewView.as_view(), name="bundle-split-preview"),
] + router.urls
