from django.urls import path

from dashboard.views import (
    ActivityFeedView,
    MoneyAlertsView,
    MoneyChainView,
    MoneyLeakageView,
    MoneyPeopleView,
    MoneyProductView,
    MoneySummaryView,
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
    path("dashboard/summary/", MoneySummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/chain/", MoneyChainView.as_view(), name="dashboard-chain"),
    path("dashboard/leakage/", MoneyLeakageView.as_view(), name="dashboard-leakage"),
    path("dashboard/products/<int:product_id>/", MoneyProductView.as_view(), name="dashboard-product"),
    path("dashboard/people/", MoneyPeopleView.as_view(), name="dashboard-people"),
    path("dashboard/alerts/", MoneyAlertsView.as_view(), name="dashboard-alerts"),
]
