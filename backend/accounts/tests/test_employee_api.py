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


def test_admin_can_list_employees(admin, sales_staff):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/employees/")
    assert response.status_code == 200
    assert response.json()["count"] == 2


def test_admin_can_create_employee(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/employees/",
        {
            "username": "t.nkurunziza",
            "password": "newpass123",
            "full_name": "Tom Nkurunziza",
            "hire_date": "2026-01-10",
            "role": Employee.Role.TECHNICIAN,
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert "password" not in body
    created = Employee.objects.get(username="t.nkurunziza")
    assert created.check_password("newpass123")


def test_non_admin_gets_403_listing_employees(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    response = client.get("/api/employees/")
    assert response.status_code == 403


def test_non_admin_gets_403_creating_employee(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/employees/",
        {
            "username": "should.fail",
            "password": "a-Str0ng-Passw0rd!",
            "full_name": "Nope",
            "hire_date": "2026-01-10",
            "role": Employee.Role.TECHNICIAN,
        },
        format="json",
    )
    assert response.status_code == 403


def test_admin_creating_employee_with_weak_password_is_rejected(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/employees/",
        {
            "username": "weak.pass",
            "password": "pw",
            "full_name": "Weak Password",
            "hire_date": "2026-01-10",
            "role": Employee.Role.TECHNICIAN,
        },
        format="json",
    )
    assert response.status_code == 400
    assert not Employee.objects.filter(username="weak.pass").exists()
