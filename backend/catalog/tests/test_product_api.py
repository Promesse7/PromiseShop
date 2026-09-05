import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def technician():
    return Employee.objects.create_user(
        username="tech1", password="techpass", full_name="Tech One",
        hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
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
def category():
    return Category.objects.create(name="Audio", code="AUD")


def test_creating_product_auto_assigns_barcode(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {
            "category": category.category_id,
            "name": "JBL Flip 6 Speaker",
            "brand": "JBL",
            "model_number": "JBLFLIP6BLK",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["barcode"] == "PES-AUD-00001"


def test_second_product_in_same_category_gets_next_number(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    client.post("/api/products/", {"category": category.category_id, "name": "First"}, format="json")
    response = client.post(
        "/api/products/", {"category": category.category_id, "name": "Second"}, format="json"
    )
    assert response.json()["barcode"] == "PES-AUD-00002"


def test_submitted_barcode_is_ignored(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {"category": category.category_id, "name": "Sneaky", "barcode": "HACKED-00001"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["barcode"] == "PES-AUD-00001"


def test_updating_product_category_is_rejected(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    other_category = Category.objects.create(name="Video", code="VID")
    response = client.patch(
        f"/api/products/{product_id}/", {"category": other_category.category_id}, format="json"
    )
    assert response.status_code == 400

    unchanged = Product.objects.get(pk=product_id)
    assert unchanged.category_id == category.category_id


def test_updating_product_name_still_allowed(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = client.patch(f"/api/products/{product_id}/", {"name": "Renamed"}, format="json")
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"


def test_product_defaults_to_standard_tax_category(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    assert response.json()["tax_category"] == "B"


def test_product_tax_category_can_be_set_to_exempt(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {"category": category.category_id, "name": "Bread", "tax_category": "A"},
        format="json",
    )
    assert response.json()["tax_category"] == "A"


def test_admin_can_deactivate_product(admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = admin_client.post(
        f"/api/products/{product_id}/set-active/", {"is_active": False}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is False

    fetch_response = admin_client.get(f"/api/products/{product_id}/")
    assert fetch_response.json()["is_active"] is False


def test_manager_can_reactivate_product(manager, category):
    manager_client = auth_client(manager, "managerpass")
    create_response = manager_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    manager_client.post(f"/api/products/{product_id}/set-active/", {"is_active": False}, format="json")
    response = manager_client.post(
        f"/api/products/{product_id}/set-active/", {"is_active": True}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    fetch_response = manager_client.get(f"/api/products/{product_id}/")
    assert fetch_response.json()["is_active"] is True


def test_sales_staff_forbidden_from_deactivating_product(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = client.post(f"/api/products/{product_id}/set-active/", {"is_active": False}, format="json")
    assert response.status_code == 403


def test_technician_forbidden_from_deactivating_product(technician, admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    tech_client = auth_client(technician, "techpass")
    response = tech_client.post(f"/api/products/{product_id}/set-active/", {"is_active": False}, format="json")
    assert response.status_code == 403


def test_set_active_rejects_non_boolean_value(admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = admin_client.post(
        f"/api/products/{product_id}/set-active/", {"is_active": "not-a-bool"}, format="json"
    )
    assert response.status_code == 400


def test_set_active_rejects_empty_body(admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = admin_client.post(f"/api/products/{product_id}/set-active/", {}, format="json")
    assert response.status_code == 400


def test_admin_can_delete_product_with_no_history(admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = admin_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 204
    assert not Product.objects.filter(pk=product_id).exists()


def test_manager_can_delete_product_with_no_history(manager, category):
    manager_client = auth_client(manager, "managerpass")
    create_response = manager_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    response = manager_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 204
    assert not Product.objects.filter(pk=product_id).exists()


def test_sales_staff_forbidden_from_deleting_product(sales_staff, admin, category):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]

    staff_client = auth_client(sales_staff, "staffpass")
    response = staff_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 403
    assert Product.objects.filter(pk=product_id).exists()


def test_deleting_product_cascades_pricing_and_inventory(admin, category):
    from catalog.models import ProductPricing
    from stock.models import Inventory

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]
    product = Product.objects.get(pk=product_id)
    ProductPricing.objects.create(
        product=product, wholesale_price="1000.00", retail_price="1500.00", effective_date="2026-01-01"
    )
    Inventory.objects.create(product=product, quantity_in_stock=5)

    response = admin_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 204
    assert not ProductPricing.objects.filter(product_id=product_id).exists()
    assert not Inventory.objects.filter(product_id=product_id).exists()


def test_deleting_product_with_purchase_history_returns_400_not_500(admin, category):
    from purchasing.models import Supplier, Purchase, PurchaseItem

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]
    product = Product.objects.get(pk=product_id)

    supplier = Supplier.objects.create(name="Kigali Electronics Ltd")
    purchase = Purchase.objects.create(
        supplier=supplier, employee=admin, purchase_date="2026-01-01",
        total_paid="10000.00", total_invoiced="10000.00",
    )
    PurchaseItem.objects.create(
        purchase=purchase, product=product, quantity=1,
        unit_cost_paid="1000.00", unit_cost_invoiced="1000.00",
        subtotal_paid="1000.00", subtotal_invoiced="1000.00",
    )

    response = admin_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 400
    assert (
        "This product has purchase or sale history and cannot be deleted. "
        "Deactivate it instead so past records stay intact."
    ) in response.json()["detail"]
    assert Product.objects.filter(pk=product_id).exists()


def test_deleting_product_with_sale_history_returns_400_not_500(admin, category):
    from sales.models import Sale, SaleItem

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/products/", {"category": category.category_id, "name": "First"}, format="json"
    )
    product_id = create_response.json()["product_id"]
    product = Product.objects.get(pk=product_id)

    sale = Sale.objects.create(employee=admin, total_amount="1000.00")
    SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price="1000.00", list_price="1000.00",
        subtotal="1000.00", tax_category="B", tax_amount="0.00",
    )

    response = admin_client.delete(f"/api/products/{product_id}/")
    assert response.status_code == 400
    assert (
        "This product has purchase or sale history and cannot be deleted. "
        "Deactivate it instead so past records stay intact."
    ) in response.json()["detail"]
    assert Product.objects.filter(pk=product_id).exists()
