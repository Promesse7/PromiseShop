import pytest
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from purchasing.models import Supplier, Purchase, PurchaseItem
from purchasing.services import add_existing_product_item, add_new_product_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics Ltd")


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


@pytest.fixture
def draft_purchase(employee, supplier):
    return Purchase.objects.create(supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1))


def test_add_existing_product_item_computes_subtotals_and_recomputes_totals(draft_purchase, product):
    item = add_existing_product_item(
        draft_purchase, product, quantity=3,
        unit_cost_paid=Decimal("100000.00"), unit_cost_invoiced=Decimal("100000.00"),
    )
    assert item.subtotal_paid == Decimal("300000.00")
    assert item.subtotal_invoiced == Decimal("300000.00")
    draft_purchase.refresh_from_db()
    assert draft_purchase.total_paid == Decimal("300000.00")
    assert draft_purchase.total_invoiced == Decimal("300000.00")


def test_add_existing_product_item_accumulates_totals_across_multiple_items(draft_purchase, product, category):
    other_product = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Boya Mic")
    add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    add_existing_product_item(draft_purchase, other_product, 2, Decimal("50.00"), Decimal("50.00"))
    draft_purchase.refresh_from_db()
    assert draft_purchase.total_paid == Decimal("200.00")


def test_add_new_product_item_creates_product_with_barcode_and_initial_pricing(draft_purchase, category):
    item = add_new_product_item(
        draft_purchase, category=category, name="JBL Flip 6 Speaker", quantity=8,
        unit_cost_paid=Decimal("108000.00"), unit_cost_invoiced=Decimal("112000.00"),
        selling_price=Decimal("145000.00"), price_discrepancy_note="Verbal bulk discount",
    )
    assert item.product.barcode == "PES-AUD-00001"
    assert item.product.name == "JBL Flip 6 Speaker"
    pricing = ProductPricing.objects.get(product=item.product)
    assert pricing.is_current is True
    assert pricing.wholesale_price == Decimal("108000.00")
    assert pricing.retail_price == Decimal("145000.00")


def test_discrepancy_note_required_when_costs_differ(draft_purchase, product):
    with pytest.raises(ValidationError):
        add_existing_product_item(
            draft_purchase, product, 1, Decimal("100.00"), Decimal("110.00"),
        )


def test_discrepancy_note_not_required_when_costs_match(draft_purchase, product):
    item = add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    assert item.price_discrepancy_note == ""


def test_discrepancy_note_provided_when_costs_differ_succeeds(draft_purchase, product):
    item = add_existing_product_item(
        draft_purchase, product, 1, Decimal("100.00"), Decimal("110.00"),
        price_discrepancy_note="Supplier rounding",
    )
    assert item.price_discrepancy_note == "Supplier rounding"


def test_add_item_to_received_purchase_rejected(draft_purchase, product):
    draft_purchase.status = Purchase.Status.RECEIVED
    draft_purchase.save()
    with pytest.raises(ValidationError):
        add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
