"""Release Module E3: opening stock import (CSV) and the single-product
"Set opening stock" action."""
from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductBarcodeAlias, ProductPricing
from purchasing.models import Purchase, Supplier
from purchasing.services import add_existing_product_item, receive_purchase
from stock.ledger import ledger_mismatches
from stock.models import Inventory, StockMovement
from stock.services import weighted_average_cost

pytestmark = pytest.mark.django_db

HEADER = "category_code,name,brand,model,barcode,retail_price,cost_price,opening_qty,reorder_level,vat,warranty_months,unit"


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


def csv(*lines):
    return "\n".join([HEADER, *lines]) + "\n"


def post(client, text, commit):
    return client.post("/api/setup/import-products/", {"csv": text, "commit": commit}, format="json")


GOOD = csv(
    "AUD,JBL Flip 6,JBL,FL6,,145000,100000,8,3,B,12,pcs",
    "TV,Samsung 43 TV,Samsung,UA43,6001234567890,450000,380000,2,1,B,24,pcs",
    "AUD,Aux cable,,,,2000,800,0,,A,,",
)


# --- dry run -----------------------------------------------------------------

def test_dry_run_reports_rows_and_writes_nothing(admin, audio):
    response = post(client_for(admin), GOOD, commit=False)

    assert response.status_code == 200, response.content
    body = response.json()
    assert body["dry_run"] is True
    assert body["summary"] == {"rows": 3, "valid": 3, "errors": 0, "skipped": 0, "new_categories": ["TV"]}
    assert [r["status"] for r in body["rows"]] == ["valid", "valid", "valid"]
    assert body["rows"][0]["line"] == 2
    assert Product.objects.count() == 0
    assert Category.objects.count() == 1
    assert StockMovement.objects.count() == 0


def test_dry_run_flags_errors_per_row(admin, audio):
    text = csv(
        "AUD,,JBL,,,145000,100000,1,,B,,",            # no name
        "AUD,Speaker,,,,abc,100,1,,B,,",               # bad retail price
        "AUD,Speaker 2,,,,100,-1,1,,B,,",              # negative cost
        "AUD,Speaker 3,,,,100,50,1.5,,B,,",            # fractional qty
        "AUD,Speaker 4,,,,100,50,1,,C,,",              # bad vat
        ",Speaker 5,,,,100,50,1,,B,,",                 # no category
        "AUD,Speaker 6,,,DUPE-1,100,50,1,,B,,",
        "AUD,Speaker 7,,,DUPE-1,100,50,1,,B,,",        # barcode repeated in file
        "AUD,Speaker 6,,,,100,50,1,,B,,",              # name repeated in file
        "TOOLONGCODE1,Speaker 8,,,,100,50,1,,B,,",     # category code too long
    )
    body = post(client_for(admin), text, commit=False).json()

    statuses = [r["status"] for r in body["rows"]]
    assert statuses == ["error"] * 6 + ["valid", "error", "error", "error"]
    assert "name" in str(body["rows"][0]["errors"]).lower()
    assert "retail_price" in str(body["rows"][1]["errors"])
    assert body["summary"]["errors"] == 9


def test_rows_matching_existing_products_are_flagged_and_skipped(admin, audio):
    existing = Product.objects.create(category=audio, barcode="PES-AUD-00001", name="JBL Flip 6")
    other = Product.objects.create(category=audio, barcode="PES-AUD-00002", name="Boya Mic")
    ProductBarcodeAlias.objects.create(barcode="OLD-1", product=other)
    text = csv(
        "AUD,  jbl   flip 6 ,,,,1,1,1,,B,,",           # same normalised name
        "AUD,Brand new,,,PES-AUD-00002,1,1,1,,B,,",    # existing barcode
        "AUD,Another,,,old-1,1,1,1,,B,,",              # existing alias
        "AUD,Fresh,,,,1,1,1,,B,,",
    )
    body = post(client_for(admin), text, commit=False).json()

    assert [r["status"] for r in body["rows"]] == ["skip", "skip", "skip", "valid"]
    assert body["rows"][0]["match"] == {"product_id": existing.product_id, "name": "JBL Flip 6"}
    assert body["rows"][1]["match"]["product_id"] == other.product_id
    assert body["summary"]["skipped"] == 3


def test_missing_required_columns_is_a_400(admin):
    response = post(client_for(admin), "name,retail_price\nX,1\n", commit=False)
    assert response.status_code == 400
    assert "category_code" in str(response.json()["detail"])


def test_empty_file_is_a_400(admin):
    assert post(client_for(admin), "", commit=False).status_code == 400
    assert post(client_for(admin), HEADER + "\n", commit=False).status_code == 400


def test_header_with_bom_and_extra_columns_is_accepted(admin, audio):
    text = "﻿" + HEADER + ",notes\nAUD,Thing,,,,10,5,1,,B,,,whatever\n"
    body = post(client_for(admin), text, commit=False).json()
    assert body["rows"][0]["status"] == "valid"


# --- commit ------------------------------------------------------------------

def test_commit_creates_products_prices_inventory_and_opening_movements(admin, audio):
    response = post(client_for(admin), GOOD, commit=True)

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["dry_run"] is False
    assert body["summary"]["created"] == 3

    tv_category = Category.objects.get(code="TV")
    tv = Product.objects.get(name="Samsung 43 TV")
    assert tv.category == tv_category and tv.barcode == "6001234567890" and tv.warranty_months == 24
    flip = Product.objects.get(name="JBL Flip 6")
    assert flip.barcode.startswith("PES-AUD-") and flip.reorder_level == 3 and flip.brand == "JBL"
    assert flip.model_number == "FL6" and flip.tax_category == "B"
    cable = Product.objects.get(name="Aux cable")
    assert cable.tax_category == "A" and cable.reorder_level == 5 and cable.unit == "pcs"

    price = ProductPricing.objects.get(product=flip, is_current=True)
    assert price.retail_price == Decimal("145000.00") and price.wholesale_price == Decimal("100000.00")

    assert Inventory.objects.get(product=flip).quantity_in_stock == 8
    assert Inventory.objects.get(product=cable).quantity_in_stock == 0
    movement = StockMovement.objects.get(product=flip)
    assert movement.movement_type == "opening" and movement.quantity_delta == 8
    assert movement.unit_cost == Decimal("100000.00") and movement.created_by == admin
    assert not StockMovement.objects.filter(product=cable).exists()

    assert weighted_average_cost(flip) == Decimal("100000.00")
    assert ledger_mismatches() == []

    # body rows point at the created products
    assert {r["product_id"] for r in body["rows"]} == {flip.product_id, tv.product_id, cable.product_id}


def test_commit_skips_matches_and_creates_the_rest(admin, audio):
    Product.objects.create(category=audio, barcode="PES-AUD-00001", name="JBL Flip 6")
    response = post(client_for(admin), GOOD, commit=True)
    assert response.status_code == 201
    assert response.json()["summary"]["created"] == 2
    assert response.json()["summary"]["skipped"] == 1
    assert Product.objects.filter(normalized_name="jbl flip 6").count() == 1


def test_commit_with_any_error_row_saves_nothing(admin, audio):
    text = csv("AUD,Good one,,,,10,5,1,,B,,", "AUD,Bad one,,,,x,5,1,,B,,")
    response = post(client_for(admin), text, commit=True)
    assert response.status_code == 400
    assert response.json()["code"] == "row_errors"
    assert Product.objects.count() == 0 and StockMovement.objects.count() == 0


def test_given_barcode_never_collides_with_a_generated_one(admin, audio):
    text = csv("AUD,First,,,,10,5,1,,B,,", "AUD,Second,,,PES-AUD-00001,10,5,1,,B,,")
    response = post(client_for(admin), text, commit=True)
    assert response.status_code == 201, response.content
    assert set(Product.objects.values_list("barcode", flat=True)) == {"PES-AUD-00001", "PES-AUD-00002"}


@pytest.mark.parametrize("role", [Employee.Role.MANAGER, Employee.Role.SALES_STAFF])
def test_import_is_admin_only(role):
    client = client_for(make_employee("user1", role))
    assert post(client, GOOD, commit=False).status_code == 403
    assert client.get("/api/setup/import-products/template/").status_code == 403


def test_template_is_a_csv_with_the_header(admin):
    response = client_for(admin).get("/api/setup/import-products/template/")
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert response.content.decode().splitlines()[0] == HEADER


# --- single product "Set opening stock" ---------------------------------------

@pytest.fixture
def speaker(audio):
    return Product.objects.create(category=audio, barcode="PES-AUD-00001", name="Speaker")


def test_set_opening_stock_on_a_never_received_product(admin, speaker):
    client = client_for(admin)
    assert client.get(f"/api/products/{speaker.pk}/opening-stock/").json() == {
        "eligible": True, "reason": None, "in_stock": 0,
    }

    response = client.post(
        f"/api/products/{speaker.pk}/opening-stock/", {"quantity": 6, "unit_cost": "250.00"}, format="json"
    )

    assert response.status_code == 201, response.content
    assert Inventory.objects.get(product=speaker).quantity_in_stock == 6
    movement = StockMovement.objects.get(product=speaker)
    assert movement.movement_type == "opening" and movement.unit_cost == Decimal("250.00")
    assert weighted_average_cost(speaker) == Decimal("250.00")
    assert ledger_mismatches() == []
    # and only once
    assert client.get(f"/api/products/{speaker.pk}/opening-stock/").json()["eligible"] is False
    assert client.post(
        f"/api/products/{speaker.pk}/opening-stock/", {"quantity": 1, "unit_cost": "1"}, format="json"
    ).status_code == 400


def test_set_opening_stock_is_refused_once_received(admin, speaker):
    purchase = Purchase.objects.create(
        supplier=Supplier.objects.create(name="S"), employee=admin, purchase_date=date(2026, 1, 1)
    )
    add_existing_product_item(purchase, speaker, 2, Decimal("5"), Decimal("5"))
    receive_purchase(purchase, user=admin)
    client = client_for(admin)

    status = client.get(f"/api/products/{speaker.pk}/opening-stock/").json()
    assert status["eligible"] is False and "received" in status["reason"]
    response = client.post(f"/api/products/{speaker.pk}/opening-stock/", {"quantity": 3, "unit_cost": "5"}, format="json")
    assert response.status_code == 400


def test_set_opening_stock_allowed_with_only_ledger_start_rows(admin, speaker):
    Inventory.objects.create(product=speaker, quantity_in_stock=2)
    StockMovement.objects.create(
        product=speaker, movement_type="opening", bucket="in_stock", quantity_delta=2,
        balance_after=2, reason="Ledger start", created_by=None,
    )
    client = client_for(admin)
    assert client.get(f"/api/products/{speaker.pk}/opening-stock/").json()["eligible"] is True

    # the quantity is the counted opening stock; only the difference is added
    response = client.post(f"/api/products/{speaker.pk}/opening-stock/", {"quantity": 5, "unit_cost": "10"}, format="json")
    assert response.status_code == 201
    assert Inventory.objects.get(product=speaker).quantity_in_stock == 5
    assert ledger_mismatches() == []

    other = Product.objects.create(category=speaker.category, barcode="PES-AUD-00009", name="Other")
    Inventory.objects.create(product=other, quantity_in_stock=4)
    StockMovement.objects.create(
        product=other, movement_type="opening", bucket="in_stock", quantity_delta=4,
        balance_after=4, reason="Ledger start", created_by=None,
    )
    refused = client.post(f"/api/products/{other.pk}/opening-stock/", {"quantity": 4, "unit_cost": "1"}, format="json")
    assert refused.status_code == 400


def test_set_opening_stock_validates_input(admin, speaker):
    client = client_for(admin)
    for payload in ({"quantity": 0, "unit_cost": "1"}, {"quantity": 2}, {"quantity": 2, "unit_cost": "-1"}):
        assert client.post(f"/api/products/{speaker.pk}/opening-stock/", payload, format="json").status_code == 400


def test_set_opening_stock_is_admin_only(speaker):
    client = client_for(make_employee("manager1", Employee.Role.MANAGER))
    assert client.post(
        f"/api/products/{speaker.pk}/opening-stock/", {"quantity": 1, "unit_cost": "1"}, format="json"
    ).status_code == 403
