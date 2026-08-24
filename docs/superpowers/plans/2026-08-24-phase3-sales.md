# Phase 3: Sales / POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the sales/checkout workflow — completing a sale in one atomic request (decrementing stock, resolving retail prices server-side, notifying admins), and reversing one via return/cancel (restoring stock).

**Architecture:** Adds a `sales/services.py` module (independently testable business logic, mirroring `catalog/services.py` and `purchasing/services.py`) called from a `SaleViewSet`. No model changes — `Sale`, `SaleItem`, and `NotificationLog` already have the right schema from Phase 1. `complete_sale` locks every distinct product's `Inventory` row in consistent ascending-`product_id` order before checking sufficiency, avoiding cross-sale deadlocks. `reverse_sale` locks the `Sale` row itself before checking/mutating status, applying from day one the discipline Phase 2 had to retrofit after its final review.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-phase3-sales-design.md`

## Global Constraints

- Every model uses an explicit `<name>_id` `AutoField` primary key — already true for `Sale.sale_id`/`SaleItem.sale_item_id`; no model changes anywhere in this plan.
- Money fields are `DecimalField(max_digits=12, decimal_places=2)`.
- Tests use `pytest-django` + DRF's `APIClient` — never Django's `TestCase`/`manage.py test`.
- All new endpoints are `IsAuthenticated` only — no admin gate, no price-masking (retail prices aren't secret).
- Prices are always server-resolved from `ProductPricing.retail_price` (`is_current=True`) — never client-submitted, same principle as `Product.barcode` being server-generated.
- `Sale` is immutable once created — `SaleViewSet` restricts `http_method_names` to `get`/`post`/`head`/`options` from the start.
- Migrations via `docker compose run --rm web python manage.py makemigrations <app>` then `migrate` — not expected to be needed anywhere in this plan (no schema changes), but confirm at each checkpoint.
- Every task ends with a real, specific `git commit` message.
- Tests run via `docker compose run --rm web pytest ...`.

---

### Task 1: `complete_sale` service

**Files:**
- Create: `backend/sales/services.py`
- Create: `backend/sales/tests/test_services.py`

**Interfaces:**
- Consumes: `sales.models.Sale`/`SaleItem` (Phase 1), `catalog.models.ProductPricing` (Phase 1), `stock.models.Inventory` (Phase 1), `notifications.models.NotificationLog` (Phase 1), `accounts.models.Employee` (Phase 1).
- Produces: `complete_sale(customer, employee, payment_method, items) -> Sale` where `items` is a list of `{"product": Product instance, "quantity": int}`. Plus private helpers `_resolve_retail_price(product)` and `_notify_admins(sale)`. Task 2 appends `reverse_sale` to this same file. Task 3's view layer calls `complete_sale` by this exact name/signature.

- [ ] **Step 1: Write the failing tests — `backend/sales/tests/test_services.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from notifications.models import NotificationLog
from sales.models import Customer, Sale, SaleItem
from sales.services import complete_sale
from stock.models import Inventory

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def make_product_with_stock(category, barcode, retail_price, stock):
    product = Product.objects.create(category=category, barcode=barcode, name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=retail_price,
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=stock)
    return product


def test_complete_sale_with_sufficient_stock_decrements_and_computes_total(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 3}],
    )
    assert sale.total_amount == Decimal("300.00")
    assert sale.status == Sale.SaleStatus.COMPLETED
    item = SaleItem.objects.get(sale=sale)
    assert item.unit_price == Decimal("100.00")
    assert item.subtotal == Decimal("300.00")
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 7


def test_complete_sale_creates_one_notification_per_admin(employee, admin, category):
    other_admin = Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    logs = NotificationLog.objects.filter(related_sale=sale)
    assert logs.count() == 2
    assert set(logs.values_list("recipient_id", flat=True)) == {admin.pk, other_admin.pk}
    assert all(log.type == "sale_alert" for log in logs)
    assert all(log.status == NotificationLog.NotificationStatus.SENT for log in logs)


def test_complete_sale_with_no_admins_creates_zero_notifications_and_succeeds(employee, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    assert NotificationLog.objects.filter(related_sale=sale).count() == 0


def test_complete_sale_with_customer(employee, admin, category):
    customer = Customer.objects.create(name="Jean Claude")
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=customer, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    assert sale.customer == customer


def test_complete_sale_rejects_empty_items(employee, admin):
    with pytest.raises(ValidationError):
        complete_sale(customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH, items=[])


def test_complete_sale_rejects_insufficient_stock(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=2)
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[{"product": product, "quantity": 3}],
        )
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 2


def test_complete_sale_multiline_blocks_whole_sale_if_one_line_insufficient(employee, admin, category):
    sufficient = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    insufficient = make_product_with_stock(category, "PES-AUD-00002", Decimal("50.00"), stock=1)
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[
                {"product": sufficient, "quantity": 2},
                {"product": insufficient, "quantity": 5},
            ],
        )
    assert SaleItem.objects.count() == 0
    assert Inventory.objects.get(product=sufficient).quantity_in_stock == 10
    assert Inventory.objects.get(product=insufficient).quantity_in_stock == 1


def test_complete_sale_product_never_stocked_is_insufficient(employee, admin, category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00003", name="New Thing")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("10.00"), retail_price=Decimal("20.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    with pytest.raises(ValidationError):
        complete_sale(
            customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
            items=[{"product": product, "quantity": 1}],
        )
    assert Inventory.objects.filter(product=product).exists() is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest sales/tests/test_services.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sales.services'`.

- [ ] **Step 3: Write `backend/sales/services.py`**

```python
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError

from accounts.models import Employee
from catalog.models import ProductPricing
from notifications.models import NotificationLog
from sales.models import Sale, SaleItem
from stock.models import Inventory


def _resolve_retail_price(product):
    try:
        pricing = ProductPricing.objects.get(product=product, is_current=True)
    except ProductPricing.DoesNotExist:
        raise ValidationError(f"Product {product.pk} has no current price set.")
    return pricing.retail_price


def _notify_admins(sale):
    admins = Employee.objects.filter(role=Employee.Role.ADMIN)
    NotificationLog.objects.bulk_create([
        NotificationLog(
            type="sale_alert", recipient=admin, related_sale=sale,
            status=NotificationLog.NotificationStatus.SENT,
        )
        for admin in admins
    ])


def complete_sale(customer, employee, payment_method, items):
    """items: list of {"product": Product instance, "quantity": int}"""
    if not items:
        raise ValidationError("Cannot complete a sale with no line items.")

    quantities = {}
    for entry in items:
        product_id = entry["product"].pk
        quantities[product_id] = quantities.get(product_id, 0) + entry["quantity"]

    with transaction.atomic():
        locked_inventories = {}
        for product_id in sorted(quantities):
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product_id=product_id, defaults={"quantity_in_stock": 0}
            )
            if inventory.quantity_in_stock < quantities[product_id]:
                raise ValidationError(
                    f"Insufficient stock for product {product_id}: "
                    f"requested {quantities[product_id]}, available {inventory.quantity_in_stock}."
                )
            locked_inventories[product_id] = inventory

        sale = Sale.objects.create(
            customer=customer, employee=employee, payment_method=payment_method,
            total_amount=Decimal("0.00"),
        )

        total = Decimal("0.00")
        for entry in items:
            product = entry["product"]
            quantity = entry["quantity"]
            unit_price = _resolve_retail_price(product)
            subtotal = unit_price * quantity
            SaleItem.objects.create(
                sale=sale, product=product, quantity=quantity,
                unit_price=unit_price, subtotal=subtotal,
            )
            total += subtotal

        sale.total_amount = total
        sale.save(update_fields=["total_amount"])

        for product_id, quantity in quantities.items():
            inventory = locked_inventories[product_id]
            inventory.quantity_in_stock -= quantity
            inventory.save(update_fields=["quantity_in_stock"])

        _notify_admins(sale)

    return sale
```

Note: `test_complete_sale_rejects_insufficient_stock` creates an `Inventory` row (stock=2) via the fixture before calling `complete_sale`; the insufficient-stock branch raises inside `transaction.atomic()`, which rolls back the whole transaction — the pre-existing `Inventory` row (created by the test fixture, not by `complete_sale`) survives unchanged at its original value, which is what the assertion checks. `test_complete_sale_product_never_stocked_is_insufficient` checks the opposite: no `Inventory` row exists going in, `get_or_create` would create one at `quantity_in_stock=0` inside the transaction, then the sufficiency check fails and raises, and the transaction rollback undoes that `INSERT` too — so no `Inventory` row exists afterward either.

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm web pytest sales/tests/test_services.py -v`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/sales/services.py backend/sales/tests/test_services.py
git commit -m "Add complete_sale service with ordered stock locking and admin notification fan-out"
```

---

### Task 2: `reverse_sale` service

**Files:**
- Modify: `backend/sales/services.py`
- Modify: `backend/sales/tests/test_services.py`

**Interfaces:**
- Consumes: `complete_sale` (Task 1, same file, used by these tests to set up a completed sale to reverse).
- Produces: `reverse_sale(sale, new_status) -> Sale`. Task 3's view layer calls this by this exact name/signature, passing `Sale.SaleStatus.RETURNED` or `Sale.SaleStatus.CANCELLED`.

- [ ] **Step 1: Write the failing tests — append to `backend/sales/tests/test_services.py`**

```python
from sales.services import reverse_sale


def test_reverse_sale_return_restores_stock_and_sets_status(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 3}],
    )
    assert Inventory.objects.get(product=product).quantity_in_stock == 7

    updated = reverse_sale(sale, Sale.SaleStatus.RETURNED)

    assert updated.status == Sale.SaleStatus.RETURNED
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_reverse_sale_cancel_restores_stock_and_sets_status(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 4}],
    )
    updated = reverse_sale(sale, Sale.SaleStatus.CANCELLED)
    assert updated.status == Sale.SaleStatus.CANCELLED
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_reverse_sale_multiline_restores_each_product(employee, admin, category):
    first = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    second = make_product_with_stock(category, "PES-AUD-00002", Decimal("50.00"), stock=5)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": first, "quantity": 2}, {"product": second, "quantity": 1}],
    )
    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    assert Inventory.objects.get(product=first).quantity_in_stock == 10
    assert Inventory.objects.get(product=second).quantity_in_stock == 5


def test_reverse_sale_rejects_non_completed_sale(employee, admin, category):
    product = make_product_with_stock(category, "PES-AUD-00001", Decimal("100.00"), stock=10)
    sale = complete_sale(
        customer=None, employee=employee, payment_method=Sale.PaymentMethod.CASH,
        items=[{"product": product, "quantity": 1}],
    )
    reverse_sale(sale, Sale.SaleStatus.RETURNED)
    with pytest.raises(ValidationError):
        reverse_sale(sale, Sale.SaleStatus.RETURNED)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest sales/tests/test_services.py -v`
Expected: FAIL — `ImportError: cannot import name 'reverse_sale'`.

- [ ] **Step 3: Append to `backend/sales/services.py`**

```python
def reverse_sale(sale, new_status):
    with transaction.atomic():
        locked_sale = Sale.objects.select_for_update().get(pk=sale.pk)
        if locked_sale.status != Sale.SaleStatus.COMPLETED:
            raise ValidationError("Only a completed sale can be returned or cancelled.")

        items = list(locked_sale.items.select_related("product").all())
        quantities = {}
        for item in items:
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.quantity

        for product_id in sorted(quantities):
            inventory, _ = Inventory.objects.select_for_update().get_or_create(
                product_id=product_id, defaults={"quantity_in_stock": 0}
            )
            inventory.quantity_in_stock += quantities[product_id]
            inventory.save(update_fields=["quantity_in_stock"])

        locked_sale.status = new_status
        locked_sale.save(update_fields=["status"])
    return locked_sale
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm web pytest sales/tests/test_services.py -v`
Expected: 12 passed (8 from Task 1 + 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/sales/services.py backend/sales/tests/test_services.py
git commit -m "Add reverse_sale service for returns and cancellations with locked stock restoration"
```

---

### Task 3: Serializers + `SaleViewSet` + URL wiring

**Files:**
- Modify: `backend/sales/serializers.py`
- Modify: `backend/sales/views.py`
- Modify: `backend/sales/urls.py`
- Create: `backend/sales/tests/test_sale_api.py`

**Interfaces:**
- Consumes: `complete_sale`, `reverse_sale` (Tasks 1-2, exact names/signatures above).
- Produces: `POST/GET /api/sales/`, `GET /api/sales/{id}/`, `POST /api/sales/{id}/return/`, `POST /api/sales/{id}/cancel/`.

- [ ] **Step 1: Write the failing tests — `backend/sales/tests/test_sale_api.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing
from sales.models import Customer, Sale
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
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")
    ProductPricing.objects.create(
        product=product, wholesale_price=Decimal("50.00"), retail_price=Decimal("100.00"),
        effective_date=date(2026, 1, 1), is_current=True,
    )
    Inventory.objects.create(product=product, quantity_in_stock=10)
    return product


def test_complete_sale_via_api(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 2}]},
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["total_amount"] == "200.00"
    assert body["status"] == "completed"
    assert len(body["items"]) == 1
    assert body["items"][0]["subtotal"] == "200.00"


def test_walk_in_sale_via_api(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["customer"] is None


def test_sale_with_customer_via_api(employee, admin, product):
    customer = Customer.objects.create(name="Jean Claude")
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {
            "customer": customer.customer_id, "payment_method": "cash",
            "items": [{"product": product.product_id, "quantity": 1}],
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["customer"] == customer.customer_id


def test_insufficient_stock_returns_400(employee, admin, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 99}]},
        format="json",
    )
    assert response.status_code == 400


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/sales/")
    assert response.status_code == 401


def test_patch_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.patch(f"/api/sales/{sale_id}/", {"payment_method": "card"}, format="json")
    assert response.status_code == 405


def test_put_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.put(f"/api/sales/{sale_id}/", {"payment_method": "card"}, format="json")
    assert response.status_code == 405


def test_delete_returns_405(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.delete(f"/api/sales/{sale_id}/")
    assert response.status_code == 405


def test_return_via_api_restores_inventory(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 3}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    assert Inventory.objects.get(product=product).quantity_in_stock == 7

    response = client.post(f"/api/sales/{sale_id}/return/")
    assert response.status_code == 200
    assert response.json()["status"] == "returned"
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_cancel_via_api_restores_inventory(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 2}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    response = client.post(f"/api/sales/{sale_id}/cancel/")
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert Inventory.objects.get(product=product).quantity_in_stock == 10


def test_return_twice_returns_400(employee, admin, product):
    client = auth_client(employee, "staffpass")
    create_response = client.post(
        "/api/sales/",
        {"payment_method": "cash", "items": [{"product": product.product_id, "quantity": 1}]},
        format="json",
    )
    sale_id = create_response.json()["sale_id"]
    client.post(f"/api/sales/{sale_id}/return/")
    second_response = client.post(f"/api/sales/{sale_id}/return/")
    assert second_response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest sales/tests/test_sale_api.py -v`
Expected: FAIL — `/api/sales/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/sales/serializers.py`**

```python
from catalog.models import Product
from sales.models import Sale, SaleItem


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = ["sale_item_id", "sale", "product", "quantity", "unit_price", "subtotal"]
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "sale_id", "customer", "employee", "sale_date", "payment_method",
            "total_amount", "status", "items",
        ]
        read_only_fields = ["sale_id", "employee", "sale_date", "total_amount", "status", "items"]


class SaleItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class CreateSaleSerializer(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(), required=False, allow_null=True
    )
    payment_method = serializers.ChoiceField(
        choices=Sale.PaymentMethod.choices, required=False, allow_null=True
    )
    items = SaleItemInputSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one line item is required.")
        return value
```

(`serializers` is already imported at the top of the file for `CustomerSerializer`; `Customer` is already imported via `from sales.models import Customer` — add `Sale`, `SaleItem` to that same import line or a new one, and add the new `from catalog.models import Product` import. Don't duplicate existing imports.)

- [ ] **Step 4: Append to `backend/sales/views.py`**

```python
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status as http_status

from sales.models import Sale
from sales.serializers import SaleSerializer, CreateSaleSerializer
from sales.services import complete_sale, reverse_sale


class SaleViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "head", "options"]
    queryset = Sale.objects.all().order_by("-sale_date").prefetch_related("items")
    serializer_class = SaleSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        input_serializer = CreateSaleSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data
        sale = complete_sale(
            customer=data.get("customer"),
            employee=request.user,
            payment_method=data.get("payment_method"),
            items=data["items"],
        )
        return Response(
            SaleSerializer(sale, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="return")
    def return_action(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.RETURNED)
        return Response(SaleSerializer(updated, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        updated = reverse_sale(sale, Sale.SaleStatus.CANCELLED)
        return Response(SaleSerializer(updated, context={"request": request}).data)
```

(`viewsets` and `IsAuthenticated` are already imported at the top of the file for `CustomerViewSet` — don't duplicate those imports, just add the new names above. Note: `http_method_names = [...]` on the ViewSet blocks `PUT`/`PATCH`/`DELETE` at DRF's `dispatch()` level, before routing to any handler, INCLUDING custom `@action`s — but since neither `return_action` nor `cancel` use those methods (both are `POST`), this is safe and doesn't need the `destroy()`/`update()` override workaround Phase 2 needed for its item-delete action.)

- [ ] **Step 5: Modify `backend/sales/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from sales.views import CustomerViewSet, SaleViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")
router.register("sales", SaleViewSet, basename="sale")

urlpatterns = router.urls
```

No `config/urls.py` change needed — `sales.urls` is already included there from Phase 1.

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose run --rm web pytest sales/tests/test_sale_api.py -v`
Expected: 11 passed.

- [ ] **Step 7: Run the full sales suite, then the full project suite, to confirm no regressions**

```bash
docker compose run --rm web pytest sales/ -v
docker compose run --rm web pytest -v
```
Expected: `sales/` shows 26 passed (3 existing customer API + 3 existing model tests + 12 service + 11 API — actual arithmetic may differ slightly, report the real number). Full suite shows roughly 120 passed (97 from Phases 1-2 + this app's new tests) — report the actual numbers; if they differ from this estimate, that's fine as long as everything passes and the difference is understood.

- [ ] **Step 8: Commit**

```bash
git add backend/sales/
git commit -m "Add SaleViewSet with create/return/cancel actions and URL wiring"
```

---

### Task 4: Final integration check

**Files:**
- Modify: `backend/README.md`
- No other source files modified (verification-only task, plus the README update).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: a documented, verified, fully-passing Phase 3 sales API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phases 1-2 plus this plan's sales tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with no output. No model fields changed anywhere in this plan, so this should already be clean.

- [ ] **Step 3: Update `backend/README.md`'s endpoint list**

Add a "Sales / POS (Phase 3)" subsection alongside the existing "Purchasing (Phase 2)" one, listing: `POST/GET /api/sales/`, `GET /api/sales/{id}/`, `POST /api/sales/{id}/return/`, `POST /api/sales/{id}/cancel/` (note explicitly: no PATCH/PUT/DELETE — sales are immutable once created). Update the existing schema-only note: sales now has a working API; only stock/equipment and the admin dashboard remain schema-only. Note that `notifications.NotificationLog` itself still has no directly-exposed API — this phase only writes to it internally as a side effect of completing a sale.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 3 sales endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase (all confirmed correct, zero corrections needed):**
- `backend/sales/models.py` — `Sale` fields (`sale_id`, `customer`, `employee`, `sale_date`, `payment_method`, `total_amount`, `status`, `PaymentMethod`/`SaleStatus` TextChoices) and `SaleItem` fields (`sale_item_id`, `sale`, `product`, `quantity`, `unit_price`, `subtotal`) match exactly what this plan assumes — no model changes needed anywhere in this plan.
- `backend/stock/models.py` — `Inventory.product`/`quantity_in_stock` field names match exactly.
- `backend/sales/serializers.py` — existing `CustomerSerializer` and its imports (`serializers`, `Customer`) confirmed; new classes are additive.
- `backend/sales/views.py` — existing `CustomerViewSet` and its imports (`viewsets`, `IsAuthenticated`) confirmed; new `SaleViewSet` is additive.
- `backend/sales/urls.py` — existing `customers` router registration confirmed; `sales` registration is additive.
- `backend/config/urls.py` already includes `path("api/", include("sales.urls"))` from Phase 1 — no `config/urls.py` change needed anywhere in this plan.
- `notifications.models.NotificationLog` fields (`type`, `recipient`, `related_sale`, `status`, `NotificationStatus` TextChoices) confirmed to match Task 1's `_notify_admins` usage.

**Spec coverage:** No draft/held state (Decision 1) → Task 3's single `create()` override, no separate add-item/draft actions. Log-only admin notification (Decision 2) → Task 1's `_notify_admins`. Returns/cancellations restore stock (Decision 3) → Task 2. Insufficient stock blocks the sale (Decision 4) → Task 1's sufficiency check before any writes, tested explicitly for the multi-line partial-insufficiency case. Server-resolved prices (Decision 5) → Task 1's `_resolve_retail_price`. RBAC/no masking (Decision 6) → `IsAuthenticated` only throughout Task 3, no `to_representation` override needed. Sale immutability (Decision 7) → Task 3's `http_method_names` restriction, tested for all three blocked methods. No discount (Decision 8) → absent from every serializer/model field in this plan, matching the existing schema. Locking discipline (consistent product-ID order, Sale-row lock in `reverse_sale`) → Tasks 1 and 2 respectively. Data flow example → exercised end-to-end by Task 3's API tests. Error handling → 400s tested throughout Tasks 1-3, 401 tested in Task 3, 404 is DRF's default `get_object_or_404` behavior via `self.get_object()`, not separately implemented. Every named testing scenario in the spec's Testing section → present across Tasks 1-3. Out-of-scope items (real email/Celery, discount, partial-line returns, frontend, other phases) → correctly absent from every task.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.

**Type/signature consistency:** `complete_sale(customer, employee, payment_method, items)` (Task 1) is called identically in Task 1's own tests, Task 2's setup fixtures (via the same test file), and Task 3's view (`create()`). `reverse_sale(sale, new_status)` (Task 2) is called identically in Task 2's own tests and Task 3's view (both `return_action` and `cancel`, passing `Sale.SaleStatus.RETURNED`/`CANCELLED`). `_resolve_retail_price(product)` and `_notify_admins(sale)` are private, used only within `services.py` itself, referenced consistently.

**Test count arithmetic:** stated inline at each checkpoint as sanity checks, not hard requirements — Task 4 explicitly instructs reporting the real final count rather than forcing a match to the estimate, following the same pattern Phase 1 and Phase 2's plans used successfully.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
