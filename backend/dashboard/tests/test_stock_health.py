import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory, EquipmentUnit

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
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def test_low_stock_count(admin, category):
    low_product = Product.objects.create(
        category=category, barcode="PES-AUD-00001", name="Low", reorder_level=5,
    )
    ok_product = Product.objects.create(
        category=category, barcode="PES-AUD-00002", name="OK", reorder_level=5,
    )
    Inventory.objects.create(product=low_product, quantity_in_stock=2)
    Inventory.objects.create(product=ok_product, quantity_in_stock=50)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    assert response.json()["low_stock_count"] == 1


def test_equipment_status_counts_include_zero_statuses(admin, category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00003", name="Speaker")
    EquipmentUnit.objects.create(product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=product, serial_number="A2", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=product, serial_number="A3", status=EquipmentUnit.UnitStatus.SOLD)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    counts = response.json()["equipment_status_counts"]
    assert counts["in_stock"] == 2
    assert counts["sold"] == 1
    assert counts["damaged"] == 0
    assert counts["under_repair"] == 0
    assert counts["in_use"] == 0
    assert set(counts.keys()) == {"in_stock", "in_use", "damaged", "under_repair", "sold"}


def test_stock_health_empty_state(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    body = response.json()
    assert body["low_stock_count"] == 0
    assert all(count == 0 for count in body["equipment_status_counts"].values())


def test_stock_health_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 403


def test_stock_health_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 401
