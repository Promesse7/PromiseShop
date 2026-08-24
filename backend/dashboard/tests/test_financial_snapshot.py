import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from finance.models import Expense
from sales.models import Sale, SaleItem

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
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


def test_financial_snapshot_computes_net(admin, product):
    from django.utils import timezone
    now = timezone.now()
    today = timezone.localdate()
    sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("50000.00"), status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=sale.pk).update(sale_date=now)
    SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price=Decimal("50000.00"), subtotal=Decimal("50000.00"),
    )
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount=Decimal("20000.00"),
        expense_date=today, recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert Decimal(body["total_revenue"]) == Decimal("50000.00")
    assert Decimal(body["total_expenses"]) == Decimal("20000.00")
    assert Decimal(body["net"]) == Decimal("30000.00")


def test_financial_snapshot_expenses_by_category_include_zero_categories(admin):
    today = date.today()
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount=Decimal("20000.00"),
        expense_date=today, recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    body = response.json()
    by_category = body["expenses_by_category"]
    assert Decimal(by_category["rent"]) == Decimal("20000.00")
    assert Decimal(by_category["utilities"]) == Decimal("0")
    assert set(by_category.keys()) == {"rent", "utilities", "salaries", "repairs", "other"}


def test_financial_snapshot_empty_period_returns_zero(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert Decimal(body["total_revenue"]) == Decimal("0")
    assert Decimal(body["total_expenses"]) == Decimal("0")
    assert Decimal(body["net"]) == Decimal("0")


def test_financial_snapshot_invalid_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=bogus")
    assert response.status_code == 400


def test_financial_snapshot_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 403


def test_financial_snapshot_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 401


def test_financial_snapshot_week_boundary_includes_and_excludes_expenses_and_sales(admin, product):
    today = date.today()
    inside_date = today - timedelta(days=6)
    outside_date = today - timedelta(days=7)

    inside_sale_dt = timezone.make_aware(
        timezone.datetime.combine(inside_date, timezone.datetime.min.time())
    )
    outside_sale_dt = timezone.make_aware(
        timezone.datetime.combine(outside_date, timezone.datetime.min.time())
    )

    inside_sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=inside_sale.pk).update(sale_date=inside_sale_dt)
    SaleItem.objects.create(
        sale=inside_sale, product=product, quantity=1,
        unit_price=Decimal("1000.00"), subtotal=Decimal("1000.00"),
    )

    outside_sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("9000.00"), status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=outside_sale.pk).update(sale_date=outside_sale_dt)
    SaleItem.objects.create(
        sale=outside_sale, product=product, quantity=1,
        unit_price=Decimal("9000.00"), subtotal=Decimal("9000.00"),
    )

    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount=Decimal("300.00"),
        expense_date=inside_date, recorded_by=admin,
    )
    Expense.objects.create(
        category=Expense.ExpenseCategory.UTILITIES, amount=Decimal("700.00"),
        expense_date=outside_date, recorded_by=admin,
    )

    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=week")
    assert response.status_code == 200
    body = response.json()
    assert Decimal(body["total_revenue"]) == Decimal("1000.00")
    assert Decimal(body["total_expenses"]) == Decimal("300.00")
    assert Decimal(body["net"]) == Decimal("700.00")
    by_category = body["expenses_by_category"]
    assert Decimal(by_category["rent"]) == Decimal("300.00")
    assert Decimal(by_category["utilities"]) == Decimal("0")
