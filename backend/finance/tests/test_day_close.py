"""Module G — end-of-day close and Z-report."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from accounts.services import set_approval_pin
from catalog.models import Category, Product, ProductPricing
from finance.day_close import close_day, day_figures
from finance.models import DailyClose, Payment
from finance.services import record_customer_payment, reverse_payment
from sales.models import Customer, Sale
from sales.services import complete_sale, return_sale_items, void_sale
from stock.models import Inventory

pytestmark = pytest.mark.django_db
D = Decimal


def make_employee(username, role):
    return Employee.objects.create_user(
        username=username, password="pass12345", full_name=username.title(),
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
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def manager():
    employee = make_employee("manager1", Employee.Role.MANAGER)
    set_approval_pin(employee, "4321")
    return employee


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=D("60.00"), retail_price=D("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=50)
    return product


APPROVAL = {"approver_username": "manager1", "pin": "4321"}


def test_expected_cash_counts_sales_collections_and_refunds(staff, manager, product):
    today = timezone.localdate()
    customer = Customer.objects.create(name="Aline", phone="0788")
    # An old credit sale, collected today by the cashier: debt collection.
    old = complete_sale(customer, manager, items=[{"product": product, "quantity": 1}], payments=[])
    Sale.objects.filter(pk=old.pk).update(sale_date=timezone.now() - timedelta(days=3))

    complete_sale(None, staff, items=[{"product": product, "quantity": 3}], payments=[
        {"method": "cash", "amount": D("200")}, {"method": "mobile_money", "amount": D("100"), "reference": "MP9"},
    ])
    cash_sale = complete_sale(None, staff, items=[{"product": product, "quantity": 1, "unit_price": D("90")}],
                              payments=[{"method": "cash", "amount": D("90")}])
    record_customer_payment(customer, D("100"), "cash", "", staff)
    # The cashier refunds 90 in cash on a return they process themselves.
    return_sale_items(cash_sale, [{"sale_item": cash_sale.items.get(), "quantity": 1, "condition": "resellable"}],
                      "Faulty", staff, refund_method="cash")

    figures = day_figures(staff, today, D("5000"))

    assert figures["by_method"]["cash"]["net"] == D("200") + D("90") + D("100") - D("90")
    assert figures["expected_cash"] == D("5000") + D("300")
    assert figures["by_method"]["mobile_money"]["net"] == D("100")
    assert figures["by_method"]["mobile_money"]["references"][0]["reference"] == "MP9"
    assert figures["debt_collected"] == D("100")
    assert figures["sales_count"] == 2
    assert figures["discounts_given"] == D("10.00")
    assert (figures["returns_count"], figures["returns_paid_out"]) == (1, D("90.00"))


def test_a_void_takes_its_cash_back_out_of_the_original_cashiers_drawer(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])
    void_sale(sale, manager, "Mistake")

    figures = day_figures(staff, timezone.localdate())

    assert figures["expected_cash"] == 0
    assert (figures["sales_count"], figures["voided_count"]) == (0, 1)
    assert day_figures(manager, timezone.localdate())["expected_cash"] == 0


def test_new_credit_given_is_todays_unpaid_balance(staff, product):
    customer = Customer.objects.create(name="Aline", phone="0788")
    complete_sale(customer, staff, items=[{"product": product, "quantity": 2}],
                  payments=[{"method": "cash", "amount": D("50")}])
    assert day_figures(staff, timezone.localdate())["new_credit"] == D("150.00")


def test_close_day_records_the_variance_and_is_never_reopened(staff, manager, product):
    complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    today = timezone.localdate()

    close = close_day(staff, today, D("1000"), D("1080"), staff, APPROVAL, note="Short 20")

    assert (close.expected_cash, close.variance, close.closed_by) == (D("1100.00"), D("-20.00"), manager)
    assert close.summary["sales_count"] == 1
    with pytest.raises(ValidationError, match="already closed"):
        close_day(staff, today, D("1000"), D("1100"), staff, APPROVAL)


def test_close_day_needs_a_valid_manager_pin(staff, manager):
    with pytest.raises(ValidationError):
        close_day(staff, timezone.localdate(), D("0"), D("0"), staff, {"approver_username": "manager1", "pin": "0000"})
    with pytest.raises(ValidationError):
        close_day(staff, timezone.localdate(), D("0"), D("0"), staff, None)
    assert not DailyClose.objects.exists()


def test_staff_cannot_close_or_preview_someone_elses_day(staff, manager):
    other = make_employee("staff2", Employee.Role.SALES_STAFF)
    client = client_for(staff)
    assert client.get(f"/api/daily-close/preview/?cashier={other.pk}").status_code == 403
    response = client.post("/api/daily-close/", {
        "cashier": other.pk, "business_date": timezone.localdate().isoformat(),
        "opening_float": "0", "counted_cash": "0", "approval": APPROVAL,
    }, format="json")
    assert response.status_code == 403


def test_daily_close_api_round_trip(staff, manager, product):
    complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    client = client_for(staff)
    today = timezone.localdate().isoformat()

    preview = client.get(f"/api/daily-close/preview/?date={today}&opening_float=500").json()
    assert preview["expected_cash"] == "600.00"

    created = client.post("/api/daily-close/", {
        "business_date": today, "opening_float": "500",
        "counted_cash": "600", "note": "", "approval": APPROVAL,
    }, format="json")
    assert created.status_code == 201
    assert created.json()["variance"] == "0.00"
    assert created.json()["closed_by_name"] == "Manager1"

    other = make_employee("staff2", Employee.Role.SALES_STAFF)
    DailyClose.objects.create(
        cashier=other, business_date=timezone.localdate(), expected_cash=0, counted_cash=0, variance=0,
        closed_by=manager,
    )
    assert [r["cashier"] for r in client.get("/api/daily-close/").json()["results"]] == [staff.pk]
    assert len(client_for(manager).get("/api/daily-close/").json()["results"]) == 2


def test_reversing_a_payment_later_moves_it_out_of_the_original_drawer(staff, manager, product):
    customer = Customer.objects.create(name="Aline", phone="0788")
    sale = complete_sale(customer, staff, items=[{"product": product, "quantity": 1}],
                         payments=[{"method": "cash", "amount": D("100")}])
    payment = Payment.objects.get(sale=sale)
    reverse_payment(payment, manager, "Counterfeit note")
    assert day_figures(staff, timezone.localdate())["expected_cash"] == 0
