"""Module D against the rest of the system: money reports, product merge, product delete."""
import pytest

from catalog.merge import merge_products
from operations.models import InternalConsumption, ShopAsset
from operations.services import consume_stock, take_from_stock_as_asset
from stock.ledger import ledger_mismatches

from .conftest import client_for, make_product, receive

pytestmark = pytest.mark.django_db


def test_consumption_is_not_an_expense(cable, admin):
    client = client_for(admin)
    before = client.get("/api/dashboard/financial-snapshot/?period=month").json()

    consume_stock(cable, 3, "repair", "Cables for the counter", taken_by=admin, user=admin)
    after = client.get("/api/dashboard/financial-snapshot/?period=month").json()

    assert after["total_expenses"] == before["total_expenses"]
    assert after["net"] == before["net"]


def test_consumption_is_not_cogs_or_revenue(cable, admin):
    client = client_for(admin)
    url = f"/api/dashboard/profitability/?period=all&product={cable.product_id}"
    before = client.get(url).json()["products"][0]

    consume_stock(cable, 3, "repair", "Cables", taken_by=admin, user=admin)
    take_from_stock_as_asset(cable, user=admin, reason="Spare cable kit")
    after = client.get(url).json()["products"][0]

    for key in ("units_sold", "revenue", "cogs_paid", "cogs_invoiced"):
        assert after[key] == before[key]


def test_merge_moves_consumptions_and_assets(category, admin):
    keep = make_product(category, "HDMI Cable 2m", "PES-ACC-00010")
    duplicate = make_product(category, "HDMI cable 2 m", "PES-ACC-00011")
    receive(duplicate, 5, "1000.00", admin)
    record = consume_stock(duplicate, 1, "repair", "x", taken_by=admin, user=admin)
    asset = take_from_stock_as_asset(duplicate, user=admin, reason="y")

    merge = merge_products(keep, duplicate, admin, "Same cable")

    record.refresh_from_db()
    asset.refresh_from_db()
    assert record.product == keep and asset.product == keep
    assert merge.counts["shop_use"] == 2
    assert ledger_mismatches() == []


def test_product_with_shop_use_cannot_be_deleted(category, admin):
    product = make_product(category, "Toner", "PES-ACC-00020")
    ShopAsset.objects.create(name="Toner box", product=product, source="pre_owned", created_by=admin)

    response = client_for(admin).delete(f"/api/products/{product.product_id}/")

    assert response.status_code == 400
    assert InternalConsumption.objects.count() == 0
