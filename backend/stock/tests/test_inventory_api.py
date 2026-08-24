import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory

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
    return Product.objects.create(
        category=category, barcode="PES-AUD-00001", name="Speaker", reorder_level=5,
    )


def test_list_inventory(employee, product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.get("/api/inventory/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_retrieve_inventory_includes_is_low_stock_false(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 200
    assert response.json()["is_low_stock"] is False


def test_retrieve_inventory_includes_is_low_stock_true(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=3)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 200
    assert response.json()["is_low_stock"] is True


def test_low_stock_filter(employee, category):
    low_product = Product.objects.create(
        category=category, barcode="PES-AUD-00002", name="Low Item", reorder_level=5,
    )
    ok_product = Product.objects.create(
        category=category, barcode="PES-AUD-00003", name="OK Item", reorder_level=5,
    )
    Inventory.objects.create(product=low_product, quantity_in_stock=2)
    Inventory.objects.create(product=ok_product, quantity_in_stock=50)
    client = auth_client(employee, "staffpass")
    response = client.get("/api/inventory/?low_stock=true")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["product"] == low_product.product_id


def test_patch_storage_location_succeeds(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/inventory/{inventory.inventory_id}/", {"storage_location": "Shelf B2"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["storage_location"] == "Shelf B2"
    inventory.refresh_from_db()
    assert inventory.storage_location == "Shelf B2"


def test_patch_quantity_is_ignored(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/inventory/{inventory.inventory_id}/", {"quantity_in_stock": 999}, format="json"
    )
    assert response.status_code == 200
    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 10


def test_post_returns_405(employee, product):
    client = auth_client(employee, "staffpass")
    response = client.post("/api/inventory/", {"product": product.product_id}, format="json")
    assert response.status_code == 405


def test_delete_returns_405(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.delete(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 405


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/inventory/")
    assert response.status_code == 401
