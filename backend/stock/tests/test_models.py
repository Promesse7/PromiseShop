import pytest
from datetime import date
from django.db import IntegrityError
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory

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


def test_inventory_is_one_per_product(product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    with pytest.raises(IntegrityError):
        Inventory.objects.create(product=product, quantity_in_stock=5)


def test_equipment_unit_serial_number_must_be_unique(product):
    EquipmentUnit.objects.create(
        product=product, serial_number="JBL6-KX2093", status=EquipmentUnit.UnitStatus.IN_STOCK
    )
    with pytest.raises(IntegrityError):
        EquipmentUnit.objects.create(
            product=product, serial_number="JBL6-KX2093", status=EquipmentUnit.UnitStatus.IN_STOCK
        )


def test_equipment_status_history_chain(product, employee):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="JBL6-KX2094", status=EquipmentUnit.UnitStatus.IN_STOCK
    )
    history = EquipmentStatusHistory.objects.create(
        unit=unit,
        previous_status=EquipmentUnit.UnitStatus.IN_STOCK,
        new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR,
        changed_by=employee,
        notes="Speaker rattling",
    )
    assert history.unit == unit
    assert history.changed_by == employee
