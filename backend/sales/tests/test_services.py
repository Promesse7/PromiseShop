import pytest
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from notifications.models import NotificationLog
from sales.models import Customer, Sale, SaleItem
from sales.services import complete_sale, reverse_sale
from stock.models import Inventory

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def make_product_with_stock(category, barcode, retail_price, stock):
    product = Product.objects.create(category=category, barcode=barcode, name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=retail_price,
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=stock)
    return product


def test_complete_sale_with_sufficient_stock_decrements_and_computes_total(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 3}],
    )
    assert sale.total_amount == Decimal("300.00")
    assert sale.status == Sale.SaleStatus.COMPLETED
    item = SaleItem.objects.get(sale=sale)
    assert item.unit_price == Decimal("100.00")
    assert item.subtotal == Decimal("300.00")
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 7


def test_complete_sale_creates_one_notification_per_admin(employee, admin, category):
    other_admin = Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    logs = NotificationLog.objects.filter(related_sale=sale)
    assert logs.count() == 2
    assert set(logs.values_list("recipient_id", flat=True)) == {admin.pk, other_admin.pk}
    assert all(log.type == "sale_alert" for log in logs)
    assert all(log.status == NotificationLog.NotificationStatus.SENT for log in logs)


def test_complete_sale_with_no_admins_creates_zero_notifications_and_succeeds(employee, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    assert NotificationLog.objects.filter(related_sale=sale).count() == 0


def test_complete_sale_with_customer(employee, admin, category):
    customer = Customer.objects.create(name="Jean Claude")
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=customer, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    assert sale.customer == customer


def test_complete_sale_rejects_empty_items(employee, admin):
    with pytest.raises(ValidationError):
        complete_sale(customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH, items=[])


def test_complete_sale_rejects_insufficient_stock(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=2)
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[{"product": product, "quantity": 3}],
        )
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 2


def test_complete_sale_multiline_blocks_whole_sale_if_one_line_insufficient(employee, admin, category):
    sufficient = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    insufficient = make_product_with_stock(category, "PES-AUD-00002", Decimal("50.00"), stock=1)
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[
                {"product": sufficient, "quantity": 2},
                {"product": insufficient, "quantity": 5},
            ],
        )
    assert SaleItem.objects.count() == 0
    assert Inventory.objects.get(product=sufficient).quantity_in_stock == 10
    assert Inventory.objects.get(product=insufficient).quantity_in_stock == 1


def test_complete_sale_product_never_stocked_is_insufficient(employee, admin, category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00003", name="New Thing")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("10.00"), retail_price=Decimal("20.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[{"product": product, "quantity": 1}],
        )
    assert Inventory.objects.filter(product=product).exists() is False


def test_reverse_sale_return_restores_stock_and_sets_status(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 3}],
    )
    assert Inventory.objects.get(product=product).quantity_in_stock == 7

    updated = reverse_sale(sale, Sale.SaleStatus.RETURNED)

    assert updated.status == Sale.SaleStatus.RETURNED
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_reverse_sale_cancel_restores_stock_and_sets_status(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 4}],
    )
    updated = reverse_sale(sale, Sale.SaleStatus.CANCELLED)
    assert updated.status == Sale.SaleStatus.CANCELLED
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_reverse_sale_multiline_restores_each_product(employee, admin, category):
    first = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    second = make_product_with_stock(category, "PES-AUD-00002", Decimal("50.00"), stock=5)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": first, "quantity": 2}, {"product": second, "quantity": 1}],
    )
    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    assert Inventory.objects.get(product=first).quantity_in_stock == 10
    assert Inventory.objects.get(product=second).quantity_in_stock == 5


def test_reverse_sale_rejects_non_completed_sale(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    with pytest.raises(ValidationError):
        reverse_sale(sale, Sale.SaleStatus.RETURNED)


def test_reverse_sale_rejects_invalid_new_status(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    with pytest.raises(ValidationError):
        reverse_sale(sale, Sale.SaleStatus.COMPLETED)
    assert Sale.objects.get(pk=sale.pk).status == Sale.SaleStatus.COMPLETED
    assert Inventory.objects.get(product=product).quantity_in_stock == 9


def test_notify_admins_excludes_terminated_and_inactive_admins(employee, admin, category):
    Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN, status=Employee.Status.TERMINATED,
    )
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    logs = NotificationLog.objects.filter(related_sale=sale)
    assert logs.count() == 1
    assert logs.first().recipient_id == admin.pk


def test_reverse_sale_notifies_active_admins_with_sale_reversed_type(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    logs = NotificationLog.objects.filter(related_sale=sale, type="sale_reversed")
    assert logs.count() == 1
    assert logs.first().recipient_id == admin.pk
    assert logs.first().status == NotificationLog.NotificationStatus.SENT


def test_duplicate_product_lines_aggregate_and_round_trip(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 3}, {"product": product, "quantity": 2}],
    )
    assert sale.total_amount == Decimal("500.00")
    assert SaleItem.objects.filter(sale=sale).count() == 2
    assert Inventory.objects.get(product=product).quantity_in_stock == 5

    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_complete_sale_uses_current_price_not_stale_price(employee, admin, category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("40.00"), retail_price=Decimal("80.00"),
        effective_date=date(2025, 1, 1), is_current=False,
    )
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    item = SaleItem.objects.get(sale=sale)
    assert item.unit_price == Decimal("100.00")


def test_complete_sale_computes_tax_for_standard_category(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 2}],
    )
    item = SaleItem.objects.get(sale=sale)
    assert item.tax_category == "B"
    # Retail prices are VAT-inclusive: 200.00 - 200.00/1.18, the VAT portion already
    # embedded in the price, not an additional 18% charged on top.
    assert item.tax_amount == Decimal("30.51")


def test_complete_sale_computes_zero_tax_for_exempt_category(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    product.tax_category = "A"
    product.save(update_fields=["tax_category"])
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    item = SaleItem.objects.get(sale=sale)
    assert item.tax_category == "A"
    assert item.tax_amount == Decimal("0.00")
