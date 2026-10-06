"""Release Module E1: GET /api/products/search/ — ranked product search."""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductBarcodeAlias, ProductPricing
from catalog.search import normalise_text
from purchasing.models import Purchase, PurchaseItem, Supplier
from stock.models import Inventory

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
def category():
    return Category.objects.create(name="Audio", code="AUD")


def product(category, name, barcode, brand="", model_number="", is_active=True):
    return Product.objects.create(
        category=category, name=name, barcode=barcode, brand=brand,
        model_number=model_number, is_active=is_active,
    )


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def manager():
    return make_employee("manager1", Employee.Role.MANAGER)


def search(client, q, **params):
    response = client.get("/api/products/search/", {"q": q, **params})
    assert response.status_code == 200, response.content
    return response.json()["results"]


def test_normalise_text_lowercases_and_collapses_whitespace():
    assert normalise_text("  JBL   Flip\t6 ") == "jbl flip 6"
    assert normalise_text(None) == ""


def test_search_text_is_maintained_on_save(category):
    p = product(category, "Flip  6", "PES-AUD-00001", brand="JBL", model_number="FL6")
    assert p.normalized_name == "flip 6"
    assert p.search_text == "flip 6 jbl fl6"

    p.name = "Charge 5"
    p.save()
    p.refresh_from_db()
    assert p.normalized_name == "charge 5"
    assert p.search_text == "charge 5 jbl fl6"


def test_ranking_order_barcode_then_exact_name_then_starts_with_then_similar(category, staff):
    similar = product(category, "Bluetooth Speaker Mini", "PES-AUD-00004")
    starts = product(category, "Speaker Pro Max", "PES-AUD-00003")
    exact = product(category, "Speaker", "PES-AUD-00002")
    by_barcode = product(category, "Something else", "SPEAKER")

    results = search(client_for(staff), "speaker")

    ids = [r["product_id"] for r in results]
    assert ids[:4] == [by_barcode.product_id, exact.product_id, starts.product_id, similar.product_id]
    assert [r["match"] for r in results[:4]] == ["barcode", "exact_name", "starts_with", "similar"]


def test_exact_name_match_ignores_case_and_extra_spaces(category, staff):
    p = product(category, "JBL Flip 6", "PES-AUD-00001")

    results = search(client_for(staff), "  jbl   FLIP 6 ")

    assert results[0]["product_id"] == p.product_id
    assert results[0]["match"] == "exact_name"


def test_barcode_alias_matches_like_a_barcode(category, staff):
    kept = product(category, "JBL Flip 6", "PES-AUD-00001")
    ProductBarcodeAlias.objects.create(barcode="OLD-LABEL-9", product=kept)

    results = search(client_for(staff), "old-label-9")

    assert results[0]["product_id"] == kept.product_id
    assert results[0]["match"] == "barcode"


def test_typo_still_finds_the_product_by_similarity(category, staff):
    p = product(category, "Samsung Television 43", "PES-AUD-00001", brand="Samsung")
    product(category, "Kettle", "PES-AUD-00002")

    results = search(client_for(staff), "samsung televison")

    assert [r["product_id"] for r in results] == [p.product_id]
    assert results[0]["match"] == "similar"
    assert results[0]["score"] >= 0.3


def test_unrelated_products_are_not_returned(category, staff):
    product(category, "Kettle", "PES-AUD-00001")
    assert search(client_for(staff), "television") == []


def test_inactive_products_are_hidden_unless_asked_for(category, staff):
    hidden = product(category, "Speaker", "PES-AUD-00001", is_active=False)
    client = client_for(staff)

    assert search(client, "speaker") == []
    assert [r["product_id"] for r in search(client, "speaker", include_inactive="true")] == [hidden.product_id]


def test_limit_defaults_to_8_and_is_capped_at_50(category, staff):
    for i in range(60):
        product(category, f"Speaker {i}", f"PES-AUD-{i:05d}")
    client = client_for(staff)

    assert len(search(client, "speaker")) == 8
    assert len(search(client, "speaker", limit=3)) == 3
    assert len(search(client, "speaker", limit=500)) == 50


def test_invalid_limit_returns_400(staff):
    assert client_for(staff).get("/api/products/search/", {"q": "x", "limit": "abc"}).status_code == 400


def test_empty_query_returns_no_results(category, staff):
    product(category, "Speaker", "PES-AUD-00001")
    assert search(client_for(staff), "   ") == []


def test_result_shape_and_cost_hidden_from_staff(category, staff, manager):
    p = product(category, "Speaker", "PES-AUD-00001", brand="JBL", model_number="X1")
    ProductPricing.objects.create(
        product=p, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=p, quantity_in_stock=7)
    supplier = Supplier.objects.create(name="S")
    older = Purchase.objects.create(
        supplier=supplier, employee=manager, purchase_date=date(2026, 1, 1), status="received"
    )
    newer = Purchase.objects.create(
        supplier=supplier, employee=manager, purchase_date=date(2026, 3, 1), status="received"
    )
    draft = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 6, 1))
    for purchase, cost in ((older, "40.00"), (newer, "45.00"), (draft, "99.00")):
        PurchaseItem.objects.create(
            purchase=purchase, product=p, quantity=1, unit_cost_paid=Decimal(cost),
            unit_cost_invoiced=Decimal(cost), subtotal_paid=Decimal(cost), subtotal_invoiced=Decimal(cost),
        )

    staff_row = search(client_for(staff), "speaker")[0]
    assert staff_row == {
        "product_id": p.product_id, "name": "Speaker", "brand": "JBL", "model_number": "X1",
        "barcode": "PES-AUD-00001", "category": category.category_id, "category_name": "Audio",
        "is_active": True, "in_stock": 7, "retail_price": "100.00",
        "match": "exact_name", "score": 1.0,
    }

    manager_row = search(client_for(manager), "speaker")[0]
    assert manager_row["last_paid_cost"] == "45.00"


def test_product_never_received_has_null_stock_and_price(category, staff):
    product(category, "Speaker", "PES-AUD-00001")
    row = search(client_for(staff), "speaker")[0]
    assert row["in_stock"] is None
    assert row["retail_price"] is None


def test_search_requires_authentication():
    assert APIClient().get("/api/products/search/", {"q": "x"}).status_code == 401
