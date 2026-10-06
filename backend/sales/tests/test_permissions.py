"""Release Phase 0: who may reverse a sale or delete a customer, and how sale
notifications are recorded."""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from notifications.models import NotificationLog
from sales.models import Customer, Sale
from stock.models import Inventory

pytestmark = pytest.mark.django_db


def make_employee(username, role):
    return Employee.objects.create_user(
        username=username, password="pass12345", full_name=username,
        hire_date=date(2025, 1, 1), role=role,
    )


def client_for(employee):
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": employee.username, "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def technician():
    return make_employee("tech1", Employee.Role.TECHNICIAN)


@pytest.fixture
def manager():
    return make_employee("manager1", Employee.Role.MANAGER)


@pytest.fixture
def admin():
    return make_employee("admin1", Employee.Role.ADMIN)


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=10)
    return product


def sell(client, product, quantity=2, customer=None):
    payload = {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": quantity}]}
    if customer is not None:
        payload["customer"] = customer.customer_id
    response = client.post("/api/sales/", payload, format="json")
    assert response.status_code == 201
    return response.json()["sale_id"]


# 0.1 — reversing a sale

@pytest.mark.parametrize("action", ["cancel", "return"])
@pytest.mark.parametrize("role_fixture", ["staff", "technician"])
def test_staff_cannot_reverse_a_sale(request, action, role_fixture, admin, product):
    seller = request.getfixturevalue(role_fixture)
    client = client_for(seller)
    sale_id = sell(client, product)

    response = client.post(f"/api/sales/{sale_id}/{action}/")

    assert response.status_code == 403
    assert Sale.objects.get(pk=sale_id).status == Sale.SaleStatus.COMPLETED
    assert Inventory.objects.get(product=product).quantity_in_stock == 8


@pytest.mark.parametrize("action,status", [("cancel", "cancelled"), ("return", "returned")])
def test_manager_can_reverse_a_sale(action, status, staff, manager, admin, product):
    sale_id = sell(client_for(staff), product)

    response = client_for(manager).post(f"/api/sales/{sale_id}/{action}/")

    assert response.status_code == 200
    assert response.json()["status"] == status
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


# 0.3 — customers

def test_staff_can_list_create_and_edit_customers(staff):
    client = client_for(staff)
    created = client.post("/api/customers/", {"name": "Aline", "phone": "0788000000"}, format="json")
    assert created.status_code == 201
    customer_id = created.json()["customer_id"]

    assert client.get("/api/customers/").status_code == 200
    edited = client.patch(f"/api/customers/{customer_id}/", {"phone": "0788111111"}, format="json")
    assert edited.status_code == 200


@pytest.mark.parametrize("role_fixture", ["staff", "manager"])
def test_only_admin_can_delete_a_customer(request, role_fixture):
    customer = Customer.objects.create(name="Aline")
    client = client_for(request.getfixturevalue(role_fixture))

    response = client.delete(f"/api/customers/{customer.customer_id}/")

    assert response.status_code == 403
    assert Customer.objects.filter(pk=customer.pk).exists()


def test_admin_can_delete_a_customer_without_sales(admin):
    customer = Customer.objects.create(name="Aline")

    response = client_for(admin).delete(f"/api/customers/{customer.customer_id}/")

    assert response.status_code == 204
    assert not Customer.objects.filter(pk=customer.pk).exists()


def test_admin_cannot_delete_a_customer_with_sales(admin, staff, product):
    customer = Customer.objects.create(name="Aline")
    sell(client_for(staff), product, customer=customer)

    response = client_for(admin).delete(f"/api/customers/{customer.customer_id}/")

    assert response.status_code == 400
    assert "sale" in response.json()["detail"][0].lower()
    assert Customer.objects.filter(pk=customer.pk).exists()


# 0.6 — notifications are logged in the app, not "sent"

def test_sale_notifications_are_logged_not_sent(staff, admin, product):
    sale_id = sell(client_for(staff), product)

    statuses = set(NotificationLog.objects.filter(related_sale_id=sale_id).values_list("status", flat=True))

    assert statuses == {"logged"}
