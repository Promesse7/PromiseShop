import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient

from accounts.models import Employee
from accounts.services import set_approval_pin
from catalog.models import Category, Product, ProductPricing
from purchasing.models import Purchase, PurchaseItem, Supplier
from purchasing.services import receive_purchase
from stock.models import Inventory


def make_employee(username, role, pin=None):
    employee = Employee.objects.create_user(
        username=username, password="pass12345", full_name=username.title(),
        hire_date=date(2025, 1, 1), role=role,
    )
    if pin:
        set_approval_pin(employee, pin)
    return employee


@pytest.fixture
def admin():
    return make_employee("admin1", Employee.Role.ADMIN, pin="1234")


@pytest.fixture
def manager():
    return make_employee("manager1", Employee.Role.MANAGER, pin="4321")


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def technician():
    return make_employee("tech1", Employee.Role.TECHNICIAN)


@pytest.fixture
def category():
    return Category.objects.create(name="Accessories", code="ACC")


def make_product(category, name, barcode, retail="100.00"):
    product = Product.objects.create(category=category, barcode=barcode, name=name)
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("1.00"), retail_price=Decimal(retail),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    return product


def receive(product, quantity, unit_cost, user):
    supplier, _ = Supplier.objects.get_or_create(name="Test Supplier")
    purchase = Purchase.objects.create(supplier=supplier, employee=user, purchase_date=date(2026, 1, 1))
    PurchaseItem.objects.create(
        purchase=purchase, product=product, quantity=quantity,
        unit_cost_paid=Decimal(unit_cost), unit_cost_invoiced=Decimal(unit_cost),
        subtotal_paid=Decimal(unit_cost) * quantity, subtotal_invoiced=Decimal(unit_cost) * quantity,
    )
    receive_purchase(purchase, user=user)
    return purchase


@pytest.fixture
def cable(category, admin):
    product = make_product(category, "HDMI Cable", "PES-ACC-00001", retail="5000.00")
    receive(product, 10, "2000.00", admin)
    return product


@pytest.fixture
def printer(category, admin):
    product = make_product(category, "Laser Printer", "PES-ACC-00002", retail="300000.00")
    receive(product, 3, "200000.00", admin)
    return product


def stock_of(product):
    return Inventory.objects.get(product=product).quantity_in_stock


def client_for(employee):
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": employee.username, "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client
