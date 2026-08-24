from django.urls import path

from dashboard.views import SalesSummaryView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
]
