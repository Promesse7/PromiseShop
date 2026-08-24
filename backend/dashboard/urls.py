from django.urls import path

from dashboard.views import FinancialSnapshotView, SalesSummaryView, StockHealthView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
    path("dashboard/stock-health/", StockHealthView.as_view(), name="dashboard-stock-health"),
    path("dashboard/financial-snapshot/", FinancialSnapshotView.as_view(), name="dashboard-financial-snapshot"),
]
