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
