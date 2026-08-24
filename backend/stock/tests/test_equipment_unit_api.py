import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import EquipmentUnit

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
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


def test_register_equipment_unit(employee, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/equipment-units/",
        {
            "product": product.product_id, "serial_number": "SPK-0001",
            "status": "in_stock", "storage_location": "Shelf A1",
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["serial_number"] == "SPK-0001"
    assert body["status_history"] == []


def test_list_filtered_by_product(employee, product, category):
    other_product = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Mic")
    EquipmentUnit.objects.create(product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=other_product, serial_number="B1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/equipment-units/?product={product.product_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["serial_number"] == "A1"


def test_patch_storage_location_and_condition_notes(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/",
        {"storage_location": "Shelf C3", "condition_notes": "Minor scuff"},
        format="json",
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.storage_location == "Shelf C3"
    assert unit.condition_notes == "Minor scuff"


def test_patch_status_is_ignored(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/", {"status": "sold"}, format="json"
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.status == EquipmentUnit.UnitStatus.IN_STOCK


def test_patch_serial_number_is_ignored(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/", {"serial_number": "HACKED"}, format="json"
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.serial_number == "A1"


def test_delete_returns_405(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.delete(f"/api/equipment-units/{unit.unit_id}/")
    assert response.status_code == 405


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/equipment-units/")
    assert response.status_code == 401
