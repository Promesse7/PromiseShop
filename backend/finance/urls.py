from django.urls import path
from rest_framework.routers import DefaultRouter

from finance.views import (
    ConfirmPurchasePaymentReviewView, CustomerDebtsView, DailyCloseViewSet, ExpenseViewSet,
    PaymentViewSet, ShopProfileView, SupplierDebtsView,
)

router = DefaultRouter()
router.register("daily-close", DailyCloseViewSet, basename="daily-close")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("payments", PaymentViewSet, basename="payment")

urlpatterns = router.urls + [
    path("shop-profile/", ShopProfileView.as_view(), name="shop-profile"),
    path("debts/customers/", CustomerDebtsView.as_view(), name="debts-customers"),
    path("debts/suppliers/", SupplierDebtsView.as_view(), name="debts-suppliers"),
    path(
        "debts/suppliers/purchases/<int:purchase_id>/confirm-review/",
        ConfirmPurchasePaymentReviewView.as_view(),
        name="debts-confirm-purchase-review",
    ),
]
