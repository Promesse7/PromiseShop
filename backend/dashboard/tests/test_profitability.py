import pytest
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Purchase, PurchaseItem, Supplier
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
def manager():
    return Employee.objects.create_user(
        username="manager1", password="managerpass", full_name="Manager One",
        hire_date=date(2025, 1, 1), role=Employee.Role.MANAGER,
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


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics Ltd")


def make_purchase(employee, supplier, product, quantity, paid, invoiced, status, purchase_date=None):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, status=status,
        purchase_date=purchase_date or timezone.localdate(),
    )
    PurchaseItem.objects.create(
        purchase=purchase, product=product, quantity=quantity,
        unit_cost_paid=paid, unit_cost_invoiced=invoiced,
        subtotal_paid=paid * quantity, subtotal_invoiced=invoiced * quantity,
    )
    return purchase


def make_sale(employee, product, quantity, unit_price, list_price, status=Sale.SaleStatus.COMPLETED, sale_date=None):
    subtotal = unit_price * quantity
    sale = Sale.objects.create(employee=employee, total_amount=subtotal, status=status)
    if sale_date is not None:
        Sale.objects.filter(pk=sale.pk).update(sale_date=sale_date)
    SaleItem.objects.create(
        sale=sale, product=product, quantity=quantity, unit_price=unit_price, list_price=list_price,
        subtotal=subtotal, tax_category="B", tax_amount=Decimal("0.00"),
    )
    return sale


@pytest.fixture
def trading_history(admin, supplier, product):
    # Bought 10 @ 100 paid / 110 invoiced (received); a draft purchase must not count.
    make_purchase(admin, supplier, product, 10, Decimal("100.00"), Decimal("110.00"), Purchase.Status.RECEIVED)
    make_purchase(admin, supplier, product, 50, Decimal("1.00"), Decimal("1.00"), Purchase.Status.DRAFT)
    # Sold 2 @ 150 (catalog 160); a cancelled sale must not count.
    make_sale(admin, product, 2, Decimal("150.00"), Decimal("160.00"))
    make_sale(admin, product, 9, Decimal("150.00"), Decimal("160.00"), status=Sale.SaleStatus.CANCELLED)
    return product


def test_profitability_per_product_actual_and_projected(admin, trading_history):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/profitability/?period=month")
    assert response.status_code == 200
    body = response.json()
    assert len(body["products"]) == 1
    row = body["products"][0]
    assert row["product_id"] == trading_history.product_id
    assert row["product_name"] == "Speaker"
    assert row["units_bought"] == 10
    assert row["avg_cost_paid"] == "100.00"
    assert row["avg_cost_invoiced"] == "110.00"
    assert row["units_sold"] == 2
    assert row["revenue"] == "300.00"
    assert row["projected_revenue"] == "320.00"
    assert row["cogs_paid"] == "200.00"
    assert row["cogs_invoiced"] == "220.00"
    assert row["gross_margin"] == "100.00"
    assert row["projected_margin"] == "100.00"
    assert row["margin_pct"] == "33.33"
    assert row["projected_margin_pct"] == "31.25"


def test_profitability_totals_sum_the_rows(admin, trading_history, category, supplier):
    other = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Cable")
    make_purchase(admin, supplier, other, 4, Decimal("10.00"), Decimal("10.00"), Purchase.Status.RECEIVED)
    make_sale(admin, other, 4, Decimal("25.00"), Decimal("25.00"))
    client = auth_client(admin, "adminpass")
    body = client.get("/api/dashboard/profitability/?period=month").json()
    totals = body["totals"]
    assert totals["units_sold"] == 6
    assert totals["revenue"] == "400.00"
    assert totals["projected_revenue"] == "420.00"
    assert totals["cogs_paid"] == "240.00"
    assert totals["gross_margin"] == "160.00"
    assert totals["margin_pct"] == "40.00"
    # Sorted by revenue, highest first.
    assert [r["product_name"] for r in body["products"]] == ["Speaker", "Cable"]


def test_profitability_costs_use_all_time_purchases_but_sales_respect_the_period(admin, supplier, product):
    long_ago = timezone.localdate() - timedelta(days=400)
    make_purchase(admin, supplier, product, 10, Decimal("100.00"), Decimal("100.00"), Purchase.Status.RECEIVED, purchase_date=long_ago)
    make_sale(admin, product, 1, Decimal("150.00"), Decimal("150.00"), sale_date=timezone.now() - timedelta(days=400))
    make_sale(admin, product, 2, Decimal("150.00"), Decimal("150.00"))
    client = auth_client(admin, "adminpass")

    this_month = client.get("/api/dashboard/profitability/?period=month").json()["products"][0]
    assert this_month["units_sold"] == 2
    assert this_month["avg_cost_paid"] == "100.00"
    assert this_month["cogs_paid"] == "200.00"

    all_time = client.get("/api/dashboard/profitability/?period=all").json()["products"][0]
    assert all_time["units_sold"] == 3
    assert all_time["cogs_paid"] == "300.00"


def test_profitability_product_filter_returns_that_product_even_with_no_sales(admin, supplier, product):
    make_purchase(admin, supplier, product, 5, Decimal("80.00"), Decimal("90.00"), Purchase.Status.RECEIVED)
    client = auth_client(admin, "adminpass")
    body = client.get(f"/api/dashboard/profitability/?period=all&product={product.product_id}").json()
    assert len(body["products"]) == 1
    row = body["products"][0]
    assert row["units_bought"] == 5
    assert row["avg_cost_paid"] == "80.00"
    assert row["units_sold"] == 0
    assert row["revenue"] == "0.00"
    assert row["gross_margin"] == "0.00"
    assert row["margin_pct"] is None


def test_profitability_without_a_received_purchase_has_no_cost_figures(admin, product):
    make_sale(admin, product, 1, Decimal("150.00"), Decimal("150.00"))
    client = auth_client(admin, "adminpass")
    row = client.get("/api/dashboard/profitability/?period=month").json()["products"][0]
    assert row["units_sold"] == 1
    assert row["revenue"] == "150.00"
    assert row["avg_cost_paid"] is None
    assert row["cogs_paid"] is None
    assert row["gross_margin"] is None
    assert row["margin_pct"] is None


def test_profitability_manager_allowed_staff_forbidden(manager, staff, trading_history):
    assert auth_client(manager, "managerpass").get("/api/dashboard/profitability/?period=month").status_code == 200
    assert auth_client(staff, "staffpass").get("/api/dashboard/profitability/?period=month").status_code == 403


def test_profitability_invalid_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    assert client.get("/api/dashboard/profitability/?period=bogus").status_code == 400
    assert client.get("/api/dashboard/profitability/").status_code == 400
