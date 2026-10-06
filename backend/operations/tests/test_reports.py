"""operations.reports — the aggregates Module H reads."""
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from operations import reports
from operations.models import ShopAssetEvent
from operations.services import change_asset_status, consume_stock, replace_asset, take_from_stock_as_asset

pytestmark = pytest.mark.django_db


def today():
    return timezone.localdate()


@pytest.fixture
def history(cable, printer, admin, staff, manager):
    consume_stock(cable, 2, "repair", "a", taken_by=admin, user=admin)             # 4000
    consume_stock(cable, 1, "shop_setup", "b", taken_by=staff, user=admin)         # 2000
    asset = take_from_stock_as_asset(printer, user=admin, reason="Office")         # 200000 asset
    return asset


def test_consumption_totals(history):
    total = reports.consumption_total(today(), today())
    assert total == {"count": 2, "quantity": 3, "value": Decimal("6000.00"), "unknown_cost_count": 0}


def test_consumption_by_purpose(history):
    rows = {r["purpose"]: r for r in reports.consumption_by_purpose(today(), today())}
    assert rows["repair"]["value"] == Decimal("4000.00") and rows["repair"]["quantity"] == 2
    assert rows["shop_setup"]["value"] == Decimal("2000.00")


def test_consumption_by_month(history):
    rows = reports.consumption_by_month(today(), today())
    month = today().strftime("%Y-%m")
    assert {(r["month"], r["purpose"]) for r in rows} == {(month, "repair"), (month, "shop_setup")}


def test_consumption_by_employee(history, staff, admin):
    rows = {r["employee_id"]: r for r in reports.consumption_by_employee(today(), today())}
    assert rows[admin.pk]["value"] == Decimal("4000.00")
    assert rows[staff.pk]["employee_name"] == "Staff1" and rows[staff.pk]["quantity"] == 1


def test_materials_used_internally_splits_consumed_and_assets(history):
    result = reports.materials_used_internally(today(), today())
    assert result["consumed_value"] == Decimal("6000.00")
    assert result["taken_as_assets_value"] == Decimal("200000.00")
    assert result["total_value"] == Decimal("206000.00")


def test_outside_the_period_counts_nothing(history):
    yesterday = today() - timedelta(days=1)
    assert reports.consumption_total(yesterday, yesterday)["count"] == 0
    assert reports.materials_used_internally(yesterday, yesterday)["total_value"] == Decimal("0.00")


def test_assets_damaged(history, admin):
    change_asset_status(history, "damaged", "Dropped", admin)
    result = reports.assets_damaged(today(), today())
    assert result == {"count": 1, "value": Decimal("200000.00")}


def test_replacements_per_asset_and_frequent_failures(printer, admin):
    from .conftest import receive
    receive(printer, 5, "200000.00", admin)
    first = take_from_stock_as_asset(printer, user=admin, reason="Office")
    second = replace_asset(first, "damaged", "Broke", admin, replacement_product=printer)
    third = replace_asset(second, "damaged", "Broke again", admin, replacement_product=printer)
    replace_asset(third, "damaged", "And again", admin, replacement_product=printer)

    rows = reports.replacements_per_asset(days=90)
    assert sum(r["replacements"] for r in rows) == 3
    # The office printer slot failed 3 times: the chain is followed back to the first asset.
    chains = reports.frequent_replacements(threshold=2, days=90)
    assert len(chains) == 1 and chains[0]["replacements"] == 3 and chains[0]["root_asset_id"] == first.asset_id


def test_old_replacements_fall_out_of_the_window(printer, admin):
    first = take_from_stock_as_asset(printer, user=admin, reason="Office")
    replace_asset(first, "damaged", "Broke", admin, replacement_product=printer)
    ShopAssetEvent.objects.filter(replaced_by__isnull=False).update(created_at=timezone.now() - timedelta(days=200))
    assert reports.replacements_per_asset(days=90) == []
