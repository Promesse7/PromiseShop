import pytest
from datetime import date, datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
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


def make_completed_sale(employee, product, sale_date, amount, quantity=1):
    sale = Sale.objects.create(
        employee=employee, total_amount=amount, status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=sale.pk).update(sale_date=sale_date)
    sale.refresh_from_db()
    SaleItem.objects.create(
        sale=sale, product=product, quantity=quantity,
        unit_price=amount / quantity, subtotal=amount,
        tax_category="B", tax_amount=Decimal("0.00"),
    )
    return sale


def test_sales_summary_today(admin, product):
    now = timezone.now()
    make_completed_sale(admin, product, now, Decimal("10000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 1
    assert Decimal(body["total_revenue"]) == Decimal("10000.00")


def test_sales_summary_excludes_sales_outside_period(admin, product):
    now = timezone.now()
    outside = now - timedelta(days=40)
    make_completed_sale(admin, product, outside, Decimal("5000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    assert response.json()["sale_count"] == 0


def test_sales_summary_excludes_non_completed_sales(admin, product):
    sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("9000.00"), status=Sale.SaleStatus.CANCELLED,
    )
    SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price=Decimal("9000.00"), subtotal=Decimal("9000.00"),
        tax_category="B", tax_amount=Decimal("0.00"),
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    assert response.json()["sale_count"] == 0


def test_sales_summary_top_products_ordered_and_limited_to_5(admin, category):
    now = timezone.now()
    products = [
        Product.objects.create(category=category, barcode=f"PES-AUD-0000{i}", name=f"Item {i}")
        for i in range(6)
    ]
    for i, prod in enumerate(products):
        make_completed_sale(admin, prod, now, Decimal(str(1000 * (i + 1))))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    top = response.json()["top_products"]
    assert len(top) == 5
    revenues = [Decimal(p["revenue"]) for p in top]
    assert revenues == sorted(revenues, reverse=True)
    assert revenues[0] == Decimal("6000.00")


def test_sales_summary_empty_period_returns_zero_not_error(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 0
    assert Decimal(body["total_revenue"]) == Decimal("0")
    assert body["top_products"] == []


def test_sales_summary_invalid_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=bogus")
    assert response.status_code == 400


def test_sales_summary_missing_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/")
    assert response.status_code == 400


def test_sales_summary_week_boundary(admin, product):
    now = timezone.now()
    inside = now - timedelta(days=6)
    outside = now - timedelta(days=7)
    make_completed_sale(admin, product, inside, Decimal("1000.00"))
    make_completed_sale(admin, product, outside, Decimal("5000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=week")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 1
    assert Decimal(body["total_revenue"]) == Decimal("1000.00")


def test_sales_summary_month_boundary(admin, product):
    today = timezone.localdate()
    inside = timezone.make_aware(datetime.combine(today.replace(day=1), datetime.min.time()))
    prev_month_last_day = today.replace(day=1) - timedelta(days=1)
    outside = timezone.make_aware(datetime.combine(prev_month_last_day, datetime.min.time()))
    make_completed_sale(admin, product, inside, Decimal("2000.00"))
    make_completed_sale(admin, product, outside, Decimal("7000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=month")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 1
    assert Decimal(body["total_revenue"]) == Decimal("2000.00")


def test_sales_summary_year_boundary(admin, product):
    today = timezone.localdate()
    inside = timezone.make_aware(datetime(today.year, 1, 1))
    outside = timezone.make_aware(datetime(today.year - 1, 12, 31))
    make_completed_sale(admin, product, inside, Decimal("3000.00"))
    make_completed_sale(admin, product, outside, Decimal("8000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=year")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 1
    assert Decimal(body["total_revenue"]) == Decimal("3000.00")


def test_sales_summary_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 403


def test_sales_summary_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 401
