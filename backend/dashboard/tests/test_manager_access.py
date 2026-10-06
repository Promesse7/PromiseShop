"""Release Phase 0.7: managers can open every dashboard endpoint; staff can't."""
import pytest
from datetime import date
from rest_framework.test import APIClient

from accounts.models import Employee

pytestmark = pytest.mark.django_db

ENDPOINTS = [
    "/api/dashboard/sales-summary/?period=month",
    "/api/dashboard/stock-health/",
    "/api/dashboard/financial-snapshot/?period=month",
    "/api/dashboard/profitability/?period=month",
    "/api/dashboard/activity-feed/",
]


def client_for(role):
    Employee.objects.create_user(
        username="user1", password="pass12345", full_name="User",
        hire_date=date(2025, 1, 1), role=role,
    )
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": "user1", "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.mark.parametrize("url", ENDPOINTS)
def test_manager_can_open_dashboard_endpoint(url):
    assert client_for(Employee.Role.MANAGER).get(url).status_code == 200


@pytest.mark.parametrize("url", ENDPOINTS)
@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_cannot_open_dashboard_endpoint(url, role):
    assert client_for(role).get(url).status_code == 403
