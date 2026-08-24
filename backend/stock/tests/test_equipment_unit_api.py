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
    assert "status_history" not in body["results"][0]


def test_patch_storage_location_and_condition_notes(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    status_changed_at_before = unit.status_changed_at
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
    assert unit.status_changed_at == status_changed_at_before


def test_patch_response_contains_full_resource(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/",
        {"storage_location": "Shelf C3"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    for key in ["unit_id", "product", "serial_number", "status", "status_changed_at", "status_history"]:
        assert key in body
    assert body["serial_number"] == "A1"
    assert body["status"] == "in_stock"


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


def test_change_status_via_api_and_history_nests(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "under_repair", "reason": "Speaker rattling"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "under_repair"
    assert len(body["status_history"]) == 1
    assert body["status_history"][0]["previous_status"] == "in_stock"
    assert body["status_history"][0]["new_status"] == "under_repair"


def test_change_status_missing_reason_returns_400(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "under_repair"},
        format="json",
    )
    assert response.status_code == 400


def test_change_status_invalid_status_returns_400(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "not_real", "reason": "test"},
        format="json",
    )
    assert response.status_code == 400
