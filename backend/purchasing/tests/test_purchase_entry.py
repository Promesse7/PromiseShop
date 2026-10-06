"""Release Module E2: atomic bulk line entry, editing a draft line, and the
supplier's recent products."""
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient

from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from purchasing.models import Purchase, PurchaseItem, Supplier

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
def manager():
    return make_employee("manager1", Employee.Role.MANAGER)


@pytest.fixture
def staff():
    return make_employee("staff1", Employee.Role.SALES_STAFF)


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def speaker(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics")


@pytest.fixture
def purchase(supplier, manager):
    return Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 10, 1))


def existing_row(product, quantity=2, paid="40.00", invoiced="40.00", **extra):
    return {"product": product.product_id, "quantity": quantity,
            "unit_cost_paid": paid, "unit_cost_invoiced": invoiced, **extra}


def new_row(category, name, quantity=1, paid="10.00", invoiced="10.00", selling="15.00"):
    return {
        "new_product": {"category": category.category_id, "name": name, "selling_price": selling},
        "quantity": quantity, "unit_cost_paid": paid, "unit_cost_invoiced": invoiced,
    }


def bulk(client, purchase, rows):
    return client.post(f"/api/purchases/{purchase.purchase_id}/items/bulk/", {"items": rows}, format="json")


# --- bulk save -------------------------------------------------------------

def test_bulk_saves_existing_and_new_rows_and_recomputes_totals(manager, purchase, speaker, category):
    response = bulk(client_for(manager), purchase, [
        existing_row(speaker, quantity=2, paid="40.00", invoiced="40.00"),
        new_row(category, "Earbuds", quantity=3, paid="10.00", invoiced="10.00", selling="15.00"),
    ])

    assert response.status_code == 201, response.content
    assert len(response.json()["items"]) == 2
    purchase.refresh_from_db()
    assert purchase.items.count() == 2
    assert purchase.total_paid == Decimal("110.00")
    earbuds = Product.objects.get(name="Earbuds")
    assert earbuds.barcode.startswith("PES-AUD-")
    saved = response.json()["items"][1]
    assert saved["product_name"] == "Earbuds"
    assert saved["product_barcode"] == earbuds.barcode
    assert saved["product_retail_price"] == "15.00"
    assert ProductPricing.objects.get(product=earbuds, is_current=True).retail_price == Decimal("15.00")


def test_bulk_is_all_or_nothing_when_one_row_is_invalid(manager, purchase, speaker, category):
    response = bulk(client_for(manager), purchase, [
        existing_row(speaker),
        new_row(category, "Earbuds"),
        existing_row(speaker, paid="40.00", invoiced="45.00"),  # discrepancy without a note
    ])

    assert response.status_code == 400
    body = response.json()
    assert set(body["row_errors"]) == {"2"}
    assert "price_discrepancy_note" in body["row_errors"]["2"]
    assert PurchaseItem.objects.count() == 0
    assert not Product.objects.filter(name="Earbuds").exists()


def test_bulk_row_without_product_or_new_product_is_refused(manager, purchase, speaker):
    response = bulk(client_for(manager), purchase, [
        existing_row(speaker),
        {"quantity": 1, "unit_cost_paid": "5.00", "unit_cost_invoiced": "5.00"},
    ])

    assert response.status_code == 400
    assert set(response.json()["row_errors"]) == {"1"}
    assert PurchaseItem.objects.count() == 0
    assert Product.objects.count() == 1


def test_bulk_row_with_both_product_and_new_product_is_refused(manager, purchase, speaker, category):
    row = {**existing_row(speaker), "new_product": {"category": category.category_id, "name": "X", "selling_price": "1"}}
    response = bulk(client_for(manager), purchase, [row])
    assert response.status_code == 400
    assert set(response.json()["row_errors"]) == {"0"}


def test_bulk_new_product_missing_fields_reports_them(manager, purchase):
    response = bulk(client_for(manager), purchase, [
        {"new_product": {"name": "Earbuds"}, "quantity": 1, "unit_cost_paid": "1", "unit_cost_invoiced": "1"},
    ])
    assert response.status_code == 400
    errors = response.json()["row_errors"]["0"]
    assert "category" in str(errors) and "selling_price" in str(errors)


def test_bulk_new_product_with_existing_name_links_instead_of_duplicating(manager, purchase, speaker, category):
    response = bulk(client_for(manager), purchase, [new_row(category, "  SPEAKER ")])

    assert response.status_code == 201
    assert Product.objects.count() == 1
    assert purchase.items.get().product == speaker


def test_bulk_two_new_rows_with_the_same_name_create_one_product(manager, purchase, category):
    response = bulk(client_for(manager), purchase, [new_row(category, "Earbuds"), new_row(category, "earbuds")])

    assert response.status_code == 201
    assert Product.objects.filter(normalized_name="earbuds").count() == 1
    assert purchase.items.count() == 2


def test_bulk_empty_list_is_refused(manager, purchase):
    response = bulk(client_for(manager), purchase, [])
    assert response.status_code == 400


def test_bulk_on_a_received_purchase_is_refused(manager, purchase, speaker):
    purchase.status = Purchase.Status.RECEIVED
    purchase.save()
    response = bulk(client_for(manager), purchase, [existing_row(speaker)])
    assert response.status_code == 400
    assert PurchaseItem.objects.count() == 0


def test_staff_can_bulk_add_but_never_see_costs(staff, purchase, speaker):
    response = bulk(client_for(staff), purchase, [existing_row(speaker)])
    assert response.status_code == 201
    item = response.json()["items"][0]
    assert "unit_cost_paid" not in item and "subtotal_paid" not in item


# --- editing a draft line --------------------------------------------------

@pytest.fixture
def line(purchase, speaker):
    return PurchaseItem.objects.create(
        purchase=purchase, product=speaker, quantity=2, unit_cost_paid=Decimal("40.00"),
        unit_cost_invoiced=Decimal("40.00"), subtotal_paid=Decimal("80.00"), subtotal_invoiced=Decimal("80.00"),
    )


def patch_line(client, purchase, line, data):
    return client.patch(f"/api/purchases/{purchase.purchase_id}/items/{line.purchase_item_id}/", data, format="json")


def test_patch_quantity_recomputes_subtotals_and_totals(manager, purchase, line):
    response = patch_line(client_for(manager), purchase, line, {"quantity": 3})

    assert response.status_code == 200, response.content
    line.refresh_from_db()
    purchase.refresh_from_db()
    assert line.quantity == 3
    assert line.subtotal_paid == Decimal("120.00")
    assert purchase.total_paid == Decimal("120.00")
    assert purchase.total_invoiced == Decimal("120.00")


def test_patch_cost_difference_needs_a_note(manager, purchase, line):
    client = client_for(manager)
    assert patch_line(client, purchase, line, {"unit_cost_invoiced": "45.00"}).status_code == 400

    response = patch_line(client, purchase, line, {"unit_cost_invoiced": "45.00", "price_discrepancy_note": "promo"})
    assert response.status_code == 200
    line.refresh_from_db()
    assert line.subtotal_invoiced == Decimal("90.00")


def test_patch_rejects_zero_quantity(manager, purchase, line):
    assert patch_line(client_for(manager), purchase, line, {"quantity": 0}).status_code == 400


def test_patch_on_received_purchase_is_refused(manager, purchase, line):
    purchase.status = Purchase.Status.RECEIVED
    purchase.save()
    assert patch_line(client_for(manager), purchase, line, {"quantity": 5}).status_code == 400
    line.refresh_from_db()
    assert line.quantity == 2


def test_patch_line_of_another_purchase_is_404(manager, purchase, line, supplier):
    other = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 10, 1))
    response = client_for(manager).patch(
        f"/api/purchases/{other.purchase_id}/items/{line.purchase_item_id}/", {"quantity": 5}, format="json"
    )
    assert response.status_code == 404


def test_delete_line_still_works(manager, purchase, line):
    response = client_for(manager).delete(f"/api/purchases/{purchase.purchase_id}/items/{line.purchase_item_id}/")
    assert response.status_code == 204
    assert PurchaseItem.objects.count() == 0


# --- recent products from a supplier --------------------------------------

def test_recent_products_are_distinct_most_recent_first_and_capped_at_20(manager, supplier, category):
    products = [Product.objects.create(category=category, barcode=f"PES-AUD-{i:05d}", name=f"P{i}") for i in range(25)]
    for day, p in enumerate(products, start=1):
        purchase = Purchase.objects.create(
            supplier=supplier, employee=manager, purchase_date=date(2026, 1, 1).replace(day=min(day, 28)),
        )
        PurchaseItem.objects.create(
            purchase=purchase, product=p, quantity=1, unit_cost_paid=Decimal("1"), unit_cost_invoiced=Decimal("1"),
            subtotal_paid=Decimal("1"), subtotal_invoiced=Decimal("1"),
        )
    # buy P0 again most recently: it must appear once, first
    latest = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 2, 1))
    PurchaseItem.objects.create(
        purchase=latest, product=products[0], quantity=4, unit_cost_paid=Decimal("2"), unit_cost_invoiced=Decimal("2"),
        subtotal_paid=Decimal("8"), subtotal_invoiced=Decimal("8"),
    )

    response = client_for(manager).get(f"/api/suppliers/{supplier.supplier_id}/recent-products/")

    assert response.status_code == 200
    rows = response.json()["results"]
    assert len(rows) == 20
    assert rows[0]["product_id"] == products[0].product_id
    assert rows[0]["last_quantity"] == 4
    assert rows[0]["last_unit_cost_paid"] == "2.00"
    assert len({r["product_id"] for r in rows}) == 20


def test_recent_products_ignore_cancelled_purchases_and_other_suppliers(staff, manager, supplier, speaker, category):
    other_supplier = Supplier.objects.create(name="Other")
    kettle = Product.objects.create(category=category, barcode="PES-AUD-00009", name="Kettle")
    cancelled = Purchase.objects.create(
        supplier=supplier, employee=manager, purchase_date=date(2026, 1, 1), status=Purchase.Status.CANCELLED
    )
    elsewhere = Purchase.objects.create(supplier=other_supplier, employee=manager, purchase_date=date(2026, 1, 1))
    for purchase, product in ((cancelled, speaker), (elsewhere, kettle)):
        PurchaseItem.objects.create(
            purchase=purchase, product=product, quantity=1, unit_cost_paid=Decimal("1"),
            unit_cost_invoiced=Decimal("1"), subtotal_paid=Decimal("1"), subtotal_invoiced=Decimal("1"),
        )

    response = client_for(staff).get(f"/api/suppliers/{supplier.supplier_id}/recent-products/")

    assert response.status_code == 200
    assert response.json()["results"] == []


def test_staff_never_see_cost_in_recent_products(staff, manager, supplier, speaker):
    purchase = Purchase.objects.create(supplier=supplier, employee=manager, purchase_date=date(2026, 1, 1))
    PurchaseItem.objects.create(
        purchase=purchase, product=speaker, quantity=1, unit_cost_paid=Decimal("1"),
        unit_cost_invoiced=Decimal("1"), subtotal_paid=Decimal("1"), subtotal_invoiced=Decimal("1"),
    )
    rows = client_for(staff).get(f"/api/suppliers/{supplier.supplier_id}/recent-products/").json()["results"]
    assert rows[0]["product_id"] == speaker.product_id
    assert "last_unit_cost_paid" not in rows[0]
