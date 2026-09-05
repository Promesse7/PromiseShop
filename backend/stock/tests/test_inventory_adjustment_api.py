import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory, InventoryAdjustment

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
def manager():
    return Employee.objects.create_user(
        username="manager1", password="managerpass", full_name="Manager One",
        hire_date=date(2025, 1, 1), role=Employee.Role.MANAGER,
    )


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def inventory():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    return Inventory.objects.create(product=product, quantity_in_stock=10, quantity_in_use=0, quantity_damaged=0)


def adjust(client, inventory, **payload):
    return client.post(f"/api/inventory/{inventory.inventory_id}/adjust/", payload, format="json")


def test_count_correction_sets_in_stock_and_records_before_and_after(admin, inventory):
    client = auth_client(admin, "adminpass")
    response = adjust(client, inventory, adjustment_type="count_correction", quantity=7, reason="Stock take")
    assert response.status_code == 201
    body = response.json()
    assert body["adjustment_type"] == "count_correction"
    assert body["before_in_stock"] == 10
    assert body["after_in_stock"] == 7
    assert body["reason"] == "Stock take"
    assert body["changed_by"] == admin.pk
    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 7


def test_move_to_damaged_and_back(admin, inventory):
    client = auth_client(admin, "adminpass")
    assert adjust(client, inventory, adjustment_type="to_damaged", quantity=3, reason="Dropped in store").status_code == 201
    inventory.refresh_from_db()
    assert (inventory.quantity_in_stock, inventory.quantity_damaged) == (7, 3)

    assert adjust(client, inventory, adjustment_type="from_damaged", quantity=1, reason="Repaired").status_code == 201
    inventory.refresh_from_db()
    assert (inventory.quantity_in_stock, inventory.quantity_damaged) == (8, 2)


def test_move_to_in_use_and_back(admin, inventory):
    client = auth_client(admin, "adminpass")
    assert adjust(client, inventory, adjustment_type="to_in_use", quantity=2, reason="Demo units").status_code == 201
    inventory.refresh_from_db()
    assert (inventory.quantity_in_stock, inventory.quantity_in_use) == (8, 2)

    assert adjust(client, inventory, adjustment_type="from_in_use", quantity=2, reason="Demo over").status_code == 201
    inventory.refresh_from_db()
    assert (inventory.quantity_in_stock, inventory.quantity_in_use) == (10, 0)


def test_move_cannot_exceed_the_source_bucket(admin, inventory):
    client = auth_client(admin, "adminpass")
    response = adjust(client, inventory, adjustment_type="to_damaged", quantity=11, reason="Flood")
    assert response.status_code == 400
    assert "only 10" in str(response.json())
    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 10
    assert InventoryAdjustment.objects.count() == 0


def test_reason_is_required(admin, inventory):
    client = auth_client(admin, "adminpass")
    assert adjust(client, inventory, adjustment_type="count_correction", quantity=5, reason="").status_code == 400
    assert adjust(client, inventory, adjustment_type="count_correction", quantity=5).status_code == 400
    assert InventoryAdjustment.objects.count() == 0


def test_count_correction_rejects_negative_and_moves_reject_zero(admin, inventory):
    client = auth_client(admin, "adminpass")
    assert adjust(client, inventory, adjustment_type="count_correction", quantity=-1, reason="x").status_code == 400
    assert adjust(client, inventory, adjustment_type="to_damaged", quantity=0, reason="x").status_code == 400
    assert adjust(client, inventory, adjustment_type="bogus", quantity=1, reason="x").status_code == 400


def test_manager_allowed_staff_forbidden(manager, staff, inventory):
    assert adjust(auth_client(manager, "managerpass"), inventory, adjustment_type="count_correction", quantity=9, reason="Recount").status_code == 201
    assert adjust(auth_client(staff, "staffpass"), inventory, adjustment_type="count_correction", quantity=1, reason="Recount").status_code == 403
    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 9


def test_adjustment_history_is_listed_newest_first(admin, inventory):
    client = auth_client(admin, "adminpass")
    adjust(client, inventory, adjustment_type="count_correction", quantity=9, reason="First")
    adjust(client, inventory, adjustment_type="to_damaged", quantity=1, reason="Second")
    response = client.get(f"/api/inventory/{inventory.inventory_id}/adjustments/")
    assert response.status_code == 200
    reasons = [row["reason"] for row in response.json()]
    assert reasons == ["Second", "First"]
    assert response.json()[0]["before_in_stock"] == 9
    assert response.json()[0]["after_damaged"] == 1


def test_adjustment_history_is_visible_to_staff_too(staff, admin, inventory):
    adjust(auth_client(admin, "adminpass"), inventory, adjustment_type="count_correction", quantity=9, reason="Recount")
    response = auth_client(staff, "staffpass").get(f"/api/inventory/{inventory.inventory_id}/adjustments/")
    assert response.status_code == 200
    assert len(response.json()) == 1
