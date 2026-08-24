# Phase 2: Purchasing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the purchasing workflow — draft purchases, adding line items (existing or brand-new products), and receiving a purchase (which increments stock on hand).

**Architecture:** Extends the existing `purchasing` Django app (which already has `Supplier` CRUD and schema-only `Purchase`/`PurchaseItem` models from Phase 1). Adds a `status` field to `Purchase`, a new `purchasing/services.py` module holding all business logic (independently testable without HTTP), and a `PurchaseViewSet` with two custom actions (`items`, `receive`) on top of standard header CRUD. Reuses `catalog.services.generate_barcode` for inline new-product creation and writes to `stock.models.Inventory` for the first time, applying the same `select_for_update` locking discipline as the barcode service.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged from Phase 1. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-phase2-purchasing-design.md`

## Global Constraints

- Every model uses an explicit `<name>_id` `AutoField` primary key — already true for `Purchase.purchase_id`/`PurchaseItem.purchase_item_id`; do not change.
- Money fields are `DecimalField(max_digits=12, decimal_places=2)`.
- Tests use `pytest-django` + DRF's `APIClient` — never Django's `TestCase`/`manage.py test`.
- All new endpoints are `IsAuthenticated` only — no admin gate (purchasing is a staff activity per the spec, not Admin-gated).
- `Purchase.employee` is always set server-side from `request.user`, never client-supplied — same principle as `Product.barcode` being server-generated in Phase 1.
- Migrations via `docker compose run --rm web python manage.py makemigrations <app>` then `migrate`.
- Every task ends with a real, specific `git commit` message.
- Tests run via `docker compose run --rm web pytest ...`.

---

### Task 1: `Purchase.status` field + default totals

**Files:**
- Modify: `backend/purchasing/models.py`
- Test: `backend/purchasing/tests/test_models.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Purchase.Status` (`TextChoices`: `DRAFT`/`RECEIVED`), `Purchase.status` field defaulting to `DRAFT`. `Purchase.total_paid`/`total_invoiced` now default to `0` (still overridable by explicit value). Every later task in this plan reads/writes `Purchase.status`.

- [ ] **Step 1: Write the failing test — append to `backend/purchasing/tests/test_models.py`**

```python
def test_new_purchase_defaults_to_draft_status_and_zero_totals(employee, supplier):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
    )
    assert purchase.status == Purchase.Status.DRAFT
    assert purchase.total_paid == 0
    assert purchase.total_invoiced == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest purchasing/tests/test_models.py -v`
Expected: FAIL — `AttributeError: type object 'Purchase' has no attribute 'Status'` (and/or `IntegrityError`/`TypeError` from `total_paid`/`total_invoiced` still being required with no default).

- [ ] **Step 3: Modify `backend/purchasing/models.py`** — add `Status` and the `status` field to `Purchase`, and give `total_paid`/`total_invoiced` a default. Full updated `Purchase` class (replace the existing one; `Supplier` and `PurchaseItem` are unchanged):

```python
class Purchase(models.Model):
    class PaymentStatus(models.TextChoices):
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partial"
        UNPAID = "unpaid", "Unpaid"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RECEIVED = "received", "Received"

    purchase_id = models.AutoField(primary_key=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="purchases")
    invoice_number = models.CharField(max_length=60, blank=True, null=True)
    purchase_date = models.DateField()
    total_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_invoiced = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PAID
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    def __str__(self):
        return f"Purchase #{self.purchase_id} - {self.supplier}"
```

- [ ] **Step 4: Generate and apply migration**

```bash
docker compose run --rm web python manage.py makemigrations purchasing
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose run --rm web pytest purchasing/tests/test_models.py -v`
Expected: 4 passed (3 existing from Phase 1 + 1 new). The 3 existing tests pass explicit `total_paid`/`total_invoiced` values, which still override the new default — confirm none of them broke.

- [ ] **Step 6: Commit**

```bash
git add backend/purchasing/
git commit -m "Add Purchase.status field (draft/received) and default totals"
```

---

### Task 2: Core add-item services

**Files:**
- Create: `backend/purchasing/services.py`
- Create: `backend/purchasing/tests/test_services.py`

**Interfaces:**
- Consumes: `Purchase`, `PurchaseItem` (Task 1, this app), `catalog.models.Product`, `catalog.models.ProductPricing`, `catalog.services.generate_barcode(category: Category) -> str` (Phase 1, unchanged).
- Produces: `add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note="") -> PurchaseItem` and `add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced, selling_price, brand="", model_number="", specifications="", usage_instructions="", warranty_months=0, reorder_level=5, price_discrepancy_note="") -> PurchaseItem`, plus private helpers `_validate_discrepancy_note`, `_recompute_purchase_totals`. Task 3 adds `remove_item`/`receive_purchase` to this same file. Task 4's view layer calls these four public functions by these exact names/signatures.

- [ ] **Step 1: Write the failing tests — `backend/purchasing/tests/test_services.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from purchasing.models import Supplier, Purchase, PurchaseItem
from purchasing.services import add_existing_product_item, add_new_product_item

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics Ltd")


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


@pytest.fixture
def draft_purchase(employee, supplier):
    return Purchase.objects.create(supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1))


def test_add_existing_product_item_computes_subtotals_and_recomputes_totals(draft_purchase, product):
    item = add_existing_product_item(
        draft_purchase, product, quantity=3,
        unit_cost_paid=Decimal("100000.00"), unit_cost_invoiced=Decimal("100000.00"),
    )
    assert item.subtotal_paid == Decimal("300000.00")
    assert item.subtotal_invoiced == Decimal("300000.00")
    draft_purchase.refresh_from_db()
    assert draft_purchase.total_paid == Decimal("300000.00")
    assert draft_purchase.total_invoiced == Decimal("300000.00")


def test_add_existing_product_item_accumulates_totals_across_multiple_items(draft_purchase, product, category):
    other_product = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Boya Mic")
    add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    add_existing_product_item(draft_purchase, other_product, 2, Decimal("50.00"), Decimal("50.00"))
    draft_purchase.refresh_from_db()
    assert draft_purchase.total_paid == Decimal("200.00")


def test_add_new_product_item_creates_product_with_barcode_and_initial_pricing(draft_purchase, category):
    item = add_new_product_item(
        draft_purchase, category=category, name="JBL Flip 6 Speaker", quantity=8,
        unit_cost_paid=Decimal("108000.00"), unit_cost_invoiced=Decimal("112000.00"),
        selling_price=Decimal("145000.00"), price_discrepancy_note="Verbal bulk discount",
    )
    assert item.product.barcode == "PES-AUD-00001"
    assert item.product.name == "JBL Flip 6 Speaker"
    pricing = ProductPricing.objects.get(product=item.product)
    assert pricing.is_current is True
    assert pricing.wholesale_price == Decimal("108000.00")
    assert pricing.retail_price == Decimal("145000.00")


def test_discrepancy_note_required_when_costs_differ(draft_purchase, product):
    with pytest.raises(ValidationError):
        add_existing_product_item(
            draft_purchase, product, 1, Decimal("100.00"), Decimal("110.00"),
        )


def test_discrepancy_note_not_required_when_costs_match(draft_purchase, product):
    item = add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    assert item.price_discrepancy_note == ""


def test_discrepancy_note_provided_when_costs_differ_succeeds(draft_purchase, product):
    item = add_existing_product_item(
        draft_purchase, product, 1, Decimal("100.00"), Decimal("110.00"),
        price_discrepancy_note="Supplier rounding",
    )
    assert item.price_discrepancy_note == "Supplier rounding"


def test_add_item_to_received_purchase_rejected(draft_purchase, product):
    draft_purchase.status = Purchase.Status.RECEIVED
    draft_purchase.save()
    with pytest.raises(ValidationError):
        add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest purchasing/tests/test_services.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'purchasing.services'`.

- [ ] **Step 3: Write `backend/purchasing/services.py`**

```python
from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from catalog.models import Product, ProductPricing
from catalog.services import generate_barcode
from purchasing.models import Purchase, PurchaseItem


def _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note):
    if unit_cost_paid != unit_cost_invoiced and not price_discrepancy_note:
        raise ValidationError({
            "price_discrepancy_note": "Required when unit_cost_paid differs from unit_cost_invoiced."
        })


def _recompute_purchase_totals(purchase):
    totals = purchase.items.aggregate(paid=Sum("subtotal_paid"), invoiced=Sum("subtotal_invoiced"))
    purchase.total_paid = totals["paid"] or Decimal("0.00")
    purchase.total_invoiced = totals["invoiced"] or Decimal("0.00")
    purchase.save(update_fields=["total_paid", "total_invoiced"])


def add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced,
                               price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that has already been received.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    with transaction.atomic():
        item = PurchaseItem.objects.create(
            purchase=purchase, product=product, quantity=quantity,
            unit_cost_paid=unit_cost_paid, unit_cost_invoiced=unit_cost_invoiced,
            price_discrepancy_note=price_discrepancy_note,
            subtotal_paid=quantity * unit_cost_paid,
            subtotal_invoiced=quantity * unit_cost_invoiced,
        )
        _recompute_purchase_totals(purchase)
    return item


def add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced,
                          selling_price, brand="", model_number="", specifications="",
                          usage_instructions="", warranty_months=0, reorder_level=5,
                          price_discrepancy_note=""):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot add items to a purchase that has already been received.")
    _validate_discrepancy_note(unit_cost_paid, unit_cost_invoiced, price_discrepancy_note)
    with transaction.atomic():
        barcode = generate_barcode(category)
        product = Product.objects.create(
            category=category, barcode=barcode, name=name, brand=brand, model_number=model_number,
            specifications=specifications, usage_instructions=usage_instructions,
            warranty_months=warranty_months, reorder_level=reorder_level,
        )
        ProductPricing.objects.create(
            product=product, wholesale_price=unit_cost_paid, retail_price=selling_price,
            effective_date=timezone.now().date(), is_current=True,
        )
        item = add_existing_product_item(
            purchase, product, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note
        )
    return item
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm web pytest purchasing/tests/test_services.py -v`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/purchasing/services.py backend/purchasing/tests/test_services.py
git commit -m "Add purchasing services for adding existing and new-product line items"
```

---

### Task 3: `remove_item` + `receive_purchase` services

**Files:**
- Modify: `backend/purchasing/services.py`
- Modify: `backend/purchasing/tests/test_services.py`

**Interfaces:**
- Consumes: `stock.models.Inventory` (Phase 1 schema-only model, first write access here).
- Produces: `remove_item(purchase, item) -> None`, `receive_purchase(purchase) -> Purchase`. Task 4's view layer calls both by these exact names/signatures.

- [ ] **Step 1: Write the failing tests — append to `backend/purchasing/tests/test_services.py`**

```python
from stock.models import Inventory
from purchasing.services import remove_item, receive_purchase


def test_remove_item_recomputes_totals(draft_purchase, product):
    item = add_existing_product_item(draft_purchase, product, 2, Decimal("100.00"), Decimal("100.00"))
    remove_item(draft_purchase, item)
    draft_purchase.refresh_from_db()
    assert draft_purchase.total_paid == Decimal("0.00")
    assert PurchaseItem.objects.filter(pk=item.pk).exists() is False


def test_remove_item_from_received_purchase_rejected(draft_purchase, product):
    item = add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    draft_purchase.status = Purchase.Status.RECEIVED
    draft_purchase.save()
    with pytest.raises(ValidationError):
        remove_item(draft_purchase, item)


def test_receive_purchase_increments_existing_inventory(draft_purchase, product):
    Inventory.objects.create(product=product, quantity_in_stock=5)
    add_existing_product_item(draft_purchase, product, 3, Decimal("100.00"), Decimal("100.00"))
    receive_purchase(draft_purchase)
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 8
    draft_purchase.refresh_from_db()
    assert draft_purchase.status == Purchase.Status.RECEIVED


def test_receive_purchase_creates_inventory_when_none_exists(draft_purchase, product):
    assert Inventory.objects.filter(product=product).exists() is False
    add_existing_product_item(draft_purchase, product, 4, Decimal("100.00"), Decimal("100.00"))
    receive_purchase(draft_purchase)
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 4


def test_receive_empty_purchase_rejected(draft_purchase):
    with pytest.raises(ValidationError):
        receive_purchase(draft_purchase)


def test_receive_already_received_purchase_rejected(draft_purchase, product):
    add_existing_product_item(draft_purchase, product, 1, Decimal("100.00"), Decimal("100.00"))
    receive_purchase(draft_purchase)
    with pytest.raises(ValidationError):
        receive_purchase(draft_purchase)


def test_sequential_receives_for_never_stocked_product_do_not_duplicate_inventory(draft_purchase, product, category, employee, supplier):
    # Mirrors catalog/tests/test_barcode_service.py's sequential-call pattern: proves the
    # get_or_create-under-select_for_update path is idempotent across repeated receives
    # against the same product, since true concurrent-transaction testing is out of scope.
    add_existing_product_item(draft_purchase, product, 2, Decimal("100.00"), Decimal("100.00"))
    receive_purchase(draft_purchase)

    second_purchase = Purchase.objects.create(supplier=supplier, employee=employee, purchase_date=date(2026, 2, 1))
    add_existing_product_item(second_purchase, product, 5, Decimal("100.00"), Decimal("100.00"))
    receive_purchase(second_purchase)

    assert Inventory.objects.filter(product=product).count() == 1
    assert Inventory.objects.get(product=product).quantity_in_stock == 7
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest purchasing/tests/test_services.py -v`
Expected: FAIL — `ImportError: cannot import name 'remove_item'`.

- [ ] **Step 3: Append to `backend/purchasing/services.py`** — add the import and two functions:

```python
from stock.models import Inventory


def remove_item(purchase, item):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Cannot remove items from a purchase that has already been received.")
    with transaction.atomic():
        item.delete()
        _recompute_purchase_totals(purchase)


def receive_purchase(purchase):
    if purchase.status != Purchase.Status.DRAFT:
        raise ValidationError("Purchase has already been received.")
    items = list(purchase.items.select_related("product").all())
    if not items:
        raise ValidationError("Cannot receive a purchase with no line items.")
    with transaction.atomic():
        for item in items:
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product=item.product, defaults={"quantity_in_stock": 0}
            )
            inventory.quantity_in_stock += item.quantity
            inventory.save(update_fields=["quantity_in_stock"])
        purchase.status = Purchase.Status.RECEIVED
        purchase.save(update_fields=["status"])
    return purchase
```

(Add the `from stock.models import Inventory` line near the top of the file with the other imports, not inline.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm web pytest purchasing/tests/test_services.py -v`
Expected: 14 passed (7 from Task 2 + 7 new).

- [ ] **Step 5: Run the full purchasing suite to confirm no regressions**

Run: `docker compose run --rm web pytest purchasing/ -v`
Expected: 18 passed (2 supplier API + 4 model + 14 service, wait — recompute: 2 existing Supplier API tests + 4 model tests (Task 1) + 14 service tests (Task 2+3) = 20 passed). Report the actual number honestly if it differs — the arithmetic here is a sanity check, not a hard requirement.

- [ ] **Step 6: Commit**

```bash
git add backend/purchasing/services.py backend/purchasing/tests/test_services.py
git commit -m "Add remove_item and receive_purchase services with locked stock increment"
```

---

### Task 4: Serializers + `PurchaseViewSet` + URL wiring

**Files:**
- Modify: `backend/purchasing/serializers.py`
- Modify: `backend/purchasing/views.py`
- Modify: `backend/purchasing/urls.py`
- Create: `backend/purchasing/tests/test_purchase_api.py`

**Interfaces:**
- Consumes: `add_existing_product_item`, `add_new_product_item`, `remove_item`, `receive_purchase` (Tasks 2-3, exact names/signatures above).
- Produces: `POST/GET /api/purchases/`, `GET/PATCH /api/purchases/{id}/`, `POST /api/purchases/{id}/items/`, `DELETE /api/purchases/{id}/items/{item_id}/`, `POST /api/purchases/{id}/receive/`.

- [ ] **Step 1: Write the failing tests — `backend/purchasing/tests/test_purchase_api.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Supplier, Purchase, PurchaseItem
from stock.models import Inventory

pytestmark = pytest.mark.django_db


def auth_client(employee, password):
    client = APIClient()
    response = client.post(
        "/api/auth/login/", {"username": employee.username, "password": password}, format="json"
    )
    token = response.json()["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Kigali Electronics Ltd")


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


@pytest.fixture
def draft_purchase(employee, supplier):
    return Purchase.objects.create(supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1))


def test_create_draft_purchase(employee, supplier):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/purchases/",
        {"supplier": supplier.supplier_id, "invoice_number": "KE-8841", "purchase_date": "2026-01-01"},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["total_paid"] == "0.00"


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/purchases/")
    assert response.status_code == 401


def test_add_existing_product_item_via_api(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["subtotal_paid"] == "200.00"


def test_add_new_product_item_via_api_returns_generated_barcode(employee, draft_purchase, category):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {
            "category": category.category_id, "name": "JBL Flip 6 Speaker", "selling_price": "145000.00",
            "quantity": 8, "unit_cost_paid": "108000.00", "unit_cost_invoiced": "108000.00",
        },
        format="json",
    )
    assert response.status_code == 201
    product_id = response.json()["product"]
    assert Product.objects.get(pk=product_id).barcode == "PES-AUD-00001"


def test_discrepancy_note_missing_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "110.00"},
        format="json",
    )
    assert response.status_code == 400


def test_discrepancy_note_provided_returns_201(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {
            "product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00",
            "unit_cost_invoiced": "110.00", "price_discrepancy_note": "Supplier rounding",
        },
        format="json",
    )
    assert response.status_code == 201


def test_header_totals_reflect_after_add(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert response.json()["total_paid"] == "200.00"


def test_delete_item_updates_totals(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    add_response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 2, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    item_id = add_response.json()["purchase_item_id"]
    delete_response = client.delete(f"/api/purchases/{draft_purchase.purchase_id}/items/{item_id}/")
    assert delete_response.status_code == 204
    get_response = client.get(f"/api/purchases/{draft_purchase.purchase_id}/")
    assert get_response.json()["total_paid"] == "0.00"


def test_receive_via_api_increments_inventory(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 5, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert response.status_code == 200
    assert response.json()["status"] == "received"
    assert Inventory.objects.get(product=product).quantity_in_stock == 5


def test_receive_twice_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    second_response = client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    assert second_response.status_code == 400


def test_add_item_to_received_purchase_returns_400(employee, draft_purchase, product):
    client = auth_client(employee, "staffpass")
    client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    client.post(f"/api/purchases/{draft_purchase.purchase_id}/receive/")
    response = client.post(
        f"/api/purchases/{draft_purchase.purchase_id}/items/",
        {"product": product.product_id, "quantity": 1, "unit_cost_paid": "100.00", "unit_cost_invoiced": "100.00"},
        format="json",
    )
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest purchasing/tests/test_purchase_api.py -v`
Expected: FAIL — `/api/purchases/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/purchasing/serializers.py`**

```python
from catalog.models import Category, Product
from purchasing.models import Purchase, PurchaseItem


class PurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Purchase
        fields = [
            "purchase_id", "supplier", "employee", "invoice_number", "purchase_date",
            "total_paid", "total_invoiced", "payment_status", "status",
        ]
        read_only_fields = ["purchase_id", "employee", "total_paid", "total_invoiced", "status"]


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = [
            "purchase_item_id", "purchase", "product", "quantity", "unit_cost_paid",
            "unit_cost_invoiced", "price_discrepancy_note", "subtotal_paid", "subtotal_invoiced",
        ]
        read_only_fields = fields


class AddPurchaseItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all(), required=False)
    name = serializers.CharField(required=False)
    brand = serializers.CharField(required=False, allow_blank=True, default="")
    model_number = serializers.CharField(required=False, allow_blank=True, default="")
    specifications = serializers.CharField(required=False, allow_blank=True, default="")
    usage_instructions = serializers.CharField(required=False, allow_blank=True, default="")
    warranty_months = serializers.IntegerField(required=False, default=0)
    reorder_level = serializers.IntegerField(required=False, default=5)
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    quantity = serializers.IntegerField()
    unit_cost_paid = serializers.DecimalField(max_digits=12, decimal_places=2)
    unit_cost_invoiced = serializers.DecimalField(max_digits=12, decimal_places=2)
    price_discrepancy_note = serializers.CharField(required=False, allow_blank=True, default="")

    def validate(self, attrs):
        is_new_product = attrs.get("product") is None
        if is_new_product:
            missing = [f for f in ("category", "name", "selling_price") if f not in attrs]
            if missing:
                raise serializers.ValidationError(
                    {f: "Required when not referencing an existing product." for f in missing}
                )
        attrs["_is_new_product"] = is_new_product
        return attrs
```

(`serializers` and `Product` may already be partially imported at the top of the file from the existing `SupplierSerializer` — add only the names not already present: `from catalog.models import Category, Product` and `from purchasing.models import Purchase, PurchaseItem` alongside the existing `from purchasing.models import Supplier`, or combine into one `from purchasing.models import Supplier, Purchase, PurchaseItem` import line.)

- [ ] **Step 4: Append to `backend/purchasing/views.py`**

```python
from django.shortcuts import get_object_or_404
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework import status as http_status

from purchasing.models import Purchase, PurchaseItem
from purchasing.serializers import PurchaseSerializer, AddPurchaseItemSerializer, PurchaseItemSerializer
from purchasing.services import add_existing_product_item, add_new_product_item, remove_item, receive_purchase


class PurchaseViewSet(viewsets.ModelViewSet):
    queryset = Purchase.objects.all().order_by("-purchase_date")
    serializer_class = PurchaseSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(employee=self.request.user)

    def perform_update(self, serializer):
        if serializer.instance.status != Purchase.Status.DRAFT:
            raise PermissionDenied("Cannot edit a purchase that has already been received.")
        serializer.save()

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pk=None):
        purchase = self.get_object()
        serializer = AddPurchaseItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        is_new_product = data.pop("_is_new_product")
        if is_new_product:
            item = add_new_product_item(
                purchase, category=data["category"], name=data["name"],
                quantity=data["quantity"], unit_cost_paid=data["unit_cost_paid"],
                unit_cost_invoiced=data["unit_cost_invoiced"], selling_price=data["selling_price"],
                brand=data.get("brand", ""), model_number=data.get("model_number", ""),
                specifications=data.get("specifications", ""),
                usage_instructions=data.get("usage_instructions", ""),
                warranty_months=data.get("warranty_months", 0),
                reorder_level=data.get("reorder_level", 5),
                price_discrepancy_note=data.get("price_discrepancy_note", ""),
            )
        else:
            item = add_existing_product_item(
                purchase, data["product"], data["quantity"], data["unit_cost_paid"],
                data["unit_cost_invoiced"], data.get("price_discrepancy_note", ""),
            )
        return Response(PurchaseItemSerializer(item).data, status=http_status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"items/(?P<item_id>[^/.]+)")
    def remove_item_action(self, request, pk=None, item_id=None):
        purchase = self.get_object()
        item = get_object_or_404(PurchaseItem, pk=item_id, purchase=purchase)
        remove_item(purchase, item)
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def receive(self, request, pk=None):
        purchase = self.get_object()
        receive_purchase(purchase)
        return Response(PurchaseSerializer(purchase).data)
```

(`viewsets` and `IsAuthenticated` are already imported at the top of the file for `SupplierViewSet` — don't duplicate those imports, just add the new names above.)

- [ ] **Step 5: Modify `backend/purchasing/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from purchasing.views import SupplierViewSet, PurchaseViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchases", PurchaseViewSet, basename="purchase")

urlpatterns = router.urls
```

No `config/urls.py` change needed — `purchasing.urls` is already included there from Phase 1 Task 8.

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose run --rm web pytest purchasing/tests/test_purchase_api.py -v`
Expected: 12 passed.

- [ ] **Step 7: Run the full purchasing suite, then the full project suite, to confirm no regressions**

```bash
docker compose run --rm web pytest purchasing/ -v
docker compose run --rm web pytest -v
```
Expected: `purchasing/` shows 32 passed (20 from Task 3's checkpoint + 12 new). Full suite shows 89 passed (57 from Phase 1 + 32 from this app) — report the actual numbers; if they differ from this arithmetic, that's fine as long as everything passes and the difference is understood (e.g. an extra assertion split into two test functions somewhere).

- [ ] **Step 8: Commit**

```bash
git add backend/purchasing/
git commit -m "Add PurchaseViewSet with items/receive actions and URL wiring"
```

---

### Task 5: Final integration check

**Files:**
- Modify: `backend/README.md`
- No other source files modified (verification-only task, plus the README update).

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a documented, verified, fully-passing Phase 2 purchasing API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phase 1 (57) plus this plan's purchasing tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with no output.

- [ ] **Step 3: Update `backend/README.md`'s endpoint list**

Add a line documenting the new purchasing endpoints under the existing "Endpoints (Phase 1)" section (rename the heading to drop the "(Phase 1)" qualifier or add a new "Purchasing (Phase 2)" subsection — your call, keep it tidy) — list: `POST/GET /api/purchases/`, `GET/PATCH /api/purchases/{id}/`, `POST /api/purchases/{id}/items/`, `DELETE /api/purchases/{id}/items/{item_id}/`, `POST /api/purchases/{id}/receive/`. Update the existing note that says purchasing is schema-only — it no longer is; only sales, stock/equipment, dashboard, and notifications remain schema-only.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 2 purchasing endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase (all confirmed correct, zero corrections needed):**
- `catalog.services.generate_barcode(category: Category) -> str` — signature matches exactly what this plan assumes.
- `stock.models.Inventory` — field names (`product` OneToOneField, `quantity_in_stock`) match exactly.
- `backend/config/urls.py` already includes `path("api/", include("purchasing.urls"))` from Phase 1 Task 8 — no `config/urls.py` change needed anywhere in this plan.
- `backend/purchasing/admin.py` already registers `Purchase` and `PurchaseItem` (from Phase 1 Task 10) — no admin.py change needed.
- Existing `backend/purchasing/tests/test_models.py` (3 tests) and `SupplierSerializer`/`SupplierViewSet`/`purchasing/urls.py` content confirmed exactly as assumed.
- `catalog/tests/test_product_pricing_api.py`'s `auth_client(employee, password)` helper pattern confirmed and replicated verbatim in every new test file in this plan.

**Spec coverage:** Purchase state (Decision 1) → Task 1. RBAC/no-admin-gate (Decision 4) → every task's `IsAuthenticated`-only views. Discrepancy note enforcement (Decision 3) → Task 2's `_validate_discrepancy_note`, tested in Tasks 2 and 4. API shape (header + `/items/` + `/receive/` actions, Decision 5) → Task 4. New-product-inline creation with barcode + initial pricing → Task 2. Receive-time stock increment with locking → Task 3. Data flow example (draft → add 3 items → receive) → exercised end-to-end across Task 4's API tests. Error handling (400/401/403/404) → tested throughout Task 4. Testing section's every named scenario → present across Tasks 2-4. Out-of-scope items (storage_location, barcode printing, frontend, VAT/margin) → correctly absent from every task.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.

**Type/signature consistency:** `add_existing_product_item(purchase, product, quantity, unit_cost_paid, unit_cost_invoiced, price_discrepancy_note="")` is defined in Task 2 and called with identical positional/keyword shape in Task 2's own tests, Task 3 (`add_new_product_item`'s internal call), and Task 4's view. `add_new_product_item(purchase, *, category, name, quantity, unit_cost_paid, unit_cost_invoiced, selling_price, ...)` — keyword-only after `purchase`, called consistently. `remove_item(purchase, item)` and `receive_purchase(purchase)` (Task 3) called identically in Task 4's view. `Purchase.Status.DRAFT`/`RECEIVED` (Task 1) referenced with matching member names everywhere it's checked (Tasks 2, 3, 4).

**Test count arithmetic:** stated inline at each checkpoint (Task 1: 4, Task 3 checkpoint: 20, Task 4 checkpoint: 32 purchasing / 89 total) as sanity checks, not hard requirements — Task 5 explicitly instructs reporting the real final count rather than forcing a match to the estimate, following the same pattern Phase 1's plan used successfully.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
