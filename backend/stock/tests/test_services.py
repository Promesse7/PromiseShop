import pytest
from datetime import date
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import EquipmentUnit, EquipmentStatusHistory, Inventory
from stock.services import change_equipment_status

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


@pytest.fixture
def unit(product):
    return EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )


def test_change_status_writes_history_and_updates_unit(unit, employee):
    updated = change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR,
        reason="Speaker rattling", changed_by=employee,
    )
    assert updated.status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    history = EquipmentStatusHistory.objects.get(unit=unit)
    assert history.previous_status == EquipmentUnit.UnitStatus.IN_STOCK
    assert history.new_status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    assert history.changed_by == employee
    assert history.notes == "Speaker rattling"


def test_change_status_sets_assigned_to_when_given(unit, employee):
    other_employee = Employee.objects.create_user(
        username="tech1", password="techpass", full_name="Tech One",
        hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
    )
    updated = change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.IN_USE,
        reason="Demo loan", changed_by=employee, assigned_to=other_employee,
    )
    assert updated.assigned_to == other_employee


def test_change_status_rejects_invalid_status(unit, employee):
    with pytest.raises(ValidationError):
        change_equipment_status(
            unit, new_status="not_a_real_status", reason="test", changed_by=employee,
        )


def test_change_status_rejects_missing_reason(unit, employee):
    with pytest.raises(ValidationError):
        change_equipment_status(
            unit, new_status=EquipmentUnit.UnitStatus.DAMAGED, reason="", changed_by=employee,
        )


def test_change_status_does_not_touch_inventory(unit, employee, product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.SOLD, reason="Sold at counter", changed_by=employee,
    )
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 10


def test_multiple_status_changes_build_a_chain(unit, employee):
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR, reason="Rattle", changed_by=employee,
    )
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.IN_STOCK, reason="Fixed", changed_by=employee,
    )
    assert EquipmentStatusHistory.objects.filter(unit=unit).count() == 2
    latest = EquipmentStatusHistory.objects.filter(unit=unit).order_by("-change_date").first()
    assert latest.previous_status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    assert latest.new_status == EquipmentUnit.UnitStatus.IN_STOCK
