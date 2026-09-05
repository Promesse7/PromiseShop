from django.urls import path

from dashboard.views import (
    ActivityFeedView,
    FinancialSnapshotView,
    ProfitabilityView,
    SalesSummaryView,
    StockHealthView,
)

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
    path("dashboard/stock-health/", StockHealthView.as_view(), name="dashboard-stock-health"),
    path("dashboard/financial-snapshot/", FinancialSnapshotView.as_view(), name="dashboard-financial-snapshot"),
    path("dashboard/profitability/", ProfitabilityView.as_view(), name="dashboard-profitability"),
    path("dashboard/activity-feed/", ActivityFeedView.as_view(), name="dashboard-activity-feed"),
]
