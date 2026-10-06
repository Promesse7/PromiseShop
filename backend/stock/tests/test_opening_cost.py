"""Module E3: opening stock carries a real cost, and weighted_average_cost counts it
together with received purchase lines — but never the ledger-start backfill rows."""
from datetime import date
from decimal import Decimal

import pytest
from django.db import transaction

from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from stock.models import Inventory, StockMovement
from stock.services import record_movement, weighted_average_cost

pytestmark = pytest.mark.django_db

M = StockMovement.MovementType
B = StockMovement.Bucket


@pytest.fixture
def admin():
    return Employee.objects.create_user(
        username="admin1", password="pass12345", full_name="Admin",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    Inventory.objects.create(product=product)
    return product


def opening(product, quantity, unit_cost, user):
    with transaction.atomic():
        inventory = Inventory.objects.select_for_update().get(product=product)
        return record_movement(
            inventory, B.IN_STOCK, quantity, M.OPENING, ("opening_stock", product.pk), user,
            reason="Opening stock", unit_cost=unit_cost,
        )


def receive(product, quantity, cost, user):
    purchase = Purchase.objects.create(
        supplier=Supplier.objects.get_or_create(name="S")[0], employee=user, purchase_date=date(2026, 1, 1)
    )
    add_existing_product_item(purchase, product, quantity, cost, cost)
    receive_purchase(purchase, user=user)


def test_opening_stock_alone_gives_the_product_a_cost(product, admin):
    opening(product, 10, Decimal("40.00"), admin)
    assert weighted_average_cost(product) == Decimal("40.00")


def test_opening_and_purchases_average_together(product, admin):
    opening(product, 10, Decimal("40.00"), admin)
    receive(product, 10, Decimal("60.00"), admin)
    assert weighted_average_cost(product) == Decimal("50.00")
    assert weighted_average_cost(product.pk) == Decimal("50.00")


def test_ledger_start_rows_are_left_out_of_the_average(product, admin):
    # The Module A backfill writes system "opening" rows (created_by null). With
    # no cost they must be ignored; with a cost copied from purchases they would
    # double-count those purchases, so they are ignored too.
    StockMovement.objects.create(
        product=product, movement_type=M.OPENING, bucket=B.IN_STOCK, quantity_delta=5,
        balance_after=5, unit_cost=None, reason="Ledger start", created_by=None,
    )
    assert weighted_average_cost(product) is None

    StockMovement.objects.create(
        product=product, movement_type=M.OPENING, bucket=B.IN_STOCK, quantity_delta=5,
        balance_after=10, unit_cost=Decimal("999.00"), reason="Ledger start", created_by=None,
    )
    receive(product, 10, Decimal("60.00"), admin)
    assert weighted_average_cost(product) == Decimal("60.00")


def test_opening_rows_with_no_cost_are_ignored(product, admin):
    with transaction.atomic():
        inventory = Inventory.objects.select_for_update().get(product=product)
        StockMovement.objects.create(
            product=product, movement_type=M.OPENING, bucket=B.IN_STOCK, quantity_delta=3,
            balance_after=3, unit_cost=None, reason="Opening", created_by=admin,
        )
        inventory.quantity_in_stock = 3
        inventory.save()
    assert weighted_average_cost(product) is None
