from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import EmployeeTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("catalog.urls")),
    path("api/", include("purchasing.urls")),
    path("api/", include("sales.urls")),
    path("api/", include("stock.urls")),
    path("api/", include("finance.urls")),
    path("api/auth/login/", EmployeeTokenObtainPairView.as_view(), name="auth-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
]
