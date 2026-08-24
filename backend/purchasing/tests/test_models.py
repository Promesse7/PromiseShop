import pytest
from datetime import date
from django.db import IntegrityError
from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Supplier, Purchase, PurchaseItem

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
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_create_purchase_with_default_payment_status(employee, supplier):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
        total_paid="500000.00", total_invoiced="500000.00",
    )
    assert purchase.payment_status == Purchase.PaymentStatus.PAID


def test_purchase_item_requires_valid_purchase_and_product(employee, supplier, product):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
        total_paid="145000.00", total_invoiced="145000.00",
    )
    item = PurchaseItem.objects.create(
        purchase=purchase, product=product, quantity=1,
        unit_cost_paid="108000.00", unit_cost_invoiced="112000.00",
        subtotal_paid="108000.00", subtotal_invoiced="112000.00",
    )
    assert item.purchase == purchase
    assert item.product == product


def test_purchase_item_cannot_be_created_without_purchase(product):
    with pytest.raises(IntegrityError):
        PurchaseItem.objects.create(
            purchase=None, product=product, quantity=1,
            unit_cost_paid="1.00", unit_cost_invoiced="1.00",
            subtotal_paid="1.00", subtotal_invoiced="1.00",
        )


def test_new_purchase_defaults_to_draft_status_and_zero_totals(employee, supplier):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
    )
    assert purchase.status == Purchase.Status.DRAFT
    assert purchase.total_paid == 0
    assert purchase.total_invoiced == 0
