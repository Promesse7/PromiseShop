import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

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


def test_authenticated_employee_can_create_and_list_categories(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD", "description": "Speakers, mics"},
        format="json",
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/categories/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/categories/")
    assert response.status_code == 401


def test_duplicate_code_rejected(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    client.post("/api/categories/", {"name": "Audio", "code": "AUD"}, format="json")
    response = client.post("/api/categories/", {"name": "Audio Two", "code": "AUD"}, format="json")
    assert response.status_code == 400


def test_updating_category_code_is_rejected(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    response = client.patch(
        f"/api/categories/{category_id}/", {"code": "NEW"}, format="json"
    )
    assert response.status_code == 400

    from catalog.models import Category
    unchanged = Category.objects.get(pk=category_id)
    assert unchanged.code == "AUD"


def test_updating_category_name_still_allowed(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    response = client.patch(
        f"/api/categories/{category_id}/", {"name": "Audio & Video"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Audio & Video"


def test_admin_can_delete_empty_category(admin):
    from catalog.models import Category

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    response = admin_client.delete(f"/api/categories/{category_id}/")
    assert response.status_code == 204
    assert not Category.objects.filter(pk=category_id).exists()


def test_manager_can_delete_empty_category(manager):
    from catalog.models import Category

    manager_client = auth_client(manager, "managerpass")
    create_response = manager_client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    response = manager_client.delete(f"/api/categories/{category_id}/")
    assert response.status_code == 204
    assert not Category.objects.filter(pk=category_id).exists()


def test_sales_staff_forbidden_from_deleting_category(sales_staff, admin):
    from catalog.models import Category

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    staff_client = auth_client(sales_staff, "staffpass")
    response = staff_client.delete(f"/api/categories/{category_id}/")
    assert response.status_code == 403
    assert Category.objects.filter(pk=category_id).exists()


def test_deleting_category_with_products_returns_400_not_500(admin):
    from catalog.models import Category, Product

    admin_client = auth_client(admin, "adminpass")
    create_response = admin_client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD"}, format="json"
    )
    category_id = create_response.json()["category_id"]

    admin_client.post(
        "/api/products/", {"category": category_id, "name": "Speaker"}, format="json"
    )

    response = admin_client.delete(f"/api/categories/{category_id}/")
    assert response.status_code == 400
    assert (
        "This category still has products assigned to it and cannot be deleted."
        in response.json()["detail"]
    )
    assert Category.objects.filter(pk=category_id).exists()
