"""Release Phase 0.2: only admin and manager may create, change or delete prices;
staff keep read access to retail prices."""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing

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
def price():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    return ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_can_read_retail_prices(role, price):
    response = client_for(make_employee("reader", role)).get(
        f"/api/product-pricing/?product={price.product_id}"
    )
    assert response.status_code == 200
    row = response.json()["results"][0]
    assert row["retail_price"] == "100.00"
    assert "wholesale_price" not in row


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_cannot_create_a_price(role, price):
    response = client_for(make_employee("writer", role)).post(
        "/api/product-pricing/",
        {"product": price.product_id, "retail_price": "80.00", "effective_date": "2026-06-01"},
        format="json",
    )
    assert response.status_code == 403
    assert ProductPricing.objects.filter(product=price.product).count() == 1


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_cannot_change_or_delete_a_price(role, price):
    client = client_for(make_employee("writer", role))

    assert client.patch(
        f"/api/product-pricing/{price.price_id}/", {"retail_price": "80.00"}, format="json"
    ).status_code == 403
    assert client.delete(f"/api/product-pricing/{price.price_id}/").status_code == 403

    price.refresh_from_db()
    assert price.retail_price == Decimal("100.00")


def test_manager_can_create_a_price(price):
    response = client_for(make_employee("manager1", Employee.Role.MANAGER)).post(
        "/api/product-pricing/",
        {"product": price.product_id, "retail_price": "120.00", "effective_date": "2026-06-01"},
        format="json",
    )
    assert response.status_code == 201
