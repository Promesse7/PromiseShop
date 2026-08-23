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


def test_authenticated_employee_can_create_and_list_suppliers(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/suppliers/",
        {"name": "Kigali Electronics Ltd", "contact_person": "J. Habimana", "phone": "0788000000"},
        format="json",
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/suppliers/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/suppliers/")
    assert response.status_code == 401
