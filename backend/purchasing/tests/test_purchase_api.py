import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Supplier, Purchase, PurchaseItem
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
def supplier():
    return Supplier.objects.create(name="Kigali Electronics Ltd")


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


@pytest.fixture
def draft_purchase(employee, supplier):
    return Purchase.objects.create(supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1))


def test_create_draft_purchase(employee, supplier):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/purchases/",
        {"supplier": supplier.supplier_id, "invoice_number": "KE-8841", "purchase_date": "2026-01-01"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["total_paid"] == "0.00"


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/purchases/")
    assert response.status_code == 401


def test_add_existing_product_item_via_api(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["subtotal_paid"] == "200.00"


def test_add_new_product_item_via_api_returns_generated_barcode(employee, draft_purchase, category):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {
            "category": category.category_id, "name": "JBL Flip 6 Speaker", "selling_price": "145000.00",
            "quantity": 8, "unit_cost_paid": "108000.00", "unit_cost_invoiced": "108000.00",
        },
        format="json",
    )
    assert response.status_code == 201
    product_id = response.json()["product"]
    assert Product.objects.get(pk=product_id).barcode == "PES-AUD-00001"


def test_discrepancy_note_missing_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "110.00"},
        format="json",
    )
    assert response.status_code == 400


def test_discrepancy_note_provided_returns_201(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {
            "product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00",
            "unit_cost_invoiced": "110.00", "price_discrepancy_note": "Supplier rounding",
        },
        format="json",
    )
    assert response.status_code == 201


def test_header_totals_reflect_after_add(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.json()["total_paid"] == "200.00"


def test_delete_item_updates_totals(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    add_response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    item_id = add_response.json()["purchase_item_id"]
    delete_response = client.delete(f"/api/purchases/{draft_purchase.purchase_id}/items/{item_id}/")
    assert delete_response.status_code == 204
    get_response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert get_response.json()["total_paid"] == "0.00"


def test_receive_via_api_increments_inventory(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 5, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert response.status_code == 200
    assert response.json()["status"] == "received"
    assert Inventory.objects.get(product=product).quantity_in_stock == 5


def test_receive_twice_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    second_response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert second_response.status_code == 400


def test_add_item_to_received_purchase_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 400
