import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from finance.models import ShopProfile

pytestmark = pytest.mark.django_db


def auth_client(employee, password):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": employee.username, "password": password}, format="json"
    )
    token = response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_returns_seeded_business_info(staff):
    ShopProfile.objects.filter(pk=1).update(
        business_name="Promise Electronic Shop", tin="123456789",
        po_box="PO Box 1", phone="+250700000000", email="shop@example.com",
        address="Kigali, Rwanda",
    )
    client = auth_client(staff, "staffpass")
    response = client.get("/api/shop-profile/")
    assert response.status_code == 200
    body = response.json()
    assert body["business_name"] == "Promise Electronic Shop"
    assert body["tin"] == "123456789"
    assert body["address"] == "Kigali, Rwanda"


def test_creates_default_profile_when_none_exists(staff):
    ShopProfile.objects.filter(pk=1).delete()
    client = auth_client(staff, "staffpass")
    response = client.get("/api/shop-profile/")
    assert response.status_code == 200
    assert response.json()["business_name"] == "Promise Electronic Shop"


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/shop-profile/")
    assert response.status_code == 401
