"""Module B — payments and debt."""
import importlib
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.apps import apps as django_apps
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from accounts.services import set_approval_pin
from catalog.models import Category, Product, ProductPricing
from finance.models import Payment
from finance.services import (
    customer_aging, customer_balance, customer_statement, record_customer_payment,
    record_supplier_payment, reverse_payment, supplier_aging,
)
from purchasing.models import Purchase, PurchaseItem, Supplier
from purchasing.services import add_existing_product_item
from sales.models import Customer, Sale
from sales.services import ApprovalRequired, complete_sale
from stock.models import AppendOnlyError, Inventory

pytestmark = pytest.mark.django_db
D = Decimal


def assert_cache_matches(obj):
    """The cached amount_paid always equals the sum of the payment rows."""
    obj.refresh_from_db()
    if isinstance(obj, Sale):
        rows = Payment.objects.filter(sale=obj)
        expected = sum((p.amount if p.direction == "in" else -p.amount for p in rows), D("0"))
    else:
        rows = Payment.objects.filter(purchase=obj)
        expected = sum((p.amount if p.direction == "out" else -p.amount for p in rows), D("0"))
    assert obj.amount_paid == expected


def make_employee(username, role):
    return Employee.objects.create_user(
        username=username, password="pass12345", full_name=username.title(),
        hire_date=date(2025, 1, 1), role=role,
    )


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def manager():
    employee = make_employee("manager1", Employee.Role.MANAGER)
    set_approval_pin(employee, "4321")
    return employee


@pytest.fixture
def admin():
    return make_employee("admin1", Employee.Role.ADMIN)


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=D("60.00"), retail_price=D("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=100)
    return product


@pytest.fixture
def customer():
    return Customer.objects.create(name="Aline", phone="0788000000")


def sell(employee, product, quantity=1, customer=None, payments=None, **kwargs):
    return complete_sale(
        customer, employee, items=[{"product": product, "quantity": quantity}],
        payments=payments, **kwargs,
    )


def client_for(employee):
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": employee.username, "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


# --- checkout payments -------------------------------------------------------

def test_split_payment_cash_and_momo(staff, product):
    sale = sell(staff, product, 2, payments=[
        {"method": "cash", "amount": "100.00"},
        {"method": "mobile_money", "amount": "100.00", "reference": "MP123"},
    ])
    assert sale.payment_status == Sale.PaymentStatus.PAID
    assert sale.payment_method is None
    assert sorted(Payment.objects.filter(sale=sale).values_list("method", flat=True)) == ["cash", "mobile_money"]
    assert len({p.receipt_group for p in Payment.objects.filter(sale=sale)}) == 1
    assert_cache_matches(sale)


def test_single_method_is_kept_on_the_sale(staff, product):
    sale = sell(staff, product, 1, payments=[{"method": "card", "amount": "100", "reference": "C-1"}])
    assert sale.payment_method == "card"
    assert_cache_matches(sale)


def test_momo_without_reference_is_refused(staff, product):
    with pytest.raises(ValidationError):
        sell(staff, product, 1, payments=[{"method": "mobile_money", "amount": "100"}])
    assert not Sale.objects.exists()


def test_legacy_payment_method_pays_in_full(staff, product):
    sale = complete_sale(None, staff, "bank_transfer", [{"product": product, "quantity": 1}])
    payment = Payment.objects.get(sale=sale)
    assert payment.method == "bank_transfer" and payment.amount == D("100.00")
    assert sale.payment_status == Sale.PaymentStatus.PAID
    assert_cache_matches(sale)


def test_underpaid_walk_in_is_refused(staff, product):
    with pytest.raises(ValidationError):
        sell(staff, product, 2, payments=[{"method": "cash", "amount": "50"}])
    assert Inventory.objects.get(product=product).quantity_in_stock == 100


def test_credit_sale_needs_a_customer_phone(staff, product):
    nameless = Customer.objects.create(name="No Phone")
    with pytest.raises(ValidationError):
        sell(staff, product, 1, customer=nameless, payments=[])


def test_full_credit_sale_with_customer(staff, product, customer):
    sale = sell(staff, product, 3, customer=customer, payments=[])
    assert sale.payment_status == Sale.PaymentStatus.CREDIT
    assert sale.amount_paid == D("0")
    assert sale.due_date == timezone.localdate() + timedelta(days=30)
    assert customer_balance(customer) == D("300.00")
    assert_cache_matches(sale)


def test_partial_payment_sale(staff, product, customer):
    sale = sell(staff, product, 3, customer=customer, payments=[{"method": "cash", "amount": "120"}])
    assert sale.payment_status == Sale.PaymentStatus.PARTIAL
    assert sale.balance == D("180.00")
    assert_cache_matches(sale)


def test_non_cash_overpayment_is_refused(staff, product):
    with pytest.raises(ValidationError):
        sell(staff, product, 1, payments=[{"method": "card", "amount": "150", "reference": "C-2"}])


def test_cash_overpayment_is_change_not_payment(staff, product):
    sale = sell(staff, product, 1, payments=[{"method": "cash", "amount": "100", "tendered": "120"}])
    assert sale.change_due == D("20")
    assert Payment.objects.get(sale=sale).amount == D("100.00")

    sale = sell(staff, product, 1, payments=[
        {"method": "mobile_money", "amount": "40", "reference": "MP9"},
        {"method": "cash", "amount": "100"},
    ])
    assert sale.change_due == D("40")
    assert Payment.objects.get(sale=sale, method="cash").amount == D("60.00")
    assert_cache_matches(sale)


def test_credit_limit_needs_manager_pin_for_staff(staff, manager, product, customer):
    customer.credit_limit = D("150")
    customer.save()
    sell(staff, product, 1, customer=customer, payments=[])  # balance 100, within limit

    with pytest.raises(ApprovalRequired):
        sell(staff, product, 1, customer=customer, payments=[])
    with pytest.raises(ValidationError):
        sell(staff, product, 1, customer=customer, payments=[],
             approval={"approver_username": "manager1", "pin": "0000"})

    sale = sell(staff, product, 1, customer=customer, payments=[],
                approval={"approver_username": "manager1", "pin": "4321"})
    assert sale.payment_status == Sale.PaymentStatus.CREDIT
    assert customer_balance(customer) == D("200.00")


def test_manager_can_exceed_credit_limit_without_pin(manager, product, customer):
    customer.credit_limit = D("50")
    customer.save()
    sale = sell(manager, product, 1, customer=customer, payments=[])
    assert sale.balance == D("100.00")


# --- customer payments --------------------------------------------------------

def test_customer_payment_clears_oldest_first(staff, product, customer):
    sales = [sell(staff, product, 1, customer=customer, payments=[]) for _ in range(3)]
    Sale.objects.filter(pk=sales[0].pk).update(due_date=date(2026, 1, 1))
    Sale.objects.filter(pk=sales[1].pk).update(due_date=date(2026, 2, 1))
    Sale.objects.filter(pk=sales[2].pk).update(due_date=date(2026, 3, 1))

    group, payments = record_customer_payment(customer, D("150"), "cash", "", staff)

    assert [p.sale_id for p in payments] == [sales[0].pk, sales[1].pk]
    assert {p.receipt_group for p in payments} == {group}
    for sale in sales:
        assert_cache_matches(sale)
    statuses = [Sale.objects.get(pk=s.pk).payment_status for s in sales]
    assert statuses == ["paid", "partial", "credit"]
    assert customer_balance(customer) == D("150.00")


def test_customer_payment_on_chosen_sales(staff, product, customer):
    first = sell(staff, product, 1, customer=customer, payments=[])
    second = sell(staff, product, 1, customer=customer, payments=[])
    _, payments = record_customer_payment(customer, D("100"), "cash", "", staff, sale_ids=[second.pk])
    assert [p.sale_id for p in payments] == [second.pk]
    assert_cache_matches(first)
    assert_cache_matches(second)


def test_customer_overpayment_is_refused(staff, product, customer):
    sell(staff, product, 1, customer=customer, payments=[])
    with pytest.raises(ValidationError):
        record_customer_payment(customer, D("100.01"), "cash", "", staff)


def test_reversal_restores_the_balance(staff, manager, product, customer):
    sale = sell(staff, product, 2, customer=customer, payments=[])
    _, (payment,) = record_customer_payment(customer, D("200"), "cash", "", staff)
    assert customer_balance(customer) == D("0")

    reversal = reverse_payment(payment, manager, "Counted twice")

    assert reversal.amount == D("-200.00") and reversal.reversal_of_id == payment.pk
    assert customer_balance(customer) == D("200.00")
    assert Sale.objects.get(pk=sale.pk).payment_status == "credit"
    assert_cache_matches(sale)
    with pytest.raises(ValidationError):
        reverse_payment(payment, manager, "again")
    with pytest.raises(ValidationError):
        reverse_payment(reversal, manager, "reverse the reversal")


def test_payments_are_append_only(staff, product):
    sale = sell(staff, product, 1, payments=[{"method": "cash", "amount": "100"}])
    payment = Payment.objects.get(sale=sale)
    with pytest.raises(AppendOnlyError):
        payment.save()
    with pytest.raises(AppendOnlyError):
        payment.delete()
    with pytest.raises(AppendOnlyError):
        Payment.objects.filter(pk=payment.pk).update(amount=1)


def test_negative_amount_needs_a_reversal_target(staff, product):
    sale = sell(staff, product, 1, payments=[{"method": "cash", "amount": "100"}])
    with pytest.raises(IntegrityError), transaction.atomic():
        Payment.objects.create(direction="in", sale=sale, amount=D("-5"), method="cash", recorded_by=staff)


# --- suppliers -----------------------------------------------------------------

@pytest.fixture
def received_purchase(manager, product):
    supplier = Supplier.objects.create(name="Kigali Electronics")
    purchase = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 9, 1))
    add_existing_product_item(purchase, product, 10, D("50"), D("50"))
    purchase.refresh_from_db()
    Purchase.objects.filter(pk=purchase.pk).update(status=Purchase.Status.RECEIVED)
    purchase.refresh_from_db()
    return purchase


def test_purchase_status_follows_items_and_payments(manager, received_purchase):
    assert received_purchase.payment_status == "unpaid"
    record_supplier_payment(received_purchase, D("200"), "bank_transfer", "BK-1", manager)
    received_purchase.refresh_from_db()
    assert received_purchase.payment_status == "partial"
    record_supplier_payment(received_purchase, D("300"), "cash", "", manager)
    received_purchase.refresh_from_db()
    assert received_purchase.payment_status == "paid"
    assert_cache_matches(received_purchase)


def test_supplier_overpayment_is_refused(manager, received_purchase):
    with pytest.raises(ValidationError):
        record_supplier_payment(received_purchase, D("500.01"), "cash", "", manager)


def test_supplier_payment_clears_the_migration_review_flag(manager, received_purchase):
    Purchase.objects.filter(pk=received_purchase.pk).update(payment_needs_review=True)
    record_supplier_payment(received_purchase, D("100"), "cash", "", manager)
    received_purchase.refresh_from_db()
    assert received_purchase.payment_needs_review is False


# --- aging and statements -----------------------------------------------------

def test_customer_aging_buckets_on_fixed_dates(staff, product, customer):
    as_of = date(2026, 6, 30)
    due_dates = [date(2026, 7, 5), date(2026, 6, 10), date(2026, 5, 15), date(2026, 4, 20), date(2026, 1, 1)]
    for due in due_dates:
        sale = sell(staff, product, 1, customer=customer, payments=[])
        Sale.objects.filter(pk=sale.pk).update(due_date=due)

    aging = customer_aging(as_of)

    assert aging["totals"] == {
        "not_due": D("100.00"), "1_30": D("100.00"), "31_60": D("100.00"),
        "61_90": D("100.00"), "90_plus": D("100.00"),
    }
    (row,) = aging["rows"]
    assert row["balance"] == D("500.00") and row["oldest_due_date"] == date(2026, 1, 1)
    assert row["overdue"] is True


def test_supplier_aging_lists_unpaid_received_purchases(manager, received_purchase):
    aging = supplier_aging(date(2026, 9, 15))
    (row,) = aging["rows"]
    assert row["balance"] == D("500.00")
    assert aging["totals"]["1_30"] == D("500.00")


def test_customer_statement_running_balance(staff, product, customer):
    sell(staff, product, 2, customer=customer, payments=[])
    record_customer_payment(customer, D("50"), "cash", "", staff)
    statement = customer_statement(customer)
    assert [e["kind"] for e in statement["entries"]] == ["sale", "payment"]
    assert [e["balance"] for e in statement["entries"]] == [D("200.00"), D("150.00")]
    assert statement["closing_balance"] == D("150.00") == statement["current_balance"]


# --- API and permissions ------------------------------------------------------

def test_staff_records_a_customer_payment_via_api(staff, product, customer):
    sell(staff, product, 2, customer=customer, payments=[])
    response = client_for(staff).post(
        "/api/payments/customer/",
        {"customer": customer.pk, "amount": "120.00", "method": "mobile_money", "reference": "MP77"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["balance_after"] == "80.00"


def test_staff_cannot_pay_suppliers_reverse_or_see_debts(staff, manager, received_purchase, product):
    client = client_for(staff)
    assert client.post(
        "/api/payments/supplier/",
        {"purchase": received_purchase.pk, "amount": "10", "method": "cash"}, format="json",
    ).status_code == 403
    sale = sell(staff, product, 1, payments=[{"method": "cash", "amount": "100"}])
    payment = Payment.objects.get(sale=sale)
    assert client.post(f"/api/payments/{payment.pk}/reverse/", {"reason": "x"}, format="json").status_code == 403
    assert client.get("/api/debts/customers/").status_code == 403
    assert client.get("/api/debts/suppliers/").status_code == 403


def test_staff_payment_list_hides_supplier_payments(staff, manager, received_purchase, product):
    record_supplier_payment(received_purchase, D("100"), "cash", "", manager)
    sell(staff, product, 1, payments=[{"method": "cash", "amount": "100"}])
    staff_rows = client_for(staff).get("/api/payments/").json()["results"]
    manager_rows = client_for(manager).get("/api/payments/").json()["results"]
    assert {r["direction"] for r in staff_rows} == {"in"}
    assert len(manager_rows) == 2


def test_manager_debts_endpoints(manager, staff, product, customer, received_purchase):
    sell(staff, product, 1, customer=customer, payments=[])
    client = client_for(manager)
    customers = client.get("/api/debts/customers/").json()
    assert customers["rows"][0]["balance"] == "100.00"
    suppliers = client.get("/api/debts/suppliers/").json()
    assert suppliers["rows"][0]["balance"] == "500.00"


def test_staff_cannot_set_a_credit_limit(staff, manager, customer):
    response = client_for(staff).patch(
        f"/api/customers/{customer.pk}/", {"credit_limit": "1000"}, format="json"
    )
    assert response.status_code == 403
    response = client_for(manager).patch(
        f"/api/customers/{customer.pk}/", {"credit_limit": "1000"}, format="json"
    )
    assert response.status_code == 200 and response.json()["credit_limit"] == "1000.00"


def test_customer_list_shows_balance_and_statement_endpoint(staff, product, customer):
    sell(staff, product, 2, customer=customer, payments=[])
    client = client_for(staff)
    row = client.get("/api/customers/").json()["results"][0]
    assert row["balance"] == "200.00"
    statement = client.get(f"/api/customers/{customer.pk}/statement/").json()
    assert statement["closing_balance"] == "200.00"


def test_sale_api_takes_payments_and_returns_change(staff, product, customer):
    response = client_for(staff).post("/api/sales/", {
        "customer": customer.pk,
        "items": [{"product": product.pk, "quantity": 2}],
        "payments": [{"method": "cash", "amount": "150", "tendered": "200"}],
    }, format="json")
    assert response.status_code == 201
    body = response.json()
    assert body["payment_status"] == "partial"
    assert body["balance"] == "50.00"
    assert body["change_due"] == "50.00"
    assert body["due_date"] is not None
    assert len(body["payments"]) == 1


def test_purchase_header_patch_cannot_set_payment_status(manager, received_purchase):
    Purchase.objects.filter(pk=received_purchase.pk).update(status=Purchase.Status.DRAFT)
    response = client_for(manager).patch(
        f"/api/purchases/{received_purchase.pk}/", {"payment_status": "paid"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["payment_status"] == "unpaid"


# --- data migration -----------------------------------------------------------

def test_backfill_migration_is_correct_and_rerunnable(staff, manager, product):
    backfill = importlib.import_module("finance.migrations.0005_backfill_payments").backfill
    old_sale = Sale.objects.create(employee=staff, total_amount=D("300"), payment_method="mobile_money")
    cancelled = Sale.objects.create(employee=staff, total_amount=D("100"), status="cancelled")
    supplier = Supplier.objects.create(name="S")
    paid = Purchase.objects.create(
        supplier=supplier, employee=manager, purchase_date=date(2026, 3, 1),
        payment_status="paid", total_paid=D("400"),
    )
    partial = Purchase.objects.create(
        supplier=supplier, employee=manager, purchase_date=date(2026, 3, 2),
        payment_status="partial", total_paid=D("900"),
    )

    for _ in range(2):
        backfill(django_apps, None)

    payment = Payment.objects.get(sale=old_sale)
    assert (payment.amount, payment.method, payment.reference) == (D("300.00"), "mobile_money", "MIGRATED")
    assert not Payment.objects.filter(sale=cancelled).exists()
    assert Payment.objects.get(purchase=paid).amount == D("400.00")
    assert not Payment.objects.filter(purchase=partial).exists()
    partial.refresh_from_db()
    assert partial.payment_needs_review is True and partial.payment_status == "unpaid"
    for obj in (old_sale, paid, partial):
        assert_cache_matches(obj)
