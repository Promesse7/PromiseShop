"""Release Module F: packs and bundles on purchase lines — quantities, cost
split, receive/cancel through the ledger, weighted average cost, templates."""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from purchasing.bundles import split_cost, default_split
from purchasing.costing import received_cost_totals
from purchasing.models import (
    BundleTemplate, Purchase, PurchaseItem, PurchaseItemComponent, Supplier,
)
from purchasing.services import (
    add_bundle_item, add_existing_product_item, cancel_purchase, receive_purchase, update_item,
)
from sales.services import complete_sale
from stock.ledger import ledger_mismatches
from stock.models import Inventory, StockMovement
from stock.services import weighted_average_cost

pytestmark = pytest.mark.django_db

D = Decimal


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


def priced(category, barcode, name, retail):
    product = Product.objects.create(category=category, barcode=barcode, name=name)
    if retail is not None:
        ProductPricing.objects.create(
            product=product, wholesale_price=D("1.00"), retail_price=D(retail),
            effective_date=date(2026, 1, 1), is_current=True,
        )
    return product


@pytest.fixture
def manager():
    return make_employee("manager1", Employee.Role.MANAGER)


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def category():
    return Category.objects.create(name="TV", code="TV")


@pytest.fixture
def tv(category):
    return priced(category, "PES-TV-00001", "Canal TV 43", "500000.00")


@pytest.fixture
def decoder(category):
    return priced(category, "PES-TV-00002", "Canalbox decoder", "25000.00")


@pytest.fixture
def cable(category):
    return priced(category, "PES-TV-00003", "HDMI cable", "3000.00")


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Canal+ Rwanda")


@pytest.fixture
def purchase(supplier, manager):
    return Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 10, 1))


def canalbox(purchase, tv, decoder, **extra):
    return add_bundle_item(
        purchase, bundle_name="Canalbox TV kit", quantity=1,
        unit_cost_paid=D("800000.00"), unit_cost_invoiced=D("820000.00"),
        price_discrepancy_note="Supplier discount", components=[
            {"product": tv, "qty_per_bundle": 1},
            {"product": decoder, "qty_per_bundle": 20},
        ], **extra,
    )


# --- the split -----------------------------------------------------------------

def test_split_cost_is_proportional_and_sums_exactly():
    assert split_cost(D("100.00"), [D("3"), D("1")]) == [D("75.00"), D("25.00")]


def test_split_cost_gives_the_rounding_remainder_to_the_largest_share():
    shares = split_cost(D("100.01"), [D("2"), D("1")])
    assert shares == [D("66.68"), D("33.33")]
    assert sum(shares) == D("100.01")


def test_split_cost_remainder_goes_to_the_most_expensive_even_when_listed_last():
    shares = split_cost(D("100.00"), [D("1"), D("1"), D("1.0001")])
    assert sum(shares) == D("100.00")
    assert shares[2] == max(shares)


def test_default_split_is_proportional_to_retail_times_quantity():
    split = default_split([(D("500000"), 1), (D("25000"), 20)], D("800000.00"), D("820000.00"))
    assert split == [(D("400000.00"), D("410000.00")), (D("400000.00"), D("410000.00"))]


def test_default_split_falls_back_to_quantity_when_nothing_is_priced():
    split = default_split([(None, 1), (None, 3)], D("100.00"), D("100.00"))
    assert split == [(D("25.00"), D("25.00")), (D("75.00"), D("75.00"))]


def test_default_split_weights_an_unpriced_component_at_the_average_priced_unit():
    # Priced: 1 x 300 -> average per-unit retail 300; the unpriced one counts as 300 too.
    split = default_split([(D("300"), 1), (None, 1)], D("100.00"), D("100.00"))
    assert split == [(D("50.00"), D("50.00")), (D("50.00"), D("50.00"))]


# --- packs ---------------------------------------------------------------------

def test_pack_line_counts_units_and_per_pack_cost(purchase, decoder):
    item = add_existing_product_item(
        purchase, decoder, 3, D("480000.00"), D("480000.00"), line_kind="pack", units_per_pack=24,
    )
    assert item.line_kind == "pack"
    assert item.subtotal_paid == D("1440000.00")
    assert item.units_received == 72
    purchase.refresh_from_db()
    assert purchase.total_paid == D("1440000.00")


def test_pack_needs_at_least_two_units_and_single_is_always_one(purchase, decoder):
    with pytest.raises(ValidationError):
        add_existing_product_item(purchase, decoder, 1, D("10"), D("10"), line_kind="pack", units_per_pack=1)
    single = add_existing_product_item(purchase, decoder, 2, D("10"), D("10"), units_per_pack=5)
    assert single.units_per_pack == 1


def test_receiving_a_pack_puts_single_units_in_stock_at_unit_cost(purchase, decoder, manager):
    add_existing_product_item(purchase, decoder, 3, D("480000.00"), D("480000.00"), line_kind="pack", units_per_pack=24)
    receive_purchase(purchase, user=manager)

    assert Inventory.objects.get(product=decoder).quantity_in_stock == 72
    movement = StockMovement.objects.get(product=decoder, movement_type="purchase_receipt")
    assert movement.quantity_delta == 72
    assert movement.unit_cost == D("20000.00")
    assert weighted_average_cost(decoder) == D("20000.00")


# --- bundles -------------------------------------------------------------------

def test_bundle_default_split_sums_exactly_to_the_bundle_price(purchase, tv, decoder):
    item = canalbox(purchase, tv, decoder)
    comps = list(item.components.order_by("component_id"))
    assert item.product is None and item.line_kind == "bundle"
    assert [(c.allocated_paid_cost, c.allocated_invoiced_cost) for c in comps] == [
        (D("400000.00"), D("410000.00")), (D("400000.00"), D("410000.00")),
    ]
    assert item.units_received == 21


def test_bundle_allocation_override_must_sum_exactly(purchase, tv, decoder):
    with pytest.raises(ValidationError):
        add_bundle_item(
            purchase, bundle_name="Kit", quantity=1, unit_cost_paid=D("100.00"), unit_cost_invoiced=D("100.00"),
            components=[
                {"product": tv, "qty_per_bundle": 1, "allocated_paid_cost": D("60.00"), "allocated_invoiced_cost": D("60.00")},
                {"product": decoder, "qty_per_bundle": 1, "allocated_paid_cost": D("39.99"), "allocated_invoiced_cost": D("40.00")},
            ],
        )
    assert not PurchaseItem.objects.exists()


def test_bundle_override_used_when_it_sums(purchase, tv, decoder):
    item = add_bundle_item(
        purchase, bundle_name="Kit", quantity=2, unit_cost_paid=D("100.00"), unit_cost_invoiced=D("100.00"),
        components=[
            {"product": tv, "qty_per_bundle": 1, "allocated_paid_cost": D("70.00"), "allocated_invoiced_cost": D("70.00")},
            {"product": decoder, "qty_per_bundle": 2, "allocated_paid_cost": D("30.00"), "allocated_invoiced_cost": D("30.00")},
        ],
    )
    assert [c.allocated_paid_cost for c in item.components.order_by("component_id")] == [D("70.00"), D("30.00")]
    assert item.subtotal_paid == D("200.00")


def test_bundle_refuses_partial_overrides_duplicates_and_empty(purchase, tv, decoder):
    with pytest.raises(ValidationError):  # override on only one component
        add_bundle_item(
            purchase, bundle_name="Kit", quantity=1, unit_cost_paid=D("100.00"), unit_cost_invoiced=D("100.00"),
            components=[
                {"product": tv, "qty_per_bundle": 1, "allocated_paid_cost": D("100.00")},
                {"product": decoder, "qty_per_bundle": 1},
            ],
        )
    with pytest.raises(ValidationError):  # same product twice
        add_bundle_item(
            purchase, bundle_name="Kit", quantity=1, unit_cost_paid=D("100.00"), unit_cost_invoiced=D("100.00"),
            components=[{"product": tv, "qty_per_bundle": 1}, {"product": tv, "qty_per_bundle": 2}],
        )
    with pytest.raises(ValidationError):  # no components
        add_bundle_item(
            purchase, bundle_name="Kit", quantity=1, unit_cost_paid=D("100.00"),
            unit_cost_invoiced=D("100.00"), components=[],
        )
    with pytest.raises(ValidationError):  # no name
        add_bundle_item(
            purchase, bundle_name=" ", quantity=1, unit_cost_paid=D("100.00"),
            unit_cost_invoiced=D("100.00"), components=[{"product": tv, "qty_per_bundle": 1}],
        )


def test_bundle_component_can_be_a_new_product(purchase, tv, category):
    item = add_bundle_item(
        purchase, bundle_name="TV + remote", quantity=1, unit_cost_paid=D("520000.00"),
        unit_cost_invoiced=D("520000.00"), components=[
            {"product": tv, "qty_per_bundle": 1},
            {"new_product": {"category": category, "name": "Smart remote", "selling_price": D("20000.00")},
             "qty_per_bundle": 2},
        ],
    )
    remote = Product.objects.get(name="Smart remote")
    comp = item.components.get(product=remote)
    # weights: 500000 x1 vs 20000 x2 -> 500000 : 40000
    assert comp.allocated_paid_cost == D("38518.51")
    assert sum(c.allocated_paid_cost for c in item.components.all()) == D("520000.00")
    pricing = remote.pricing_history.get(is_current=True)
    assert pricing.retail_price == D("20000.00")
    assert pricing.wholesale_price == D("19259.26")  # per-unit share of the bundle price


def test_receive_bundle_puts_each_component_in_stock_at_its_unit_cost(purchase, tv, decoder, manager):
    canalbox(purchase, tv, decoder)
    receive_purchase(purchase, user=manager)

    assert Inventory.objects.get(product=tv).quantity_in_stock == 1
    assert Inventory.objects.get(product=decoder).quantity_in_stock == 20
    decoder_move = StockMovement.objects.get(product=decoder, movement_type="purchase_receipt")
    assert decoder_move.quantity_delta == 20
    assert decoder_move.unit_cost == D("20000.00")
    assert decoder_move.source_type == "purchase_item_component"
    assert weighted_average_cost(tv) == D("400000.00")
    assert weighted_average_cost(decoder) == D("20000.00")
    assert ledger_mismatches() == []


def test_cancel_received_bundle_reverses_every_component(purchase, tv, decoder, manager):
    canalbox(purchase, tv, decoder)
    receive_purchase(purchase, user=manager)
    cancel_purchase(purchase, user=manager)

    assert Inventory.objects.get(product=tv).quantity_in_stock == 0
    assert Inventory.objects.get(product=decoder).quantity_in_stock == 0
    assert StockMovement.objects.filter(movement_type="purchase_cancel").count() == 2
    assert ledger_mismatches() == []


def test_cancel_refused_when_bundle_stock_has_moved_on(purchase, tv, decoder, manager):
    canalbox(purchase, tv, decoder)
    receive_purchase(purchase, user=manager)
    complete_sale(None, manager, "cash", [{"product": decoder, "quantity": 1}])

    with pytest.raises(ValidationError):
        cancel_purchase(purchase, user=manager)
    assert Inventory.objects.get(product=decoder).quantity_in_stock == 19
    assert Purchase.objects.get(pk=purchase.pk).status == Purchase.Status.RECEIVED


def test_cost_totals_mix_single_pack_and_bundle(purchase, tv, decoder, manager):
    add_existing_product_item(purchase, decoder, 10, D("22000.00"), D("22000.00"))
    add_existing_product_item(purchase, decoder, 1, D("480000.00"), D("480000.00"), line_kind="pack", units_per_pack=24)
    canalbox(purchase, tv, decoder)
    receive_purchase(purchase, user=manager)

    totals = received_cost_totals([decoder.pk])[decoder.pk]
    assert totals["units"] == 10 + 24 + 20
    assert totals["paid"] == D("220000.00") + D("480000.00") + D("400000.00")
    assert totals["invoiced"] == D("220000.00") + D("480000.00") + D("410000.00")
    # 1,100,000 / 54
    assert weighted_average_cost(decoder) == D("20370.37")


def test_drafts_do_not_count_toward_cost(purchase, tv, decoder):
    canalbox(purchase, tv, decoder)
    assert received_cost_totals([decoder.pk]) == {}
    assert weighted_average_cost(decoder) is None


def test_save_as_template_records_identical_components(purchase, tv, decoder, manager):
    canalbox(purchase, tv, decoder, save_as_template=True, template_name="Canalbox TV kit", user=manager)
    template = BundleTemplate.objects.get()
    assert template.supplier == purchase.supplier
    assert [(c.product_id, c.qty_per_bundle) for c in template.components.all()] == [(tv.pk, 1), (decoder.pk, 20)]


def test_update_bundle_costs_redoes_the_default_split(purchase, tv, decoder):
    item = canalbox(purchase, tv, decoder)
    item = update_item(purchase, item, unit_cost_paid=D("900000.00"))
    assert [c.allocated_paid_cost for c in item.components.order_by("component_id")] == [
        D("450000.00"), D("450000.00"),
    ]
    assert item.subtotal_paid == D("900000.00")


def test_update_pack_units_per_pack(purchase, decoder):
    item = add_existing_product_item(purchase, decoder, 2, D("100.00"), D("100.00"), line_kind="pack", units_per_pack=10)
    item = update_item(purchase, item, units_per_pack=12)
    assert item.units_received == 24


# --- API -----------------------------------------------------------------------

def test_api_single_add_accepts_a_pack(manager, purchase, decoder):
    response = client_for(manager).post(
        f"/api/purchases/{purchase.pk}/items/",
        {"product": decoder.pk, "quantity": 3, "unit_cost_paid": "480000.00", "unit_cost_invoiced": "480000.00",
         "line_kind": "pack", "units_per_pack": 24},
        format="json",
    )
    assert response.status_code == 201, response.json()
    body = response.json()
    assert body["line_kind"] == "pack" and body["units_received"] == 72
    assert body["unit_cost_paid_per_unit"] == "20000.00"


def test_api_bulk_saves_a_bundle_row_and_a_pack_row(manager, purchase, tv, decoder, cable):
    response = client_for(manager).post(
        f"/api/purchases/{purchase.pk}/items/bulk/",
        {"items": [
            {"product": cable.pk, "quantity": 2, "unit_cost_paid": "24000.00", "unit_cost_invoiced": "24000.00",
             "line_kind": "pack", "units_per_pack": 12},
            {"line_kind": "bundle", "bundle_name": "Canalbox TV kit", "quantity": 1,
             "unit_cost_paid": "800000.00", "unit_cost_invoiced": "800000.00",
             "components": [{"product": tv.pk, "qty_per_bundle": 1}, {"product": decoder.pk, "qty_per_bundle": 20}]},
        ]},
        format="json",
    )
    assert response.status_code == 201, response.json()
    items = response.json()["items"]
    assert items[1]["line_kind"] == "bundle"
    assert len(items[1]["components"]) == 2
    assert items[1]["units_received"] == 21


def test_api_bulk_bundle_errors_roll_back_everything(manager, purchase, tv, decoder, cable):
    response = client_for(manager).post(
        f"/api/purchases/{purchase.pk}/items/bulk/",
        {"items": [
            {"product": cable.pk, "quantity": 1, "unit_cost_paid": "10.00", "unit_cost_invoiced": "10.00"},
            {"line_kind": "bundle", "bundle_name": "Bad kit", "quantity": 1,
             "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00",
             "components": [
                 {"product": tv.pk, "qty_per_bundle": 1, "allocated_paid_cost": "10.00", "allocated_invoiced_cost": "10.00"},
                 {"product": decoder.pk, "qty_per_bundle": 1, "allocated_paid_cost": "10.00", "allocated_invoiced_cost": "10.00"},
             ]},
        ]},
        format="json",
    )
    assert response.status_code == 400
    assert "1" in response.json()["row_errors"]
    assert not PurchaseItem.objects.exists()


def test_api_staff_never_see_bundle_costs(staff, purchase, tv, decoder):
    canalbox(purchase, tv, decoder)
    body = client_for(staff).get(f"/api/purchases/{purchase.pk}/").json()
    component = body["items"][0]["components"][0]
    assert "allocated_paid_cost" not in component
    assert "unit_cost_paid" not in body["items"][0]
    assert component["units"] == 1


def test_api_split_preview(staff, tv, decoder):
    response = client_for(staff).post(
        "/api/purchasing/bundle-split-preview/",
        {"unit_cost_paid": "800000.00", "unit_cost_invoiced": "820000.00",
         "components": [{"product": tv.pk, "qty_per_bundle": 1}, {"product": decoder.pk, "qty_per_bundle": 20}]},
        format="json",
    )
    assert response.status_code == 200, response.json()
    rows = response.json()["components"]
    assert [r["allocated_paid_cost"] for r in rows] == ["400000.00", "400000.00"]
    assert rows[1]["unit_paid_cost"] == "20000.00"


def test_api_templates_crud_admin_manager_and_read_for_staff(manager, staff, supplier, tv, decoder):
    payload = {"name": "Canalbox TV kit", "supplier": supplier.pk,
               "components": [{"product": tv.pk, "qty_per_bundle": 1}, {"product": decoder.pk, "qty_per_bundle": 20}]}
    assert client_for(staff).post("/api/bundle-templates/", payload, format="json").status_code == 403
    created = client_for(manager).post("/api/bundle-templates/", payload, format="json")
    assert created.status_code == 201, created.json()
    template_id = created.json()["template_id"]

    listing = client_for(staff).get(f"/api/bundle-templates/?supplier={supplier.pk}")
    assert listing.status_code == 200
    row = listing.json()["results"][0]
    assert [c["qty_per_bundle"] for c in row["components"]] == [1, 20]
    assert row["components"][0]["product_name"] == tv.name

    edited = client_for(manager).patch(
        f"/api/bundle-templates/{template_id}/",
        {"components": [{"product": tv.pk, "qty_per_bundle": 2}]}, format="json",
    )
    assert edited.status_code == 200
    assert BundleTemplate.objects.get().components.count() == 1
    assert client_for(manager).delete(f"/api/bundle-templates/{template_id}/").status_code == 204


def test_profitability_uses_per_unit_cost_for_packs_and_bundles(manager, purchase, tv, decoder):
    add_existing_product_item(purchase, decoder, 1, D("480000.00"), D("480000.00"), line_kind="pack", units_per_pack=24)
    canalbox(purchase, tv, decoder)
    receive_purchase(purchase, user=manager)
    admin = make_employee("admin1", Employee.Role.ADMIN)
    body = client_for(admin).get(f"/api/dashboard/profitability/?period=all&product={decoder.pk}").json()
    row = body["products"][0]
    assert row["units_bought"] == 44
    assert row["avg_cost_paid"] == "20000.00"


def test_search_and_recent_products_report_per_unit_cost(manager, purchase, tv, decoder, supplier):
    add_existing_product_item(purchase, decoder, 1, D("480000.00"), D("480000.00"), line_kind="pack", units_per_pack=24)
    receive_purchase(purchase, user=manager)
    client = client_for(manager)
    hit = client.get("/api/products/search/?q=Canalbox decoder").json()["results"][0]
    assert hit["last_paid_cost"] == "20000.00"
    recent = client.get(f"/api/suppliers/{supplier.pk}/recent-products/").json()["results"][0]
    assert recent["last_unit_cost_paid"] == "20000.00"


def test_merge_moves_bundle_components(manager, purchase, tv, decoder, category):
    from catalog.merge import merge_products
    dup = priced(category, "PES-TV-00009", "Canalbox decoder (old)", "25000.00")
    add_bundle_item(
        purchase, bundle_name="Kit", quantity=1, unit_cost_paid=D("100.00"), unit_cost_invoiced=D("100.00"),
        components=[{"product": tv, "qty_per_bundle": 1}, {"product": dup, "qty_per_bundle": 1}],
    )
    merge_products(decoder, dup, manager, "duplicate")
    assert PurchaseItemComponent.objects.filter(product=decoder).count() == 1
    assert not PurchaseItemComponent.objects.filter(product=dup).exists()


def test_product_with_bundle_history_cannot_be_deleted(manager, purchase, tv, decoder):
    canalbox(purchase, tv, decoder)
    admin = make_employee("admin1", Employee.Role.ADMIN)
    response = client_for(admin).delete(f"/api/products/{decoder.pk}/")
    assert response.status_code == 400
