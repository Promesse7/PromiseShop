import pytest
from datetime import date
from accounts.models import Employee
from finance.models import Expense

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_create_expense(employee):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.RENT,
        amount="200000.00",
        expense_date=date(2026, 1, 1),
        recorded_by=employee,
    )
    assert expense.category == Expense.ExpenseCategory.RENT
    assert expense.recorded_by == employee
