"""Module G — void, partial returns and refunds, sales history."""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from accounts.services import set_approval_pin
from catalog.models import Category, Product, ProductPricing
from finance.models import Payment
from finance.services import customer_aging, customer_balance, customer_statement, record_customer_payment
from sales.models import Customer, Sale, SaleReturn
from sales.services import complete_sale, return_sale_items, void_sale
from stock.ledger import ledger_mismatches
from stock.models import Inventory, StockMovement
from stock.services import record_movement

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
    # Opening stock through the ledger, so ledger_mismatches() stays meaningful.
    inventory = Inventory.objects.create(product=product, quantity_in_stock=0)
    record_movement(inventory, "in_stock", 50, "opening", None, None, reason="Test stock", unit_cost=D("60"))
    return product


@pytest.fixture
def customer():
    return Customer.objects.create(name="Aline", phone="0788000000")


def assert_caches_consistent(sale):
    sale.refresh_from_db()
    rows = Payment.objects.filter(sale=sale)
    assert sale.amount_paid == sum((p.amount if p.direction == "in" else -p.amount for p in rows), D("0"))
    refunds = sum(
        (ri.refund_amount for r in SaleReturn.objects.filter(sale=sale) for ri in r.items.all()), D("0")
    )
    assert sale.returned_amount == refunds


def backdate(sale, days):
    Sale.objects.filter(pk=sale.pk).update(sale_date=timezone.now() - timedelta(days=days))
    sale.refresh_from_db()
    return sale


def line(sale, quantity, condition="resellable", refund_amount=None):
    entry = {"sale_item": sale.items.get(), "quantity": quantity, "condition": condition}
    if refund_amount is not None:
        entry["refund_amount"] = D(refund_amount)
    return entry


# --- void ---------------------------------------------------------------------

def test_void_puts_stock_back_and_reverses_every_payment(staff, manager, product):
    sale = complete_sale(None, staff, items=[{"product": product, "quantity": 2}], payments=[
        {"method": "cash", "amount": D("120")}, {"method": "mobile_money", "amount": D("80"), "reference": "MP1"},
    ])

    voided = void_sale(sale, manager, "Wrong item rung up")

    assert voided.status == Sale.SaleStatus.VOIDED
    assert (voided.void_reason, voided.voided_by) == ("Wrong item rung up", manager)
    assert Inventory.objects.get(product=product).quantity_in_stock == 50
    assert Payment.objects.filter(sale=sale, reversal_of__isnull=False).count() == 2
    assert_caches_consistent(voided)
    assert voided.amount_paid == 0
    assert ledger_mismatches() == []


def test_void_refused_on_yesterdays_sale(staff, manager, product):
    sale = backdate(complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}]), days=1)

    with pytest.raises(ValidationError, match="today"):
        void_sale(sale, manager, "Too late")
    assert Sale.objects.get(pk=sale.pk).status == Sale.SaleStatus.COMPLETED


def test_void_needs_a_reason_and_refuses_a_sale_with_returns(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])
    with pytest.raises(ValidationError):
        void_sale(sale, manager, "  ")
    return_sale_items(sale, [line(sale, 1)], "Faulty", manager, refund_method="cash")
    with pytest.raises(ValidationError):
        void_sale(sale, manager, "Mistake")


def test_voided_sale_drops_out_of_customer_debt(staff, manager, product, customer):
    sale = complete_sale(customer, staff, items=[{"product": product, "quantity": 2}], payments=[])
    assert customer_balance(customer) == D("200.00")

    void_sale(sale, manager, "Mistake")

    assert customer_balance(customer) == 0


# --- returns ------------------------------------------------------------------

def test_partial_return_limits_and_status(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 3}])

    return_sale_items(sale, [line(sale, 2)], "Two faulty", manager, refund_method="cash")
    sale.refresh_from_db()
    assert sale.status == Sale.SaleStatus.PARTIALLY_RETURNED

    with pytest.raises(ValidationError, match="only 1"):
        return_sale_items(sale, [line(sale, 2)], "Again", manager, refund_method="cash")

    return_sale_items(sale, [line(sale, 1)], "Last one", manager, refund_method="cash")
    sale.refresh_from_db()
    assert sale.status == Sale.SaleStatus.RETURNED
    assert_caches_consistent(sale)


def test_duplicate_lines_in_one_request_count_together(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])
    with pytest.raises(ValidationError):
        return_sale_items(sale, [line(sale, 2), line(sale, 1)], "Too many", manager, refund_method="cash")


def test_refund_defaults_to_the_price_paid_not_the_catalog_price(staff, manager, product):
    sale = complete_sale(None, staff, items=[{"product": product, "quantity": 2, "unit_price": D("95")}],
                         payments=[{"method": "cash", "amount": D("190")}])

    sale_return = return_sale_items(sale, [line(sale, 1)], "Faulty", manager, refund_method="cash")

    assert sale_return.refund_total == D("95.00")
    assert sale_return.paid_out == D("95.00")
    payment = sale_return.refund_payment
    assert (payment.direction, payment.amount, payment.method) == ("out", D("95.00"), "cash")
    sale.refresh_from_db()
    assert sale.amount_paid == D("95.00")
    assert sale.balance == 0
    assert_caches_consistent(sale)


def test_refund_can_be_lowered_but_never_raised(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    with pytest.raises(ValidationError, match="more than the price paid"):
        return_sale_items(sale, [line(sale, 1, refund_amount="150")], "Faulty", manager, refund_method="cash")
    sale_return = return_sale_items(sale, [line(sale, 1, refund_amount="70")], "Box opened", manager, refund_method="cash")
    assert sale_return.refund_total == D("70.00")


def test_credit_sale_refund_reduces_the_balance_first(staff, manager, product, customer):
    # 3 x 100 on credit, 100 paid so far: 200 still owed.
    sale = complete_sale(customer, staff, items=[{"product": product, "quantity": 3}],
                         payments=[{"method": "cash", "amount": D("100")}])

    first = return_sale_items(sale, [line(sale, 1)], "Faulty", manager)
    assert (first.paid_out, first.balance_reduced, first.refund_method) == (D("0"), D("100.00"), "balance")
    sale.refresh_from_db()
    assert sale.balance == D("100.00")
    assert customer_balance(customer) == D("100.00")

    # Returning the other two (200) covers the 100 owed and pays the excess out.
    with pytest.raises(ValidationError, match="refund is paid back"):
        return_sale_items(sale, [line(sale, 2)], "Faulty", manager)
    second = return_sale_items(sale, [line(sale, 2)], "Faulty", manager,
                               refund_method="mobile_money", refund_reference="MP-REF")
    assert (second.paid_out, second.balance_reduced) == (D("100.00"), D("100.00"))
    sale.refresh_from_db()
    assert sale.status == Sale.SaleStatus.RETURNED
    assert sale.balance == 0
    assert customer_balance(customer) == 0
    assert_caches_consistent(sale)


def test_non_cash_refund_needs_a_reference(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    with pytest.raises(ValidationError):
        return_sale_items(sale, [line(sale, 1)], "Faulty", manager, refund_method="mobile_money")


def test_damaged_return_goes_to_the_damaged_bucket(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])

    return_sale_items(sale, [line(sale, 1, condition="damaged")], "Cracked", manager, refund_method="cash")

    inventory = Inventory.objects.get(product=product)
    assert (inventory.quantity_in_stock, inventory.quantity_damaged) == (48, 1)
    movement = StockMovement.objects.get(movement_type="sale_return")
    assert (movement.bucket, movement.quantity_delta, movement.source_type) == ("damaged", 1, "sale_return_item")
    assert ledger_mismatches() == []


def test_returns_and_payments_keep_the_customer_account_consistent(staff, manager, product, customer):
    sale = complete_sale(customer, staff, items=[{"product": product, "quantity": 4}], payments=[])
    return_sale_items(sale, [line(sale, 1)], "Faulty", manager)
    record_customer_payment(customer, D("150"), "cash", "", staff)

    statement = customer_statement(customer)
    assert statement["closing_balance"] == customer_balance(customer) == D("150.00")
    assert [e["kind"] for e in statement["entries"]] == ["sale", "return", "payment"]
    aging = customer_aging()
    assert aging["total"] == D("150.00")


def test_a_lowered_refund_on_a_fully_returned_credit_sale_still_counts_as_owed(staff, manager, product, customer):
    sale = complete_sale(customer, staff, items=[{"product": product, "quantity": 1}], payments=[])
    return_sale_items(sale, [line(sale, 1, refund_amount="80")], "Restocking fee", manager)
    sale.refresh_from_db()
    assert sale.status == Sale.SaleStatus.RETURNED
    assert customer_balance(customer) == D("20.00")
    record_customer_payment(customer, D("20"), "cash", "", staff)
    assert customer_balance(customer) == 0


# --- API and history ----------------------------------------------------------

def test_staff_see_only_their_own_sales_from_today(staff, manager, product):
    other = make_employee("staff2", Employee.Role.SALES_STAFF)
    mine = complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    old_mine = backdate(complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}]), days=2)
    theirs = complete_sale(None, other, "cash", [{"product": product, "quantity": 1}])

    client = client_for(staff)
    ids = [row["sale_id"] for row in client.get("/api/sales/").json()["results"]]
    assert ids == [mine.pk]
    assert client.get(f"/api/sales/{theirs.pk}/").status_code == 404
    assert client.get(f"/api/sales/{old_mine.pk}/").status_code == 404

    manager_ids = {row["sale_id"] for row in client_for(manager).get("/api/sales/").json()["results"]}
    assert manager_ids == {mine.pk, old_mine.pk, theirs.pk}


def test_staff_can_still_see_a_customers_open_sales_to_take_a_payment(staff, manager, product, customer):
    debt = backdate(complete_sale(customer, manager, items=[{"product": product, "quantity": 1}], payments=[]), days=3)
    rows = client_for(staff).get(f"/api/sales/?customer={customer.pk}&open=true").json()["results"]
    assert [row["sale_id"] for row in rows] == [debt.pk]


def test_history_filters(staff, manager, product, customer):
    discounted = complete_sale(None, staff, items=[{"product": product, "quantity": 1, "unit_price": D("95")}],
                               payments=[{"method": "mobile_money", "amount": D("95"), "reference": "M1"}])
    returned = complete_sale(customer, manager, "cash", [{"product": product, "quantity": 2}])
    return_sale_items(returned, [line(returned, 1)], "Faulty", manager, refund_method="cash")
    old = backdate(complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}]), days=5)

    client = client_for(manager)

    def ids(query):
        return {row["sale_id"] for row in client.get(f"/api/sales/?{query}").json()["results"]}

    assert ids("has_discount=true") == {discounted.pk}
    assert ids("has_return=true") == {returned.pk}
    assert ids("payment_method=mobile_money") == {discounted.pk}
    assert ids(f"cashier={staff.pk}") == {discounted.pk, old.pk}
    assert ids(f"customer={customer.pk}") == {returned.pk}
    assert ids("status=partially_returned") == {returned.pk}
    today = timezone.localdate().isoformat()
    assert ids(f"from={today}&to={today}") == {discounted.pk, returned.pk}


def test_sale_detail_has_returns_and_movements_and_hides_cost_from_staff(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])
    body = client_for(manager).get(f"/api/sales/{sale.pk}/").json()
    assert body["can_void"] is True
    assert [m["movement_type"] for m in body["movements"]] == ["sale"]
    assert "unit_cost" in body["movements"][0]

    staff_body = client_for(staff).get(f"/api/sales/{sale.pk}/").json()
    assert "unit_cost" not in staff_body["movements"][0]
    assert "cost_at_sale" not in staff_body["items"][0]


def test_return_api_validation_errors(staff, manager, product):
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    other = complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    client = client_for(manager)
    response = client.post(f"/api/sales/{sale.pk}/returns/", {
        "reason": "Faulty", "refund_method": "cash",
        "items": [{"sale_item": other.items.get().pk, "quantity": 1, "condition": "resellable"}],
    }, format="json")
    assert response.status_code == 400
    assert Sale.objects.get(pk=sale.pk).status == Sale.SaleStatus.COMPLETED


def test_legacy_reversal_migration_is_correct_and_rerunnable(staff):
    import importlib
    from django.apps import apps as django_apps

    forwards = importlib.import_module("sales.migrations.0008_legacy_reversal_statuses").forwards
    cancelled = Sale.objects.create(employee=staff, total_amount=D("100"), status="cancelled")
    returned = Sale.objects.create(employee=staff, total_amount=D("250"), status="returned")

    for _ in range(2):
        forwards(django_apps, None)

    cancelled.refresh_from_db()
    returned.refresh_from_db()
    assert cancelled.status == Sale.SaleStatus.VOIDED
    assert (returned.returned_amount, returned.balance) == (D("250.00"), D("0.00"))
