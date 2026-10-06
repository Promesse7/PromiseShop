"""Release Phase 0.4: staff read suppliers; admin and manager create, edit and
delete them, and a supplier with purchases can't be deleted."""
import pytest
from datetime import date
from rest_framework.test import APIClient

from accounts.models import Employee
from purchasing.models import Purchase, Supplier

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
def supplier():
    return Supplier.objects.create(name="Kigali Electronics")


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_can_read_suppliers(role, supplier):
    client = client_for(make_employee("reader", role))
    assert client.get("/api/suppliers/").status_code == 200
    assert client.get(f"/api/suppliers/{supplier.supplier_id}/").status_code == 200


@pytest.mark.parametrize("role", [Employee.Role.SALES_STAFF, Employee.Role.TECHNICIAN])
def test_staff_cannot_create_edit_or_delete_suppliers(role, supplier):
    client = client_for(make_employee("writer", role))

    assert client.post("/api/suppliers/", {"name": "New Co"}, format="json").status_code == 403
    assert client.patch(
        f"/api/suppliers/{supplier.supplier_id}/", {"phone": "0788"}, format="json"
    ).status_code == 403
    assert client.delete(f"/api/suppliers/{supplier.supplier_id}/").status_code == 403
    assert Supplier.objects.count() == 1


@pytest.mark.parametrize("role", [Employee.Role.MANAGER, Employee.Role.ADMIN])
def test_admin_and_manager_can_create_and_edit_suppliers(role, supplier):
    client = client_for(make_employee("boss", role))

    assert client.post("/api/suppliers/", {"name": "New Co"}, format="json").status_code == 201
    assert client.patch(
        f"/api/suppliers/{supplier.supplier_id}/", {"phone": "0788"}, format="json"
    ).status_code == 200


def test_supplier_without_purchases_can_be_deleted(supplier):
    client = client_for(make_employee("manager1", Employee.Role.MANAGER))
    assert client.delete(f"/api/suppliers/{supplier.supplier_id}/").status_code == 204


def test_supplier_with_purchases_cannot_be_deleted(supplier):
    manager = make_employee("manager1", Employee.Role.MANAGER)
    Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 1, 1))

    response = client_for(manager).delete(f"/api/suppliers/{supplier.supplier_id}/")

    assert response.status_code == 400
    assert Supplier.objects.filter(pk=supplier.pk).exists()
