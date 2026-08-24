# Phase 4: Stock & Equipment Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the stock/equipment API — reading and lightly editing aggregate stock (`Inventory`), and full registration/read/update plus an audited status-change workflow for serialized equipment (`EquipmentUnit`/`EquipmentStatusHistory`).

**Architecture:** New `stock/serializers.py`, `stock/views.py`, `stock/urls.py`, `stock/services.py` on top of Phase 1's schema-only models. `Inventory` and `EquipmentUnit` stay intentionally independent — no automatic sync between them. `EquipmentUnit.status` is only ever changed through one dedicated, audited action (never a generic PATCH), mirroring the "protected identifier fields" pattern already established for `Product.barcode` and `Purchase`/`Sale` immutability. History nests in the unit's detail response from the start.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-phase4-stock-equipment-design.md`

## Global Constraints

- Every model uses an explicit `<name>_id` `AutoField` primary key — already true for `Inventory.inventory_id`, `EquipmentUnit.unit_id`, `EquipmentStatusHistory.history_id`; no model changes anywhere in this plan.
- Tests use `pytest-django` + DRF's `APIClient` — never Django's `TestCase`/`manage.py test`.
- All new endpoints are `IsAuthenticated` only — no admin gate.
- `Inventory.quantity_in_stock`/`quantity_in_use`/`quantity_damaged` are never directly editable via the API — always derived from purchase/sale transactions (Phases 2-3). Only `storage_location` is `PATCH`-able on `Inventory`.
- `EquipmentUnit.status` and `serial_number` are never editable via generic `PATCH`/`PUT` — `serial_number` is immutable once set (server-generated-identifier principle, same as `Product.barcode`); `status` changes ONLY through the dedicated `change-status` action, which always requires a `reason` and writes an `EquipmentStatusHistory` row.
- `Inventory` and `EquipmentUnit` remain intentionally unsynced — no code path in this plan updates `Inventory` counts as a side effect of an equipment status change, or vice versa.
- Every task ends with a real, specific `git commit` message.
- Tests run via `docker compose run --rm web pytest ...`.
- No migrations are needed anywhere in this plan — no model fields change.

---

### Task 1: Inventory API

**Files:**
- Create: `backend/stock/serializers.py` (Inventory-related classes only in this task; equipment classes added in Task 2)
- Create: `backend/stock/views.py` (`InventoryViewSet` only in this task)
- Create: `backend/stock/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/stock/tests/test_inventory_api.py`

**Interfaces:**
- Consumes: `stock.models.Inventory` (Phase 1, unchanged), `catalog.models.Product.reorder_level` (Phase 1).
- Produces: `GET/PATCH /api/inventory/{id}/`, `GET /api/inventory/`. `InventorySerializer` (used again nowhere else in this plan — self-contained).

- [ ] **Step 1: Write the failing tests — `backend/stock/tests/test_inventory_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
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
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(
        category=category, barcode="PES-AUD-00001", name="Speaker", reorder_level=5,
    )


def test_list_inventory(employee, product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.get("/api/inventory/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_retrieve_inventory_includes_is_low_stock_false(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 200
    assert response.json()["is_low_stock"] is False


def test_retrieve_inventory_includes_is_low_stock_true(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=3)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 200
    assert response.json()["is_low_stock"] is True


def test_low_stock_filter(employee, category):
    low_product = Product.objects.create(
        category=category, barcode="PES-AUD-00002", name="Low Item", reorder_level=5,
    )
    ok_product = Product.objects.create(
        category=category, barcode="PES-AUD-00003", name="OK Item", reorder_level=5,
    )
    Inventory.objects.create(product=low_product, quantity_in_stock=2)
    Inventory.objects.create(product=ok_product, quantity_in_stock=50)
    client = auth_client(employee, "staffpass")
    response = client.get("/api/inventory/?low_stock=true")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["product"] == low_product.product_id


def test_patch_storage_location_succeeds(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/inventory/{inventory.inventory_id}/", {"storage_location": "Shelf B2"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["storage_location"] == "Shelf B2"
    inventory.refresh_from_db()
    assert inventory.storage_location == "Shelf B2"


def test_patch_quantity_is_ignored(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/inventory/{inventory.inventory_id}/", {"quantity_in_stock": 999}, format="json"
    )
    assert response.status_code == 200
    inventory.refresh_from_db()
    assert inventory.quantity_in_stock == 10


def test_post_returns_405(employee, product):
    client = auth_client(employee, "staffpass")
    response = client.post("/api/inventory/", {"product": product.product_id}, format="json")
    assert response.status_code == 405


def test_delete_returns_405(employee, product):
    inventory = Inventory.objects.create(product=product, quantity_in_stock=10)
    client = auth_client(employee, "staffpass")
    response = client.delete(f"/api/inventory/{inventory.inventory_id}/")
    assert response.status_code == 405


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/inventory/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest stock/tests/test_inventory_api.py -v`
Expected: FAIL — `/api/inventory/` returns 404 (not yet routed).

- [ ] **Step 3: Write `backend/stock/serializers.py`**

```python
from django.db.models import F
from rest_framework import serializers

from stock.models import Inventory


class InventorySerializer(serializers.ModelSerializer):
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            "inventory_id", "product", "quantity_in_stock", "quantity_in_use",
            "quantity_damaged", "storage_location", "last_updated", "is_low_stock",
        ]
        read_only_fields = [
            "inventory_id", "product", "quantity_in_stock", "quantity_in_use",
            "quantity_damaged", "last_updated", "is_low_stock",
        ]

    def get_is_low_stock(self, obj):
        return obj.quantity_in_stock <= obj.product.reorder_level
```

(`F` is used in `views.py`'s queryset filter, not here — imported here only if you choose to compute `is_low_stock` via annotation instead of the method above; the method-based approach shown does not need `F` in this file. Do not import it here if unused — the brief's `views.py` step below is where `F` is actually needed.)

- [ ] **Step 4: Write `backend/stock/views.py`**

```python
from django.db.models import F
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from stock.models import Inventory
from stock.serializers import InventorySerializer


class InventoryViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "patch", "head", "options"]
    serializer_class = InventorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Inventory.objects.all().select_related("product").order_by("inventory_id")
        if self.request.query_params.get("low_stock") == "true":
            queryset = queryset.filter(quantity_in_stock__lte=F("product__reorder_level"))
        return queryset
```

- [ ] **Step 5: Write `backend/stock/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from stock.views import InventoryViewSet

router = DefaultRouter()
router.register("inventory", InventoryViewSet, basename="inventory")

urlpatterns = router.urls
```

- [ ] **Step 6: Modify `backend/config/urls.py`** — add `path("api/", include("stock.urls")),` to the `urlpatterns` list alongside the existing includes (`core.urls`, `accounts.urls`, `catalog.urls`, `purchasing.urls`, `sales.urls`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose run --rm web pytest stock/tests/test_inventory_api.py -v`
Expected: 9 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/stock/serializers.py backend/stock/views.py backend/stock/urls.py backend/stock/tests/test_inventory_api.py backend/config/urls.py
git commit -m "Add read-only Inventory API with storage_location PATCH and low-stock filter"
```

---

### Task 2: EquipmentUnit registration, read, and limited update

**Files:**
- Modify: `backend/stock/serializers.py` (add equipment classes)
- Modify: `backend/stock/views.py` (add `EquipmentUnitViewSet`)
- Modify: `backend/stock/urls.py`
- Create: `backend/stock/tests/test_equipment_unit_api.py`

**Interfaces:**
- Consumes: `stock.models.EquipmentUnit`/`EquipmentStatusHistory` (Phase 1, unchanged).
- Produces: `POST/GET /api/equipment-units/`, `GET/PATCH /api/equipment-units/{id}/`. `EquipmentUnitSerializer` (full representation, nested `status_history`) and `EquipmentStatusHistorySerializer` — Task 3's `change-status` action reuses `EquipmentUnitSerializer` for its response.

- [ ] **Step 1: Write the failing tests — `backend/stock/tests/test_equipment_unit_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import EquipmentUnit

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
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


def test_register_equipment_unit(employee, product):
    client = auth_client(employee, "staffpass")
    response = client.post(
        "/api/equipment-units/",
        {
            "product": product.product_id, "serial_number": "SPK-0001",
            "status": "in_stock", "storage_location": "Shelf A1",
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["serial_number"] == "SPK-0001"
    assert body["status_history"] == []


def test_list_filtered_by_product(employee, product, category):
    other_product = Product.objects.create(category=category, barcode="PES-AUD-00002", name="Mic")
    EquipmentUnit.objects.create(product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=other_product, serial_number="B1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    client = auth_client(employee, "staffpass")
    response = client.get(f"/api/equipment-units/?product={product.product_id}")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["serial_number"] == "A1"


def test_patch_storage_location_and_condition_notes(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/",
        {"storage_location": "Shelf C3", "condition_notes": "Minor scuff"},
        format="json",
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.storage_location == "Shelf C3"
    assert unit.condition_notes == "Minor scuff"


def test_patch_status_is_ignored(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/", {"status": "sold"}, format="json"
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.status == EquipmentUnit.UnitStatus.IN_STOCK


def test_patch_serial_number_is_ignored(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.patch(
        f"/api/equipment-units/{unit.unit_id}/", {"serial_number": "HACKED"}, format="json"
    )
    assert response.status_code == 200
    unit.refresh_from_db()
    assert unit.serial_number == "A1"


def test_delete_returns_405(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.delete(f"/api/equipment-units/{unit.unit_id}/")
    assert response.status_code == 405


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/equipment-units/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest stock/tests/test_equipment_unit_api.py -v`
Expected: FAIL — `/api/equipment-units/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/stock/serializers.py`**

```python
from stock.models import EquipmentUnit, EquipmentStatusHistory


class EquipmentStatusHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentStatusHistory
        fields = ["history_id", "previous_status", "new_status", "changed_by", "change_date", "notes"]
        read_only_fields = fields


class EquipmentUnitSerializer(serializers.ModelSerializer):
    status_history = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentUnit
        fields = [
            "unit_id", "product", "serial_number", "status", "assigned_to",
            "storage_location", "condition_notes", "status_changed_at", "status_history",
        ]
        read_only_fields = ["unit_id", "status", "status_changed_at", "status_history"]

    def get_status_history(self, obj):
        history = obj.status_history.order_by("-change_date")
        return EquipmentStatusHistorySerializer(history, many=True).data


class EquipmentUnitUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentUnit
        fields = ["storage_location", "condition_notes", "assigned_to"]
```

(`serializers` and `Inventory` are already imported at the top of the file from Task 1 — add `from stock.models import EquipmentUnit, EquipmentStatusHistory` as a new import line, don't duplicate `serializers`.)

- [ ] **Step 4: Append to `backend/stock/views.py`**

```python
from stock.models import EquipmentUnit
from stock.serializers import EquipmentUnitSerializer, EquipmentUnitUpdateSerializer


class EquipmentUnitViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = EquipmentUnit.objects.all().order_by("unit_id")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return EquipmentUnitUpdateSerializer
        return EquipmentUnitSerializer
```

(`viewsets` and `IsAuthenticated` are already imported at the top of the file from Task 1 — don't duplicate.)

- [ ] **Step 5: Modify `backend/stock/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from stock.views import InventoryViewSet, EquipmentUnitViewSet

router = DefaultRouter()
router.register("inventory", InventoryViewSet, basename="inventory")
router.register("equipment-units", EquipmentUnitViewSet, basename="equipment-unit")

urlpatterns = router.urls
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose run --rm web pytest stock/tests/test_equipment_unit_api.py -v`
Expected: 7 passed.

- [ ] **Step 7: Run the full stock suite to confirm no regressions**

Run: `docker compose run --rm web pytest stock/ -v`
Expected: 19 passed (3 existing model tests + 9 inventory API + 7 equipment unit API).

- [ ] **Step 8: Commit**

```bash
git add backend/stock/
git commit -m "Add EquipmentUnit registration, read, and limited-field update API"
```

---

### Task 3: Audited equipment status-change service and action

**Files:**
- Create: `backend/stock/services.py`
- Modify: `backend/stock/serializers.py` (add `ChangeStatusSerializer`)
- Modify: `backend/stock/views.py` (add the `change-status` action)
- Create: `backend/stock/tests/test_services.py`
- Modify: `backend/stock/tests/test_equipment_unit_api.py`

**Interfaces:**
- Consumes: `stock.models.EquipmentUnit`/`EquipmentStatusHistory` (Phase 1), `EquipmentUnitSerializer` (Task 2, for the action's response).
- Produces: `change_equipment_status(unit, new_status, reason, changed_by, assigned_to=None) -> EquipmentUnit`. `POST /api/equipment-units/{id}/change-status/`.

- [ ] **Step 1: Write the failing tests — `backend/stock/tests/test_services.py`**

```python
import pytest
from datetime import date
from rest_framework.exceptions import ValidationError
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import EquipmentUnit, EquipmentStatusHistory, Inventory
from stock.services import change_equipment_status

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


@pytest.fixture
def product(category):
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="Speaker")


@pytest.fixture
def unit(product):
    return EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )


def test_change_status_writes_history_and_updates_unit(unit, employee):
    updated = change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR,
        reason="Speaker rattling", changed_by=employee,
    )
    assert updated.status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    history = EquipmentStatusHistory.objects.get(unit=unit)
    assert history.previous_status == EquipmentUnit.UnitStatus.IN_STOCK
    assert history.new_status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    assert history.changed_by == employee
    assert history.notes == "Speaker rattling"


def test_change_status_sets_assigned_to_when_given(unit, employee):
    other_employee = Employee.objects.create_user(
        username="tech1", password="techpass", full_name="Tech One",
        hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
    )
    updated = change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.IN_USE,
        reason="Demo loan", changed_by=employee, assigned_to=other_employee,
    )
    assert updated.assigned_to == other_employee


def test_change_status_rejects_invalid_status(unit, employee):
    with pytest.raises(ValidationError):
        change_equipment_status(
            unit, new_status="not_a_real_status", reason="test", changed_by=employee,
        )


def test_change_status_rejects_missing_reason(unit, employee):
    with pytest.raises(ValidationError):
        change_equipment_status(
            unit, new_status=EquipmentUnit.UnitStatus.DAMAGED, reason="", changed_by=employee,
        )


def test_change_status_does_not_touch_inventory(unit, employee, product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.SOLD, reason="Sold at counter", changed_by=employee,
    )
    inventory = Inventory.objects.get(product=product)
    assert inventory.quantity_in_stock == 10


def test_multiple_status_changes_build_a_chain(unit, employee):
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR, reason="Rattle", changed_by=employee,
    )
    change_equipment_status(
        unit, new_status=EquipmentUnit.UnitStatus.IN_STOCK, reason="Fixed", changed_by=employee,
    )
    assert EquipmentStatusHistory.objects.filter(unit=unit).count() == 2
    latest = EquipmentStatusHistory.objects.filter(unit=unit).order_by("-change_date").first()
    assert latest.previous_status == EquipmentUnit.UnitStatus.UNDER_REPAIR
    assert latest.new_status == EquipmentUnit.UnitStatus.IN_STOCK
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest stock/tests/test_services.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'stock.services'`.

- [ ] **Step 3: Write `backend/stock/services.py`**

```python
from django.db import transaction
from rest_framework.exceptions import ValidationError

from stock.models import EquipmentUnit, EquipmentStatusHistory

VALID_STATUSES = {choice[0] for choice in EquipmentUnit.UnitStatus.choices}


def change_equipment_status(unit, new_status, reason, changed_by, assigned_to=None):
    if new_status not in VALID_STATUSES:
        raise ValidationError(f"Invalid status: {new_status}")
    if not reason:
        raise ValidationError({"reason": "A reason is required when changing equipment status."})

    with transaction.atomic():
        locked_unit = EquipmentUnit.objects.select_for_update().get(pk=unit.pk)
        previous_status = locked_unit.status

        EquipmentStatusHistory.objects.create(
            unit=locked_unit, previous_status=previous_status, new_status=new_status,
            changed_by=changed_by, notes=reason,
        )

        locked_unit.status = new_status
        update_fields = ["status", "status_changed_at"]
        if assigned_to is not None:
            locked_unit.assigned_to = assigned_to
            update_fields.append("assigned_to")
        locked_unit.save(update_fields=update_fields)

    return locked_unit
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm web pytest stock/tests/test_services.py -v`
Expected: 6 passed.

- [ ] **Step 5: Write the failing API test — append to `backend/stock/tests/test_equipment_unit_api.py`**

```python
from stock.services import change_equipment_status


def test_change_status_via_api_and_history_nests(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "under_repair", "reason": "Speaker rattling"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "under_repair"
    assert len(body["status_history"]) == 1
    assert body["status_history"][0]["previous_status"] == "in_stock"
    assert body["status_history"][0]["new_status"] == "under_repair"


def test_change_status_missing_reason_returns_400(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "under_repair"},
        format="json",
    )
    assert response.status_code == 400


def test_change_status_invalid_status_returns_400(employee, product):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK,
    )
    client = auth_client(employee, "staffpass")
    response = client.post(
        f"/api/equipment-units/{unit.unit_id}/change-status/",
        {"new_status": "not_real", "reason": "test"},
        format="json",
    )
    assert response.status_code == 400
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `docker compose run --rm web pytest stock/tests/test_equipment_unit_api.py -v`
Expected: FAIL — `change-status` action returns 404 (not yet wired).

- [ ] **Step 7: Append to `backend/stock/serializers.py`**

```python
from accounts.models import Employee


class ChangeStatusSerializer(serializers.Serializer):
    new_status = serializers.ChoiceField(choices=EquipmentUnit.UnitStatus.choices)
    reason = serializers.CharField()
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=Employee.objects.all(), required=False, allow_null=True
    )
```

- [ ] **Step 8: Append to `backend/stock/views.py`**

```python
from rest_framework.decorators import action
from rest_framework.response import Response

from stock.serializers import ChangeStatusSerializer
from stock.services import change_equipment_status
```

Add this method inside the existing `EquipmentUnitViewSet` class (from Task 2), alongside `get_queryset`/`get_serializer_class`:

```python
    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        unit = self.get_object()
        serializer = ChangeStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        updated = change_equipment_status(
            unit, new_status=data["new_status"], reason=data["reason"],
            changed_by=request.user, assigned_to=data.get("assigned_to"),
        )
        return Response(EquipmentUnitSerializer(updated, context={"request": request}).data)
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `docker compose run --rm web pytest stock/tests/test_equipment_unit_api.py -v`
Expected: 10 passed (7 from Task 2 + 3 new).

- [ ] **Step 10: Run the full stock suite, then the full project suite, to confirm no regressions**

```bash
docker compose run --rm web pytest stock/ -v
docker compose run --rm web pytest -v
```
Expected: `stock/` shows 28 passed (19 from Task 2's checkpoint + 6 service + 3 API — report the actual number honestly if it differs). Full suite shows roughly 135 passed (126 from Phases 1-3 + this app's new tests) — report the actual numbers.

- [ ] **Step 11: Commit**

```bash
git add backend/stock/
git commit -m "Add audited equipment status-change service and change-status action"
```

---

### Task 4: Final integration check

**Files:**
- Modify: `backend/README.md`
- No other source files modified (verification-only task, plus the README update).

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: a documented, verified, fully-passing Phase 4 stock/equipment API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phases 1-3 plus this plan's stock tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with informational "No changes detected" output. No model fields changed anywhere in this plan.

- [ ] **Step 3: Update `backend/README.md`'s endpoint list**

Add a "Stock & Equipment (Phase 4)" subsection alongside the existing Purchasing/Sales ones, listing: `GET/PATCH /api/inventory/{id}/`, `GET /api/inventory/` (with the `?low_stock=true` filter noted), `POST/GET /api/equipment-units/`, `GET/PATCH /api/equipment-units/{id}/`, `POST /api/equipment-units/{id}/change-status/`. Note explicitly: `Inventory` quantities are never directly editable (only `storage_location`); `EquipmentUnit.status`/`serial_number` are never editable via `PATCH` (status changes only via the dedicated action). Update the schema-only note: only the admin dashboard and `notifications.NotificationLog`'s own direct API remain unbuilt.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 4 stock/equipment endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase (all confirmed correct, zero corrections needed):**
- `backend/stock/models.py` — `Inventory` fields (`inventory_id`, `product` OneToOneField, `quantity_in_stock`/`in_use`/`damaged`, `storage_location`, `last_updated`), `EquipmentUnit` fields (`unit_id`, `product`, `serial_number`, `status`, `UnitStatus` TextChoices, `assigned_to`, `storage_location`, `condition_notes`, `status_changed_at`), and `EquipmentStatusHistory` fields (`history_id`, `unit`, `previous_status`, `new_status`, `changed_by`, `change_date`, `notes`) all match exactly what this plan assumes — no model changes needed anywhere in this plan.
- `backend/stock/admin.py` already registers all three models (from Phase 1 Task 12) — no admin.py change needed.
- `backend/config/urls.py` does NOT yet include `stock.urls` (confirmed — Phase 1's Task 12 was schema-only) — Task 1's Step 6 is a real, necessary addition, not a mechanical no-op like some prior phases' equivalent steps.
- `backend/stock/tests/test_models.py`'s existing 3 tests and fixture style (`employee`, `product` fixtures, `pytestmark = pytest.mark.django_db`) confirmed and replicated in every new test file in this plan.
- `catalog.models.Product.reorder_level` (used by `is_low_stock`) confirmed present with a `default=5` from Phase 1.
- `accounts.models.Employee` confirmed as the FK target for `EquipmentUnit.assigned_to`/`EquipmentStatusHistory.changed_by` and `ChangeStatusSerializer.assigned_to`.

**Spec coverage:** Decision 1 (Inventory/EquipmentUnit independence) → Task 3's `test_change_status_does_not_touch_inventory`, explicitly asserting the independence rather than just never happening to test it. Decision 2 (storage_location-only Inventory edits) → Task 1's `InventorySerializer.read_only_fields` and its ignored-quantity test. Decision 3 (status/serial_number protected, other fields PATCH-able) → Task 2's `EquipmentUnitUpdateSerializer` (only 3 fields) and its ignored-status/ignored-serial_number tests, Task 3's dedicated action as the only status-change path. Decision 4 (reason always required) → Task 3's `_reason` validation and its missing-reason tests at both service and API level. Decision 5 (no admin gate) → `IsAuthenticated` only throughout, no role checks anywhere in this plan. Decision 6 (history nests from the start) → Task 2's `EquipmentUnitSerializer.status_history` field, present from its first commit, not retrofitted. API design section → every listed endpoint has a corresponding task (Inventory list/retrieve/patch → Task 1; equipment register/list/retrieve/patch → Task 2; change-status → Task 3). Data flow example → exercised end-to-end by Task 3's API test. Error handling → 400s tested throughout Task 3, 401 tested in Tasks 1-2, 404 is DRF's default `get_object_or_404` via `self.get_object()`, not separately implemented. Testing section's every named scenario → present across Tasks 1-3. Out-of-scope items (Inventory/EquipmentUnit sync, manual quantity adjustment, serial-linked sales, the `?serialized=true` filter, dashboard, frontend) → correctly absent from every task; the `?serialized=true` filter was explicitly marked optional in the spec and is not included in this plan — acceptable per the spec's own "not a hard requirement" framing.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.

**Type/signature consistency:** `change_equipment_status(unit, new_status, reason, changed_by, assigned_to=None)` (Task 3) is called identically in Task 3's own service tests and its own view action. `EquipmentUnitSerializer`/`EquipmentUnitUpdateSerializer`/`EquipmentStatusHistorySerializer`/`ChangeStatusSerializer` (Task 2/3) are referenced with matching names everywhere. `InventorySerializer` (Task 1) is self-contained, not referenced elsewhere.

**Test count arithmetic:** stated inline at each checkpoint as sanity checks, not hard requirements — Task 4 explicitly instructs reporting the real final count rather than forcing a match to the estimate, following the pattern every prior phase's plan used successfully.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
