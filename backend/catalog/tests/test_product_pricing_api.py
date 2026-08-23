import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_admin_sees_wholesale_price(admin, product):
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    client = auth_client(admin, "adminpass")
    response = client.get(f"/api/product-pricing/?product={product.product_id}")
    assert response.status_code == 200
    assert response.json()["results"][0]["wholesale_price"] == "108000.00"


def test_non_admin_does_not_see_wholesale_price(sales_staff, product):
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    client = auth_client(sales_staff, "staffpass")
    response = client.get(f"/api/product-pricing/?product={product.product_id}")
    assert response.status_code == 200
    assert "wholesale_price" not in response.json()["results"][0]


def test_non_admin_submitting_wholesale_price_is_rejected(sales_staff, product):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "100000.00",
            "retail_price": "145000.00",
            "effective_date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 403


def test_new_pricing_row_flips_previous_current_to_false(admin, product):
    client = auth_client(admin, "adminpass")
    client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "108000.00",
            "retail_price": "145000.00",
            "effective_date": "2026-01-01",
        },
        format="json",
    )
    first = ProductPricing.objects.get(product=product)
    assert first.is_current is True

    client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "110000.00",
            "retail_price": "150000.00",
            "effective_date": "2026-06-01",
        },
        format="json",
    )
    first.refresh_from_db()
    assert first.is_current is False
    second = ProductPricing.objects.exclude(pk=first.pk).get(product=product)
    assert second.is_current is True


def test_non_admin_updating_wholesale_price_is_rejected(admin, sales_staff, product):
    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "108000.00",
            "retail_price": "145000.00",
            "effective_date": "2026-01-01",
        },
        format="json",
    )
    price_id = create_response.json()["price_id"]

    staff_client = auth_client(sales_staff, "staffpass")
    reject_response = staff_client.patch(
        f"/api/product-pricing/{price_id}/",
        {"wholesale_price": "999999.00"},
        format="json",
    )
    assert reject_response.status_code == 403

    allow_response = staff_client.patch(
        f"/api/product-pricing/{price_id}/",
        {"retail_price": "150000.00"},
        format="json",
    )
    assert allow_response.status_code == 200
