import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from finance.models import Expense

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
def other_admin():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_create_expense_sets_recorded_by_from_request_user(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {
            "category": "utilities", "amount": "45000.00",
            "expense_date": "2026-08-20", "description": "August power bill",
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["recorded_by"] == admin.employee_id


def test_create_expense_ignores_client_submitted_recorded_by(admin, other_admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {
            "category": "rent", "amount": "200000.00", "expense_date": "2026-08-01",
            "recorded_by": other_admin.employee_id,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["recorded_by"] == admin.employee_id


def test_list_and_retrieve_as_admin(admin):
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    list_response = client.get("/api/expenses/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_category_filter(admin):
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    Expense.objects.create(
        category=Expense.ExpenseCategory.UTILITIES, amount="45000.00",
        expense_date=date(2026, 8, 5), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/expenses/?category=rent")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["category"] == "rent"


def test_patch_updates_fields_but_preserves_recorded_by(admin, other_admin):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    client = auth_client(other_admin, "adminpass")
    response = client.patch(
        f"/api/expenses/{expense.expense_id}/", {"amount": "210000.00"}, format="json"
    )
    assert response.status_code == 200
    expense.refresh_from_db()
    assert str(expense.amount) == "210000.00"
    assert expense.recorded_by == admin


def test_delete_removes_expense(admin):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.OTHER, amount="5000.00",
        expense_date=date(2026, 8, 10), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.delete(f"/api/expenses/{expense.expense_id}/")
    assert response.status_code == 204
    assert not Expense.objects.filter(expense_id=expense.expense_id).exists()


def test_invalid_category_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {"category": "not_a_real_category", "amount": "1000.00", "expense_date": "2026-08-20"},
        format="json",
    )
    assert response.status_code == 400


def test_non_admin_gets_403_on_every_verb(staff):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.OTHER, amount="5000.00",
        expense_date=date(2026, 8, 10), recorded_by=staff,
    )
    client = auth_client(staff, "staffpass")
    assert client.get("/api/expenses/").status_code == 403
    assert client.get(f"/api/expenses/{expense.expense_id}/").status_code == 403
    assert client.post("/api/expenses/", {}, format="json").status_code == 403
    assert client.patch(f"/api/expenses/{expense.expense_id}/", {}, format="json").status_code == 403
    assert client.delete(f"/api/expenses/{expense.expense_id}/").status_code == 403


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/expenses/")
    assert response.status_code == 401
