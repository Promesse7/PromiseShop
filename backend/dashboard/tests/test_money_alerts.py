"""Module H5: each alert rule fires on its condition and stays quiet otherwise."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from dashboard import money
from finance.models import DailyClose, ShopProfile
from operations.models import ShopAsset, ShopAssetEvent
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from sales.models import Customer, Sale, SaleItem
from stock.models import Inventory

pytestmark = pytest.mark.django_db
D = Decimal


@pytest.fixture
def manager():
    return Employee.objects.create_user(
        username="manager1", password="pass12345", full_name="Manager One",
        hire_date=date(2025, 1, 1), role=Employee.Role.MANAGER,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker", reorder_level=5)
    ProductPricing.objects.create(product=product, wholesale_price=D("50"), retail_price=D("100"),
                                  effective_date=date(2026, 1, 1), is_current=True)
    Inventory.objects.create(product=product, quantity_in_stock=100)
    return product


def at(day):
    return timezone.make_aware(datetime.combine(day, time(12)), timezone.get_current_timezone())


def make_sale(employee, product, day, *, unit_price=D("100"), list_price=D("100"), quantity=1,
              cost=None, customer=None, paid=None, due_date=None):
    """A sale written directly (the alert rules read records; the till is tested elsewhere)."""
    subtotal = unit_price * quantity
    sale = Sale.objects.create(customer=customer, employee=employee, total_amount=subtotal,
                               amount_paid=subtotal if paid is None else paid, due_date=due_date)
    Sale.objects.filter(pk=sale.pk).update(sale_date=at(day))
    SaleItem.objects.create(sale=sale, product=product, quantity=quantity, unit_price=unit_price,
                            list_price=list_price, subtotal=subtotal, tax_category="B", tax_amount=D("0"),
                            cost_at_sale=cost, discount_amount=(list_price - unit_price) * quantity)
    return sale


def codes(as_of=None):
    return [a["code"] for a in money.alerts(as_of=as_of)["alerts"]]


def test_no_alerts_on_a_quiet_shop(manager, product):
    make_sale(manager, product, timezone.localdate())
    assert codes() == []


def test_discount_spike_fires_when_this_week_doubles_the_baseline(manager, product):
    today = timezone.localdate()
    make_sale(manager, product, today - timedelta(days=20), unit_price=D("95"))   # 5% baseline
    make_sale(manager, product, today, unit_price=D("80"))                         # 20% this week
    assert "discount_spike" in codes()


def test_discount_spike_quiet_when_in_line_with_baseline(manager, product):
    today = timezone.localdate()
    make_sale(manager, product, today - timedelta(days=20), unit_price=D("90"))
    make_sale(manager, product, today, unit_price=D("88"))
    assert "discount_spike" not in codes()


def test_overdue_customer_debt(manager, product):
    today = timezone.localdate()
    customer = Customer.objects.create(name="Late", phone="0788")
    make_sale(manager, product, today - timedelta(days=100), customer=customer, paid=D("0"),
              due_date=today - timedelta(days=70))
    alert = next(a for a in money.alerts()["alerts"] if a["code"] == "debt_overdue")
    assert "100.00" in alert["message"] and alert["link"] == "/debts"


def test_debt_not_yet_sixty_days_overdue_is_quiet(manager, product):
    today = timezone.localdate()
    customer = Customer.objects.create(name="Soon", phone="0788")
    make_sale(manager, product, today - timedelta(days=40), customer=customer, paid=D("0"),
              due_date=today - timedelta(days=10))
    assert "debt_overdue" not in codes()


@pytest.mark.parametrize("variance,fires", [(D("-6000"), True), (D("4000"), False)])
def test_cash_variance(manager, variance, fires):
    DailyClose.objects.create(cashier=manager, business_date=timezone.localdate(), expected_cash=D("0"),
                              counted_cash=variance, variance=variance, closed_by=manager)
    assert ("cash_variance" in codes()) is fires


@pytest.mark.parametrize("times,fires", [(4, True), (3, False)])
def test_sold_below_cost_repeatedly(manager, product, times, fires):
    for _ in range(times):
        make_sale(manager, product, timezone.localdate(), unit_price=D("40"), cost=D("50"))
    assert ("below_cost" in codes()) is fires


@pytest.mark.parametrize("replacements,fires", [(3, True), (2, False)])
def test_asset_replaced_too_often(manager, replacements, fires):
    asset = ShopAsset.objects.create(name="Printer", status=ShopAsset.Status.IN_SERVICE, source="pre_owned",
                                     created_by=manager)
    for _ in range(replacements):
        new = ShopAsset.objects.create(name="Printer", status=ShopAsset.Status.IN_SERVICE, source="pre_owned",
                                       replaces=asset, created_by=manager)
        ShopAssetEvent.objects.create(asset=asset, from_status="in_service", to_status="damaged",
                                      reason="Broke", user=manager, replaced_by=new)
        asset = new
    assert ("asset_replacements" in codes()) is fires


@pytest.mark.parametrize("invoiced,fires", [(D("110"), True), (D("101"), False)])
def test_supplier_billing_differences(manager, product, invoiced, fires):
    purchase = Purchase.objects.create(supplier=Supplier.objects.create(name="S"), employee=manager,
                                       purchase_date=timezone.localdate())
    add_existing_product_item(purchase, product, 10, D("100"), invoiced, "differs")
    receive_purchase(purchase, user=manager)
    assert ("billing_differences" in codes()) is fires


@pytest.mark.parametrize("stock,fires", [(3, True), (50, False)])
def test_low_stock_on_a_top_seller(manager, product, stock, fires):
    make_sale(manager, product, timezone.localdate(), quantity=5)
    Inventory.objects.filter(product=product).update(quantity_in_stock=stock)
    assert ("low_stock_top_seller" in codes()) is fires


def test_thresholds_come_from_the_shop_profile(manager, product):
    profile = ShopProfile.objects.filter(pk=1).first() or ShopProfile(business_name="Shop")
    profile.alert_below_cost_count = 1
    profile.save()
    for _ in range(2):
        make_sale(manager, product, timezone.localdate(), unit_price=D("40"), cost=D("50"))
    assert "below_cost" in codes()


def test_thresholds_and_vat_flag_are_editable_through_the_api(manager):
    from rest_framework.test import APIClient

    admin = Employee.objects.create_user(username="admin1", password="pass12345", full_name="Admin",
                                         hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN)
    client = APIClient()
    token = client.post("/api/auth/login/", {"username": admin.username, "password": "pass12345"}, format="json").json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    if not ShopProfile.objects.filter(pk=1).exists():
        ShopProfile.objects.create(business_name="Shop")
    response = client.patch("/api/shop-profile/", {"alert_overdue_days": 45}, format="json")
    assert response.status_code == 200
    assert response.json()["alert_overdue_days"] == 45
    supplier = Supplier.objects.create(name="S")
    created = client.post("/api/purchases/", {"supplier": supplier.pk, "purchase_date": "2026-10-01",
                                              "has_vat_invoice": False}, format="json")
    assert created.status_code == 201
    assert created.json()["has_vat_invoice"] is False
