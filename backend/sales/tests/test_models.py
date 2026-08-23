import pytest
from datetime import date
from accounts.models import Employee
from catalog.models import Category, Product
from sales.models import Customer, Sale, SaleItem

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_sale_allows_null_customer_for_walk_in(employee):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    assert sale.customer is None
    assert sale.status == Sale.SaleStatus.COMPLETED


def test_sale_with_customer(employee):
    customer = Customer.objects.create(name="Jean Claude")
    sale = Sale.objects.create(employee=employee, customer=customer, total_amount="145000.00")
    assert sale.customer == customer


def test_sale_item_links_sale_and_product(employee, product):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    item = SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price="145000.00", subtotal="145000.00"
    )
    assert item.sale == sale
    assert item.product == product
