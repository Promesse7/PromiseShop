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


def test_create_draft_purchase(admin, supplier):
    client = auth_client(admin, "adminpass")
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


def test_add_existing_product_item_via_api(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
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


def test_header_totals_reflect_after_add(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.json()["total_paid"] == "200.00"


def test_delete_item_updates_totals(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
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


def test_patch_updates_draft_purchase_header(employee, draft_purchase):
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/purchases/{draft_purchase.purchase_id}/",
        {"invoice_number": "KE-9999", "payment_status": "paid"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["invoice_number"] == "KE-9999"
    assert response.json()["payment_status"] == "paid"
    # Verify persistence by fetching from DB
    refreshed = Purchase.objects.get(pk=draft_purchase.purchase_id)
    assert refreshed.invoice_number == "KE-9999"
    assert refreshed.payment_status == "paid"


def test_patch_received_purchase_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    response = client.patch(
        f"/api/purchases/{draft_purchase.purchase_id}/",
        {"invoice_number": "KE-SHOULD-FAIL"},
        format="json",
    )
    assert response.status_code == 400


def test_delete_purchase_returns_405(employee, draft_purchase):
    client = auth_client(employee, "staffpass")
    response = client.delete(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 405


def test_delete_received_purchase_returns_405(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    response = client.delete(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 405


def test_put_purchase_returns_405(employee, draft_purchase, supplier):
    client = auth_client(employee, "staffpass")
    response = client.put(
        f"/api/purchases/{draft_purchase.purchase_id}/",
        {"supplier": supplier.supplier_id, "purchase_date": "2026-01-01"},
        format="json",
    )
    assert response.status_code == 405


def test_non_admin_does_not_see_purchase_totals(employee, admin, draft_purchase, product):
    admin_client = auth_client(admin, "adminpass")
    admin_client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    staff_client = auth_client(employee, "staffpass")
    response = staff_client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 200
    body = response.json()
    assert "total_paid" not in body
    assert "total_invoiced" not in body


def test_admin_sees_purchase_totals(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 200
    body = response.json()
    assert body["total_paid"] == "200.00"
    assert body["total_invoiced"] == "200.00"


def test_non_admin_adding_item_does_not_see_cost_fields(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    for field in ("unit_cost_paid", "unit_cost_invoiced", "subtotal_paid", "subtotal_invoiced"):
        assert field not in body


def test_get_purchase_includes_items_array(admin, draft_purchase, product, category):
    other_product = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Boya Mic")
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": other_product.product_id, "quantity": 1, "unit_cost_paid": "50.00", "unit_cost_invoiced": "50.00"},
        format="json",
    )
    response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 2


def test_non_admin_get_purchase_items_are_masked(employee, admin, draft_purchase, product):
    admin_client = auth_client(admin, "adminpass")
    admin_client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    staff_client = auth_client(employee, "staffpass")
    response = staff_client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    for field in ("unit_cost_paid", "unit_cost_invoiced", "subtotal_paid", "subtotal_invoiced"):
        assert field not in items[0]


def test_negative_quantity_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": -1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 400


def test_zero_quantity_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 0, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 400


def test_negative_unit_cost_paid_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "-100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 400


def test_purchase_employee_is_set_server_side_ignoring_client_value(employee, admin, supplier):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/purchases/",
        {
            "supplier": supplier.supplier_id, "purchase_date": "2026-01-01",
            "employee": admin.employee_id,
        },
        format="json",
    )
    assert response.status_code == 201
    purchase = Purchase.objects.get(pk=response.json()["purchase_id"])
    assert purchase.employee_id == employee.employee_id
    assert purchase.employee_id != admin.employee_id


def test_admin_can_cancel_a_draft_purchase(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 3, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert not Inventory.objects.filter(product=product).exists()


def test_manager_can_cancel_a_received_purchase_and_stock_is_reversed(manager, draft_purchase, product):
    client = auth_client(manager, "managerpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 5, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert Inventory.objects.get(product=product).quantity_in_stock == 5

    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert Inventory.objects.get(product=product).quantity_in_stock == 0


def test_sales_staff_forbidden_from_cancelling_a_purchase(employee, draft_purchase):
    client = auth_client(employee, "staffpass")
    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    assert response.status_code == 403


def test_cancelling_an_already_cancelled_purchase_returns_400(admin, draft_purchase):
    client = auth_client(admin, "adminpass")
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    second_response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    assert second_response.status_code == 400


def test_cancelling_a_received_purchase_blocked_when_stock_already_sold(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 5, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")

    inventory = Inventory.objects.get(product=product)
    inventory.quantity_in_stock = 2  # simulates 3 of the 5 already having been sold
    inventory.save(update_fields=["quantity_in_stock"])

    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    assert response.status_code == 400
    assert Inventory.objects.get(product=product).quantity_in_stock == 2
    purchase = Purchase.objects.get(pk=draft_purchase.purchase_id)
    assert purchase.status == "received"


def test_cannot_receive_a_cancelled_purchase(admin, draft_purchase, product):
    client = auth_client(admin, "adminpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/cancel/")
    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert response.status_code == 400
