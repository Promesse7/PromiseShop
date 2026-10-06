"""Module D services: consumption, shop assets, replacement, return to stock."""
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.exceptions import ValidationError

from operations import services
from operations.models import InternalConsumption, ShopAsset, ShopAssetEvent
from operations.services import (
    ApprovalRequired, change_asset_status, consume_stock, register_asset, replace_asset,
    return_asset_to_stock, take_from_stock_as_asset,
)
from stock.ledger import ledger_mismatches
from stock.models import EquipmentUnit, Inventory, StockMovement
from stock.services import change_equipment_status

from .conftest import make_product, receive, stock_of

pytestmark = pytest.mark.django_db

MANAGER_OK = {"approver_username": "manager1", "pin": "4321"}


# --- consumption ---------------------------------------------------------------

def test_consume_takes_stock_and_records_value_at_average_cost(cable, admin):
    record = consume_stock(cable, 2, "repair", "Fixed the counter display", taken_by=admin, user=admin)

    assert stock_of(cable) == 8
    assert record.unit_cost == Decimal("2000.00")
    assert record.total_value == Decimal("4000.00")
    assert record.recorded_by == admin and record.approved_by is None
    movement = StockMovement.objects.get(source_type="consumption", source_id=record.consumption_id)
    assert movement.movement_type == "internal_consumption"
    assert movement.quantity_delta == -2 and movement.bucket == "in_stock"
    assert ledger_mismatches() == []


def test_consume_uses_the_average_cost_at_that_moment(cable, admin):
    first = consume_stock(cable, 1, "repair", "First", taken_by=admin, user=admin)
    receive(cable, 10, "4000.00", admin)  # average becomes (10×2000 + 10×4000) / 20 = 3000
    second = consume_stock(cable, 1, "repair", "Second", taken_by=admin, user=admin)

    assert first.unit_cost == Decimal("2000.00")
    assert second.unit_cost == Decimal("3000.00")


def test_consume_refused_above_in_stock(cable, admin):
    with pytest.raises(ValidationError):
        consume_stock(cable, 11, "repair", "Too many", taken_by=admin, user=admin)
    assert stock_of(cable) == 10
    assert InternalConsumption.objects.count() == 0


def test_consume_needs_a_reason_and_a_valid_purpose(cable, admin):
    with pytest.raises(ValidationError):
        consume_stock(cable, 1, "repair", "  ", taken_by=admin, user=admin)
    with pytest.raises(ValidationError):
        consume_stock(cable, 1, "party", "Why", taken_by=admin, user=admin)
    with pytest.raises(ValidationError):
        consume_stock(cable, 0, "repair", "Why", taken_by=admin, user=admin)


def test_consume_with_unknown_cost_stores_null_value(category, admin):
    product = make_product(category, "Unpriced Toner", "PES-ACC-00099")
    Inventory.objects.create(product=product, quantity_in_stock=0)
    # Opening stock without a cost — no average exists.
    from stock.services import record_movement
    from django.db import transaction
    with transaction.atomic():
        inventory = Inventory.objects.select_for_update().get(product=product)
        record_movement(inventory, "in_stock", 3, "adjust_count", None, admin, reason="Found", unit_cost=None)

    record = consume_stock(product, 1, "other", "Printer toner", taken_by=admin, user=admin)

    assert record.unit_cost is None and record.total_value is None


@pytest.mark.parametrize("role_fixture", ["staff", "technician"])
def test_staff_need_a_manager_pin_to_consume(request, role_fixture, cable, manager):
    worker = request.getfixturevalue(role_fixture)
    with pytest.raises(ApprovalRequired):
        consume_stock(cable, 1, "repair", "Cable for till", taken_by=worker, user=worker)
    assert stock_of(cable) == 10

    record = consume_stock(cable, 1, "repair", "Cable for till", taken_by=worker, user=worker, approval=MANAGER_OK)
    assert record.approved_by == manager


def test_wrong_pin_is_refused(cable, staff, manager):
    with pytest.raises(ValidationError):
        consume_stock(cable, 1, "repair", "x", taken_by=staff, user=staff,
                      approval={"approver_username": "manager1", "pin": "0000"})
    assert stock_of(cable) == 10


def test_consumption_rows_are_append_only(cable, admin):
    from stock.models import AppendOnlyError
    record = consume_stock(cable, 1, "repair", "x", taken_by=admin, user=admin)
    with pytest.raises(AppendOnlyError):
        record.save()
    with pytest.raises(AppendOnlyError):
        InternalConsumption.objects.all().delete()


def test_consumption_can_point_at_the_asset_it_fixed(cable, printer, admin):
    asset = take_from_stock_as_asset(printer, user=admin, reason="Office printer")
    record = consume_stock(cable, 1, "repair", "New cable for the printer", taken_by=admin, user=admin, asset=asset)
    assert record.shop_asset == asset


# --- assets ----------------------------------------------------------------------

def test_register_pre_owned_asset_writes_no_movement(admin):
    asset = register_asset(name="Shop laptop", user=admin, serial="LAP-1", location="Office",
                           acquisition_value=Decimal("500000"), reason="Owned before the system")

    assert asset.source == "pre_owned" and asset.status == "in_service"
    assert StockMovement.objects.count() == 0
    event = asset.events.get()
    assert event.from_status is None and event.to_status == "in_service"


def test_register_is_admin_or_manager_only(staff):
    with pytest.raises(ApprovalRequired):
        register_asset(name="Chair", user=staff, reason="x")


def test_take_from_stock_moves_one_unit_at_average_cost(printer, admin):
    asset = take_from_stock_as_asset(printer, user=admin, reason="Our own printer", location="Counter")

    assert stock_of(printer) == 2
    assert asset.source == "from_stock" and asset.product == printer
    assert asset.acquisition_value == Decimal("200000.00")
    assert asset.name == "Laser Printer"
    movement = StockMovement.objects.get(source_type="shop_asset", source_id=asset.asset_id)
    assert movement.movement_type == "to_shop_asset" and movement.quantity_delta == -1
    assert ledger_mismatches() == []


def test_take_a_serialised_unit_records_its_history(printer, admin):
    unit = EquipmentUnit.objects.create(product=printer, serial_number="SN-1", status="in_stock")

    asset = take_from_stock_as_asset(printer, user=admin, reason="Office", unit=unit)

    unit.refresh_from_db()
    assert unit.status == "shop_asset"
    assert unit.status_history.filter(new_status="shop_asset").exists()
    assert asset.equipment_unit == unit and asset.serial == "SN-1"


def test_take_refuses_a_unit_that_is_not_in_stock(printer, admin):
    unit = EquipmentUnit.objects.create(product=printer, serial_number="SN-2", status="sold")
    with pytest.raises(ValidationError):
        take_from_stock_as_asset(printer, user=admin, reason="x", unit=unit)
    assert stock_of(printer) == 3


def test_take_refused_when_out_of_stock(category, admin):
    product = make_product(category, "Empty", "PES-ACC-00050")
    with pytest.raises(ValidationError):
        take_from_stock_as_asset(product, user=admin, reason="x")


def test_change_status_writes_an_event(printer, admin):
    asset = take_from_stock_as_asset(printer, user=admin, reason="x")
    change_asset_status(asset, "under_repair", "Paper jam", admin)

    asset.refresh_from_db()
    assert asset.status == "under_repair"
    assert asset.events.filter(from_status="in_service", to_status="under_repair").exists()


def test_technician_may_toggle_repair_only_with_approval(printer, admin, technician, manager):
    asset = take_from_stock_as_asset(printer, user=admin, reason="x")
    with pytest.raises(ApprovalRequired):
        change_asset_status(asset, "under_repair", "Jam", technician)
    change_asset_status(asset, "under_repair", "Jam", technician, approval=MANAGER_OK)
    with pytest.raises(ApprovalRequired):
        change_asset_status(asset, "retired", "Old", technician, approval=MANAGER_OK)


def test_closed_assets_cannot_change(printer, admin):
    asset = take_from_stock_as_asset(printer, user=admin, reason="x")
    change_asset_status(asset, "retired", "Too old", admin)
    with pytest.raises(ValidationError):
        change_asset_status(asset, "in_service", "Back", admin)


# --- replace -----------------------------------------------------------------------

def test_replace_from_stock_in_one_action(printer, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office printer", location="Office")

    new = replace_asset(broken, "damaged", "Fuser burnt out", admin, replacement_product=printer)

    broken.refresh_from_db()
    assert broken.status == "damaged"
    assert new.status == "in_service" and new.replaces == broken and new.location == "Office"
    assert broken.events.filter(to_status="damaged", replaced_by=new).exists()
    assert stock_of(printer) == 1
    assert ledger_mismatches() == []


def test_replace_is_atomic_when_taking_the_replacement_fails(printer, category, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office printer")
    empty = make_product(category, "Out of stock printer", "PES-ACC-00077")

    with pytest.raises(ValidationError):
        replace_asset(broken, "damaged", "Burnt", admin, replacement_product=empty)

    broken.refresh_from_db()
    assert broken.status == "in_service"
    assert broken.events.count() == 1
    assert ShopAsset.objects.count() == 1


def test_replace_is_atomic_when_step_two_raises(printer, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office printer")
    with mock.patch.object(services, "_take_from_stock", side_effect=RuntimeError("boom")):
        with pytest.raises(RuntimeError):
            replace_asset(broken, "damaged", "Burnt", admin, replacement_product=printer)

    broken.refresh_from_db()
    assert broken.status == "in_service"
    assert ShopAssetEvent.objects.filter(asset=broken).count() == 1
    assert stock_of(printer) == 2


def test_replace_with_a_spare_asset(printer, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office", location="Office")
    spare = take_from_stock_as_asset(printer, user=admin, reason="Spare", is_spare=True, location="Store")

    new = replace_asset(broken, "retired", "Beyond repair", admin, spare_asset=spare)

    assert new == spare
    spare.refresh_from_db()
    assert spare.is_spare is False and spare.location == "Office" and spare.replaces == broken
    assert stock_of(printer) == 1  # no extra stock taken


def test_replace_refuses_a_non_spare_or_busy_asset(printer, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="a")
    other = take_from_stock_as_asset(printer, user=admin, reason="b")
    with pytest.raises(ValidationError):
        replace_asset(broken, "damaged", "x", admin, spare_asset=other)


def test_staff_replace_needs_approval(printer, admin, staff, manager):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office")
    with pytest.raises(ApprovalRequired):
        replace_asset(broken, "damaged", "x", staff, replacement_product=printer)
    new = replace_asset(broken, "damaged", "x", staff, replacement_product=printer, approval=MANAGER_OK)
    assert new.events.first().approved_by == manager


def test_replace_needs_a_source(printer, admin):
    broken = take_from_stock_as_asset(printer, user=admin, reason="Office")
    with pytest.raises(ValidationError):
        replace_asset(broken, "damaged", "x", admin)


# --- return to stock ----------------------------------------------------------------

@pytest.mark.parametrize("bucket,field", [("in_stock", "quantity_in_stock"), ("damaged", "quantity_damaged")])
def test_return_asset_to_stock(printer, admin, bucket, field):
    unit = EquipmentUnit.objects.create(product=printer, serial_number="SN-9", status="in_stock")
    asset = take_from_stock_as_asset(printer, user=admin, reason="x", unit=unit)
    before = getattr(Inventory.objects.get(product=printer), field)

    return_asset_to_stock(asset, bucket, "Repaired, sell it", admin)

    asset.refresh_from_db()
    unit.refresh_from_db()
    assert asset.status == "returned_to_stock"
    assert unit.status == bucket
    assert getattr(Inventory.objects.get(product=printer), field) == before + 1
    assert StockMovement.objects.filter(movement_type="from_shop_asset", bucket=bucket).count() == 1
    assert ledger_mismatches() == []


def test_return_is_admin_only(printer, admin, manager):
    asset = take_from_stock_as_asset(printer, user=admin, reason="x")
    with pytest.raises(ApprovalRequired):
        return_asset_to_stock(asset, "in_stock", "x", manager)


def test_pre_owned_asset_without_product_cannot_go_to_stock(admin):
    asset = register_asset(name="Chair", user=admin, reason="Owned")
    with pytest.raises(ValidationError):
        return_asset_to_stock(asset, "in_stock", "x", admin)


def test_equipment_unit_status_change_to_shop_asset_is_valid(printer, admin):
    unit = EquipmentUnit.objects.create(product=printer, serial_number="SN-5", status="in_stock")
    change_equipment_status(unit, "shop_asset", "check", admin)
