"""Release Module E4: find duplicates and merge them (irreversible), keeping the
append-only ledger consistent for both products."""
from datetime import date
from decimal import Decimal

import pytest
from django.db import transaction
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.merge import find_duplicate_pairs, merge_preview, merge_products, merged_product_ids
from catalog.models import Category, Product, ProductBarcodeAlias, ProductMerge, ProductPricing
from purchasing.models import Purchase, PurchaseItem, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from sales.models import SaleItem
from sales.services import complete_sale
from stock.ledger import ledger_mismatches
from stock.models import EquipmentUnit, Inventory, InventoryAdjustment, StockMovement
from stock.services import adjust_inventory, weighted_average_cost

pytestmark = pytest.mark.django_db


def make_employee(username, role):
    return Employee.objects.create_user(
        username=username, password="pass12345", full_name=username,
        hire_date=date(2025, 1, 1), role=role,
    )


def client_for(employee):
    client = APIClient()
    token = client.post(
        "/api/auth/login/", {"username": employee.username, "password": "pass12345"}, format="json"
    ).json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def admin():
    return make_employee("admin1", Employee.Role.ADMIN)


@pytest.fixture
def audio():
    return Category.objects.create(name="Audio", code="AUD")


def make_product(category, name, barcode, retail="100.00"):
    product = Product.objects.create(category=category, barcode=barcode, name=name)
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal(retail),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    return product


def receive(product, quantity, cost, user):
    purchase = Purchase.objects.create(
        supplier=Supplier.objects.get_or_create(name="S")[0], employee=user, purchase_date=date(2026, 1, 1)
    )
    add_existing_product_item(purchase, product, quantity, Decimal(cost), Decimal(cost))
    receive_purchase(purchase, user=user)


@pytest.fixture
def pair(audio, admin):
    keep = make_product(audio, "JBL Flip 6", "PES-AUD-00001")
    dup = make_product(audio, "JBL Flip6", "PES-AUD-00002", retail="110.00")
    receive(keep, 5, "40.00", admin)
    receive(dup, 6, "60.00", admin)
    complete_sale(customer=None, employee=admin, payment_method="cash", items=[{"product": dup, "quantity": 1}])
    adjust_inventory(Inventory.objects.get(product=dup), "to_damaged", 2, "dropped", admin)
    EquipmentUnit.objects.create(product=dup, serial_number="SN-1", status="in_stock")
    ProductBarcodeAlias.objects.create(barcode="OLD-DUP", product=dup)
    return keep, dup


def buckets(product):
    inv = Inventory.objects.get(product=product)
    return inv.quantity_in_stock, inv.quantity_in_use, inv.quantity_damaged


def test_merge_moves_history_and_stock_and_keeps_the_ledger_consistent(pair, admin):
    keep, dup = pair
    total_before = tuple(a + b for a, b in zip(buckets(keep), buckets(dup)))
    dup_movements_before = StockMovement.objects.filter(product=dup).count()
    dup_adjustments_before = InventoryAdjustment.objects.filter(inventory__product=dup).count()

    merge = merge_products(keep, dup, admin, "Typed twice")

    keep.refresh_from_db()
    dup.refresh_from_db()
    # every bucket total preserved, all on keep now
    assert buckets(keep) == total_before
    assert buckets(dup) == (0, 0, 0)
    assert ledger_mismatches() == []
    # paired merge movements, duplicate's own history untouched
    outs = StockMovement.objects.filter(product=dup, movement_type="merge_out")
    ins = StockMovement.objects.filter(product=keep, movement_type="merge_in")
    assert {(m.bucket, m.quantity_delta) for m in outs} == {("in_stock", -3), ("damaged", -2)}
    assert {(m.bucket, m.quantity_delta) for m in ins} == {("in_stock", 3), ("damaged", 2)}
    assert all(m.source_type == "product_merge" and m.source_id == merge.merge_id for m in [*outs, *ins])
    assert StockMovement.objects.filter(product=dup).count() == dup_movements_before + 2
    assert InventoryAdjustment.objects.filter(inventory__product=dup).count() == dup_adjustments_before
    # documents move
    assert not SaleItem.objects.filter(product=dup).exists()
    assert SaleItem.objects.filter(product=keep).count() == 1
    assert not PurchaseItem.objects.filter(product=dup).exists()
    assert PurchaseItem.objects.filter(product=keep).count() == 2
    assert EquipmentUnit.objects.get(serial_number="SN-1").product == keep
    # prices: keep's current price stays current; the duplicate's become history
    assert ProductPricing.objects.get(product=keep, is_current=True).retail_price == Decimal("100.00")
    assert ProductPricing.objects.filter(product=keep).count() == 2
    assert not ProductPricing.objects.filter(product=dup).exists()
    # barcodes: the duplicate's barcode and its aliases now scan as keep
    assert set(ProductBarcodeAlias.objects.filter(product=keep).values_list("barcode", flat=True)) == {
        "PES-AUD-00002", "OLD-DUP",
    }
    # duplicate retired
    assert dup.is_active is False
    assert dup.name == "[merged into JBL Flip 6]"
    # log
    assert merge.keep == keep and merge.duplicate == dup and merge.merged_by == admin
    assert merge.reason == "Typed twice"
    assert merge.counts == {
        "sale_items": 1, "purchase_items": 1, "equipment_units": 1, "price_rows": 1, "barcode_aliases": 2, "bundle_components": 0,
        "in_stock": 3, "in_use": 0, "damaged": 2,
    }
    # costs: purchases of both now average together
    assert weighted_average_cost(keep) == Decimal("50.91")
    assert merged_product_ids(keep.pk) == {keep.pk, dup.pk}


def test_merge_preview_counts_without_writing(pair):
    keep, dup = pair
    preview = merge_preview(keep, dup)
    assert preview["counts"]["sale_items"] == 1 and preview["counts"]["in_stock"] == 3
    assert ProductMerge.objects.count() == 0
    assert dup.sale_items.count() == 1


def test_merge_into_a_product_with_no_inventory_row(audio, admin):
    keep = make_product(audio, "Kettle", "PES-AUD-00010")
    dup = make_product(audio, "Kettle!", "PES-AUD-00011")
    receive(dup, 4, "10.00", admin)

    merge_products(keep, dup, admin, "dup")

    assert buckets(keep) == (4, 0, 0)
    assert ledger_mismatches() == []


def test_merge_refusals(pair, admin, audio):
    keep, dup = pair
    with pytest.raises(Exception):
        merge_products(keep, keep, admin, "same")
    with pytest.raises(Exception):
        merge_products(keep, dup, admin, "   ")
    merge_products(keep, dup, admin, "ok")
    third = make_product(audio, "Third", "PES-AUD-00003")
    with pytest.raises(Exception):
        merge_products(keep, dup, admin, "again")          # already merged
    with pytest.raises(Exception):
        merge_products(dup, third, admin, "into merged")   # can't keep a merged product


def test_failed_merge_changes_nothing(pair, admin, monkeypatch):
    keep, dup = pair
    from catalog import merge as merge_module

    def boom(keep, duplicate, context):
        raise RuntimeError("step failed")

    monkeypatch.setattr(merge_module, "MERGE_STEPS", [*merge_module.MERGE_STEPS[:2], ("boom", boom)])
    with pytest.raises(RuntimeError):
        merge_products(keep, dup, admin, "x")
    assert SaleItem.objects.filter(product=dup).count() == 1
    assert ProductMerge.objects.count() == 0
    dup.refresh_from_db()
    assert dup.is_active is True


def test_merge_steps_are_an_extensible_list():
    from catalog.merge import MERGE_STEPS
    names = [name for name, _ in MERGE_STEPS]
    assert names[:5] == ["sale_items", "purchase_items", "equipment_units", "price_rows", "barcode_aliases"]
    assert names[-1] == "stock"


# --- aliases scan as the kept product -----------------------------------------

def test_search_and_alias_list_find_the_kept_product_by_the_old_barcode(pair, admin):
    keep, dup = pair
    merge_products(keep, dup, admin, "dup")
    client = client_for(admin)

    results = client.get("/api/products/search/", {"q": "PES-AUD-00002"}).json()["results"]
    assert [r["product_id"] for r in results][:1] == [keep.product_id]
    assert results[0]["match"] == "barcode"

    aliases = client.get("/api/product-barcode-aliases/").json()["results"]
    assert {"barcode": "PES-AUD-00002", "product": keep.product_id} in [
        {"barcode": a["barcode"], "product": a["product"]} for a in aliases
    ]


# --- movements endpoint follows merges ---------------------------------------

def test_movements_for_the_kept_product_include_the_merged_products(pair, admin):
    keep, dup = pair
    merge_products(keep, dup, admin, "dup")
    rows = client_for(admin).get("/api/stock/movements/", {"product": keep.pk, "page_size": 200}).json()["results"]
    product_ids = {r["product"] for r in rows}
    assert product_ids == {keep.pk, dup.pk}


# --- duplicates finder --------------------------------------------------------

def test_find_duplicate_pairs_lists_similar_active_products(audio):
    a = make_product(audio, "Samsung 43 inch TV", "PES-AUD-00001")
    b = make_product(audio, "Samsung 43inch TV", "PES-AUD-00002")
    make_product(audio, "Kettle", "PES-AUD-00003")
    inactive = make_product(audio, "Samsung 43 inch TV old", "PES-AUD-00004")
    inactive.is_active = False
    inactive.save()

    pairs = find_duplicate_pairs()

    assert [(p["a"]["product_id"], p["b"]["product_id"]) for p in pairs] == [(a.pk, b.pk)]
    assert pairs[0]["score"] >= 0.6


# --- API ---------------------------------------------------------------------

def test_merge_api_preview_and_commit(pair, admin):
    keep, dup = pair
    client = client_for(admin)

    preview = client.get(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk})
    assert preview.status_code == 200
    assert preview.json()["counts"]["in_stock"] == 3
    assert preview.json()["duplicate"]["name"] == "JBL Flip6"

    done = client.post(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk, "reason": "dup"}, format="json")
    assert done.status_code == 201, done.content
    assert done.json()["counts"]["sale_items"] == 1

    again = client.post(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk, "reason": "dup"}, format="json")
    assert again.status_code == 400


def test_merge_api_needs_a_reason_and_a_duplicate(pair, admin):
    keep, dup = pair
    client = client_for(admin)
    assert client.post(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk}, format="json").status_code == 400
    assert client.post(f"/api/products/{keep.pk}/merge/", {"reason": "x"}, format="json").status_code == 400


def test_duplicates_api(audio, admin):
    make_product(audio, "Samsung 43 inch TV", "PES-AUD-00001")
    make_product(audio, "Samsung 43inch TV", "PES-AUD-00002")
    body = client_for(admin).get("/api/products/duplicates/").json()
    assert len(body["results"]) == 1
    assert set(body["results"][0]["a"]) >= {"product_id", "name", "barcode", "category_name", "in_stock"}


@pytest.mark.parametrize("role", [Employee.Role.MANAGER, Employee.Role.SALES_STAFF])
def test_merge_and_duplicates_are_admin_only(role, pair):
    keep, dup = pair
    client = client_for(make_employee("user1", role))
    assert client.get("/api/products/duplicates/").status_code == 403
    assert client.get(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk}).status_code == 403
    assert client.post(f"/api/products/{keep.pk}/merge/", {"duplicate": dup.pk, "reason": "x"}, format="json").status_code == 403


def test_check_stock_ledger_command_is_clean_after_a_merge_and_an_import(pair, admin):
    from io import StringIO

    from django.core.management import call_command

    from catalog.importer import commit_import

    keep, dup = pair
    merge_products(keep, dup, admin, "dup")
    commit_import(
        "category_code,name,retail_price,cost_price,opening_qty\nAUD,Imported thing,10,4,7\n", admin
    )
    out = StringIO()
    call_command("check_stock_ledger", stdout=out)
    assert "consistent" in out.getvalue()
