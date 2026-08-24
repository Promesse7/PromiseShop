import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from sales.models import Customer, Sale
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
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=10)
    return product


def test_complete_sale_via_api(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 2}]},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["total_amount"] == "200.00"
    assert body["status"] == "completed"
    assert len(body["items"]) == 1
    assert body["items"][0]["subtotal"] == "200.00"


def test_walk_in_sale_via_api(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["customer"] is None


def test_sale_with_customer_via_api(employee, admin, product):
    customer = Customer.objects.create(name="Jean Claude")
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {
            "customer": customer.customer_id, "payment_method": "cash",
            "items": [{"product": product.product_id, "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["customer"] == customer.customer_id


def test_insufficient_stock_returns_400(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 99}]},
        format="json",
    )
    assert response.status_code == 400


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/sales/")
    assert response.status_code == 401


def test_patch_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.patch(f"/api/sales/{sale_id}/", {"payment_method": "card"}, format="json")
    assert response.status_code == 405


def test_put_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.put(f"/api/sales/{sale_id}/", {"payment_method": "card"}, format="json")
    assert response.status_code == 405


def test_delete_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.delete(f"/api/sales/{sale_id}/")
    assert response.status_code == 405


def test_return_via_api_restores_inventory(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 3}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    assert Inventory.objects.get(product=product).quantity_in_stock == 7

    response = client.post(f"/api/sales/{sale_id}/return/")
    assert response.status_code == 200
    assert response.json()["status"] == "returned"
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_cancel_via_api_restores_inventory(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 2}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.post(f"/api/sales/{sale_id}/cancel/")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_return_twice_returns_400(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    client.post(f"/api/sales/{sale_id}/return/")
    second_response = client.post(f"/api/sales/{sale_id}/return/")
    assert second_response.status_code == 400
