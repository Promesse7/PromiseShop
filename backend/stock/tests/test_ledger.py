"""Module A: every change to a stock bucket writes one StockMovement row, and the
ledger always adds up to the Inventory balances."""
import importlib
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO

import pytest
from django.apps import apps as django_apps
from django.core.management import call_command
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, cancel_purchase, receive_purchase
from sales.models import Sale
from sales.services import complete_sale, return_sale_items, void_sale
from stock.ledger import ledger_mismatches
from stock.models import Inventory, InventoryAdjustment, StockMovement
from stock.services import adjust_inventory, record_movement, weighted_average_cost

pytestmark = pytest.mark.django_db

M = StockMovement.MovementType
B = StockMovement.Bucket


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
def manager():
    return make_employee("manager1", Employee.Role.MANAGER)


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics")


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    return product


def buy(product, supplier, user, lines):
    """lines: list of (quantity, unit_cost_paid). Returns the received purchase."""
    purchase = Purchase.objects.create(supplier=supplier, employee=user, purchase_date=date(2026, 1, 1))
    for quantity, cost in lines:
        add_existing_product_item(purchase, product, quantity, Decimal(cost), Decimal(cost))
    return receive_purchase(purchase, user=user)


# --- record_movement --------------------------------------------------------

def test_record_movement_updates_the_bucket_and_writes_balance_after(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=4)

    movement = record_movement(
        inventory, B.IN_STOCK, 3, M.OPENING, None, manager, reason="Found in back room"
    )

    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 7
    assert movement.quantity_delta == 3
    assert movement.balance_after == 7
    assert movement.created_by == manager
    assert movement.reason == "Found in back room"


def test_record_movement_refuses_to_go_below_zero(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_damaged=1)

    with pytest.raises(ValidationError):
        record_movement(inventory, B.DAMAGED, -2, M.FROM_DAMAGED, None, manager, reason="Fixed")

    inventory.refresh_from_db()
    assert inventory.quantity_damaged == 1
    assert not StockMovement.objects.exists()


def test_manual_movement_types_need_a_reason(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=5)
    with pytest.raises(ValidationError):
        record_movement(inventory, B.IN_STOCK, -1, M.INTERNAL_CONSUMPTION, None, manager, reason="  ")


def test_zero_delta_is_refused_except_for_a_count_confirmation(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=5)
    with pytest.raises(ValidationError):
        record_movement(inventory, B.IN_STOCK, 0, M.SALE, ("sale_item", 1), manager)

    movement = record_movement(inventory, B.IN_STOCK, 0, M.ADJUST_COUNT, None, manager, reason="Count ok")
    assert movement.balance_after == 5


def test_unit_cost_is_the_weighted_average_paid_cost(product, supplier, manager):
    inventory = Inventory.objects.create(product=product)
    assert record_movement(
        inventory, B.IN_STOCK, 1, M.OPENING, None, manager, reason="x"
    ).unit_cost is None

    buy(product, supplier, manager, [(2, "40.00"), (6, "60.00")])  # (80 + 360) / 8 = 55

    assert weighted_average_cost(product) == Decimal("55.00")
    inventory.refresh_from_db()
    movement = record_movement(inventory, B.IN_STOCK, -1, M.TO_DAMAGED, None, manager, reason="Dropped")
    assert movement.unit_cost == Decimal("55.00")


def test_movements_are_append_only(product, manager):
    inventory = Inventory.objects.create(product=product)
    movement = record_movement(inventory, B.IN_STOCK, 2, M.OPENING, None, manager, reason="x")

    movement.reason = "changed"
    with pytest.raises(Exception):
        movement.save()
    with pytest.raises(Exception):
        movement.delete()
    with pytest.raises(Exception):
        StockMovement.objects.filter(pk=movement.pk).update(reason="changed")
    with pytest.raises(Exception):
        StockMovement.objects.all().delete()
    assert StockMovement.objects.get(pk=movement.pk).reason == "x"


# --- existing flows now write movements --------------------------------------

def test_receiving_a_purchase_writes_one_receipt_per_line_at_its_own_cost(product, supplier, manager):
    purchase = buy(product, supplier, manager, [(2, "40.00"), (3, "60.00")])

    rows = list(StockMovement.objects.filter(movement_type=M.PURCHASE_RECEIPT).order_by("movement_id"))
    assert [(r.quantity_delta, r.balance_after, r.unit_cost) for r in rows] == [
        (2, 2, Decimal("40.00")), (3, 5, Decimal("60.00")),
    ]
    assert {r.source_type for r in rows} == {"purchase_item"}
    assert set(r.source_id for r in rows) == set(purchase.items.values_list("pk", flat=True))
    assert all(r.created_by == manager and r.bucket == B.IN_STOCK for r in rows)


def test_cancelling_a_received_purchase_writes_reversing_movements(product, supplier, manager):
    purchase = buy(product, supplier, manager, [(4, "40.00")])

    cancel_purchase(purchase, user=manager)

    row = StockMovement.objects.get(movement_type=M.PURCHASE_CANCEL)
    assert (row.quantity_delta, row.balance_after, row.unit_cost) == (-4, 0, Decimal("40.00"))
    assert row.created_by == manager


def test_a_sale_writes_one_negative_movement_per_line(product, supplier, manager, staff):
    buy(product, supplier, manager, [(10, "50.00")])

    sale = complete_sale(None, staff, "cash", [
        {"product": product, "quantity": 2}, {"product": product, "quantity": 1},
    ])

    rows = list(StockMovement.objects.filter(movement_type=M.SALE).order_by("movement_id"))
    assert [(r.quantity_delta, r.balance_after) for r in rows] == [(-2, 8), (-1, 7)]
    assert set(r.source_id for r in rows) == set(sale.items.values_list("pk", flat=True))
    assert all(r.source_type == "sale_item" and r.created_by == staff for r in rows)
    assert all(r.unit_cost == Decimal("50.00") for r in rows)


def return_all(sale, user):
    return return_sale_items(
        sale, [{"sale_item": i, "quantity": i.quantity, "condition": "resellable"} for i in sale.items.order_by("pk")],
        "Returned", user, refund_method="cash",
    )


@pytest.mark.parametrize("how,movement_type", [("return", M.SALE_RETURN), ("void", M.SALE_VOID)])
def test_reversing_a_sale_puts_stock_back_with_a_movement(how, movement_type, product, supplier, manager, staff):
    buy(product, supplier, manager, [(10, "50.00")])
    sale = complete_sale(None, staff, "cash", [{"product": product, "quantity": 3}])

    if how == "return":
        return_all(sale, manager)
    else:
        void_sale(sale, manager, "Mistake")

    row = StockMovement.objects.get(movement_type=movement_type)
    assert (row.quantity_delta, row.balance_after, row.created_by) == (3, 10, manager)


def test_count_correction_writes_the_difference(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)

    adjustment = adjust_inventory(inventory, "count_correction", 7, "Stock take", manager)

    row = StockMovement.objects.get()
    assert (row.movement_type, row.quantity_delta, row.balance_after) == (M.ADJUST_COUNT, -3, 7)
    assert (row.source_type, row.source_id, row.reason) == ("adjustment", adjustment.pk, "Stock take")


def test_bucket_move_writes_two_rows(product, manager):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)

    adjust_inventory(inventory, "to_damaged", 2, "Dropped", manager)

    rows = {r.bucket: r for r in StockMovement.objects.all()}
    assert (rows[B.IN_STOCK].quantity_delta, rows[B.IN_STOCK].balance_after) == (-2, 8)
    assert (rows[B.DAMAGED].quantity_delta, rows[B.DAMAGED].balance_after) == (2, 2)
    assert {r.movement_type for r in rows.values()} == {M.TO_DAMAGED}
    assert InventoryAdjustment.objects.count() == 1


# --- ledger consistency ------------------------------------------------------

def test_ledger_matches_inventory_after_a_mixed_day(product, supplier, manager, staff):
    other = Product.objects.create(category=product.category, barcode="PES-AUD-00002", name="Cable")
    ProductPricing.objects.create(
        product=other, wholesale_price=Decimal("1.00"), retail_price=Decimal("5.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    buy(product, supplier, manager, [(10, "50.00")])
    cancelled = buy(other, supplier, manager, [(5, "1.00")])
    buy(other, supplier, manager, [(20, "1.00")])
    sale = complete_sale(None, staff, "cash", [
        {"product": product, "quantity": 2}, {"product": other, "quantity": 3},
    ])
    complete_sale(None, staff, "cash", [{"product": product, "quantity": 1}])
    return_all(sale, manager)
    inventory = Inventory.objects.get(product=product)
    adjust_inventory(inventory, "to_damaged", 2, "Dropped", manager)
    adjust_inventory(inventory, "to_in_use", 1, "Demo", manager)
    adjust_inventory(inventory, "from_damaged", 1, "Repaired", manager)
    adjust_inventory(inventory, "count_correction", 5, "Stock take", manager)
    cancel_purchase(cancelled, user=manager)

    assert ledger_mismatches() == []

    out = StringIO()
    call_command("check_stock_ledger", stdout=out)
    assert "consistent" in out.getvalue().lower()


def test_check_stock_ledger_reports_a_mismatch_and_fails(product, manager):
    inventory = Inventory.objects.create(product=product)
    record_movement(inventory, B.IN_STOCK, 5, M.OPENING, None, manager, reason="x")
    Inventory.objects.filter(pk=inventory.pk).update(quantity_in_stock=4)  # drift behind the ledger's back

    mismatches = ledger_mismatches()
    assert mismatches == [{
        "product_id": product.pk, "product_name": "Speaker", "bucket": "in_stock",
        "ledger": 5, "inventory": 4,
    }]

    with pytest.raises(SystemExit) as exit_info:
        call_command("check_stock_ledger", stdout=StringIO(), stderr=StringIO())
    assert exit_info.value.code == 1


def test_backfill_writes_one_opening_row_per_non_zero_bucket_and_is_rerunnable(product):
    inventory = Inventory.objects.create(
        product=product, quantity_in_stock=6, quantity_in_use=0, quantity_damaged=2
    )
    backfill = importlib.import_module("stock.migrations.0004_backfill_stock_movements")

    backfill.backfill_opening_movements(django_apps, None)
    backfill.backfill_opening_movements(django_apps, None)

    rows = {r.bucket: r for r in StockMovement.objects.filter(product=product)}
    assert set(rows) == {B.IN_STOCK, B.DAMAGED}
    assert (rows[B.IN_STOCK].quantity_delta, rows[B.IN_STOCK].balance_after) == (6, 6)
    assert (rows[B.DAMAGED].quantity_delta, rows[B.DAMAGED].balance_after) == (2, 2)
    assert all(
        r.movement_type == M.OPENING and r.reason == "Ledger start" and r.created_by is None
        for r in rows.values()
    )
    assert ledger_mismatches() == []
    assert inventory.pk


# --- endpoint -----------------------------------------------------------------

def test_movements_endpoint_lists_newest_first_with_names(product, supplier, manager, staff):
    buy(product, supplier, manager, [(10, "50.00")])
    complete_sale(None, staff, "cash", [{"product": product, "quantity": 2}])

    response = client_for(manager).get("/api/stock/movements/")

    assert response.status_code == 200
    rows = response.json()["results"]
    assert [r["movement_type"] for r in rows] == ["sale", "purchase_receipt"]
    assert rows[0]["product_name"] == "Speaker"
    assert rows[0]["created_by_name"] == "Staff1"
    assert rows[0]["unit_cost"] == "50.00"


def test_movements_endpoint_filters(product, supplier, manager, staff):
    other = Product.objects.create(category=product.category, barcode="PES-AUD-00002", name="Cable")
    buy(product, supplier, manager, [(10, "50.00")])
    buy(other, supplier, manager, [(3, "1.00")])
    inventory = Inventory.objects.get(product=product)
    adjust_inventory(inventory, "to_damaged", 1, "Dropped", manager)
    client = client_for(manager)

    by_product = client.get(f"/api/stock/movements/?product={other.pk}").json()["results"]
    assert {r["product"] for r in by_product} == {other.pk}

    by_type = client.get("/api/stock/movements/?type=to_damaged").json()["results"]
    assert len(by_type) == 2

    by_bucket = client.get("/api/stock/movements/?bucket=damaged").json()["results"]
    assert [r["quantity_delta"] for r in by_bucket] == [1]

    today = timezone.localdate()
    assert client.get(f"/api/stock/movements/?from={today}&to={today}").json()["count"] == 4
    tomorrow = today + timedelta(days=1)
    assert client.get(f"/api/stock/movements/?from={tomorrow}").json()["count"] == 0
    yesterday = today - timedelta(days=1)
    assert client.get(f"/api/stock/movements/?to={yesterday}").json()["count"] == 0


def test_movements_endpoint_rejects_a_bad_date(manager):
    response = client_for(manager).get("/api/stock/movements/?from=yesterday")
    assert response.status_code == 400


def test_staff_see_movements_without_unit_cost(product, supplier, manager, staff):
    buy(product, supplier, manager, [(10, "50.00")])

    response = client_for(staff).get("/api/stock/movements/")

    assert response.status_code == 200
    row = response.json()["results"][0]
    assert "unit_cost" not in row
    assert row["quantity_delta"] == 10


def test_movements_endpoint_is_read_only(manager):
    assert client_for(manager).post("/api/stock/movements/", {}, format="json").status_code == 405
