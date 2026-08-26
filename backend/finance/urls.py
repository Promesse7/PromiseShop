from django.urls import path
from rest_framework.routers import DefaultRouter

from finance.views import ExpenseViewSet, ShopProfileView

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")

urlpatterns = router.urls + [
    path("shop-profile/", ShopProfileView.as_view(), name="shop-profile"),
]
