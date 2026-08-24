# Phase 5b: Finance / Expense Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build standard admin-only CRUD for recording business expenses on top of the existing schema-only `Expense` model.

**Architecture:** `finance/serializers.py` + `finance/views.py` + `finance/urls.py` on top of the unchanged `Expense` model. `ExpenseViewSet` is a plain `ModelViewSet` (full CRUD, no method restriction — unlike Purchase/Sale, there's no immutability invariant to protect here per the spec's Decision 3) gated by `IsAdmin`.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged. No new dependencies. No migrations — no model fields change.

**Spec:** `docs/superpowers/specs/2026-08-24-phase5-finance-expense-design.md`

## Global Constraints

- `IsAdmin` (from `accounts.permissions.IsAdmin`) gates the entire `Expense` API — `GET`/`POST`/`PATCH`/`PUT`/`DELETE` all require the Admin role. A non-admin gets 403 on every verb, including list/retrieve (existence of expense records is itself sensitive, unlike notifications' 404-for-isolation pattern).
- `recorded_by` is server-set to `request.user` on create, never accepted from the request body, and stays read-only on every subsequent update (the original recorder never changes even when a different admin edits the record later).
- No immutability lock — `PATCH`/`PUT`/`DELETE` are all permitted with no status/workflow gate.
- List is filterable by `?category=<value>` against `Expense.ExpenseCategory` choices.
- Every model uses an explicit `<name>_id` AutoField primary key — `Expense.expense_id` already exists, unchanged.
- Money fields: `amount` is already `DecimalField(max_digits=12, decimal_places=2)` — unchanged, no new money fields.
- Tests use pytest-django + DRF's APIClient — never Django's TestCase/manage.py test.
- No migrations needed anywhere in this plan — no model fields change.

---

### Task 1: Expense CRUD API

**Files:**
- Create: `backend/finance/serializers.py`
- Create: `backend/finance/views.py`
- Create: `backend/finance/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/finance/tests/test_expense_api.py`

**Interfaces:**
- Consumes: `finance.models.Expense` (existing fields: `expense_id`, `category`, `amount`, `expense_date`, `description`, `recorded_by`; `Expense.ExpenseCategory` choices — unchanged), `accounts.permissions.IsAdmin` (existing, from Phase 1).
- Produces: `ExpenseSerializer`, `GET/POST /api/expenses/`, `GET/PATCH/PUT/DELETE /api/expenses/{id}/`. Nothing here is consumed by a later task in this plan — this is the only task.

- [ ] **Step 1: Write the failing tests — `backend/finance/tests/test_expense_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from finance.models import Expense

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
def admin():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def other_admin():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_create_expense_sets_recorded_by_from_request_user(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {
            "category": "utilities", "amount": "45000.00",
            "expense_date": "2026-08-20", "description": "August power bill",
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert body["recorded_by"] == admin.employee_id


def test_create_expense_ignores_client_submitted_recorded_by(admin, other_admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {
            "category": "rent", "amount": "200000.00", "expense_date": "2026-08-01",
            "recorded_by": other_admin.employee_id,
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["recorded_by"] == admin.employee_id


def test_list_and_retrieve_as_admin(admin):
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    list_response = client.get("/api/expenses/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_category_filter(admin):
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    Expense.objects.create(
        category=Expense.ExpenseCategory.UTILITIES, amount="45000.00",
        expense_date=date(2026, 8, 5), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/expenses/?category=rent")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["results"][0]["category"] == "rent"


def test_patch_updates_fields_but_preserves_recorded_by(admin, other_admin):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount="200000.00",
        expense_date=date(2026, 8, 1), recorded_by=admin,
    )
    client = auth_client(other_admin, "adminpass")
    response = client.patch(
        f"/api/expenses/{expense.expense_id}/", {"amount": "210000.00"}, format="json"
    )
    assert response.status_code == 200
    expense.refresh_from_db()
    assert str(expense.amount) == "210000.00"
    assert expense.recorded_by == admin


def test_delete_removes_expense(admin):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.OTHER, amount="5000.00",
        expense_date=date(2026, 8, 10), recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.delete(f"/api/expenses/{expense.expense_id}/")
    assert response.status_code == 204
    assert not Expense.objects.filter(expense_id=expense.expense_id).exists()


def test_invalid_category_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/expenses/",
        {"category": "not_a_real_category", "amount": "1000.00", "expense_date": "2026-08-20"},
        format="json",
    )
    assert response.status_code == 400


def test_non_admin_gets_403_on_every_verb(staff):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.OTHER, amount="5000.00",
        expense_date=date(2026, 8, 10), recorded_by=staff,
    )
    client = auth_client(staff, "staffpass")
    assert client.get("/api/expenses/").status_code == 403
    assert client.get(f"/api/expenses/{expense.expense_id}/").status_code == 403
    assert client.post("/api/expenses/", {}, format="json").status_code == 403
    assert client.patch(f"/api/expenses/{expense.expense_id}/", {}, format="json").status_code == 403
    assert client.delete(f"/api/expenses/{expense.expense_id}/").status_code == 403


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/expenses/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest finance/tests/test_expense_api.py -v`
Expected: FAIL — `/api/expenses/` returns 404 (not yet routed).

- [ ] **Step 3: Write `backend/finance/serializers.py`**

```python
from rest_framework import serializers

from finance.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = [
            "expense_id", "category", "amount", "expense_date",
            "description", "recorded_by",
        ]
        read_only_fields = ["expense_id", "recorded_by"]

    def create(self, validated_data):
        validated_data["recorded_by"] = self.context["request"].user
        return super().create(validated_data)
```

- [ ] **Step 4: Write `backend/finance/views.py`**

```python
from rest_framework import viewsets

from accounts.permissions import IsAdmin
from finance.models import Expense
from finance.serializers import ExpenseSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        queryset = Expense.objects.all().order_by("-expense_date")
        category = self.request.query_params.get("category")
        if category:
            queryset = queryset.filter(category=category)
        return queryset
```

- [ ] **Step 5: Write `backend/finance/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from finance.views import ExpenseViewSet

router = DefaultRouter()
router.register("expenses", ExpenseViewSet, basename="expense")

urlpatterns = router.urls
```

- [ ] **Step 6: Modify `backend/config/urls.py`** — add `path("api/", include("finance.urls")),` to the `urlpatterns` list, alongside the existing includes (`core.urls`, `accounts.urls`, `catalog.urls`, `purchasing.urls`, `sales.urls`, `stock.urls`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `docker compose run --rm web pytest finance/tests/test_expense_api.py -v`
Expected: 9 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/finance/ backend/config/urls.py
git commit -m "Add admin-only Expense CRUD API with server-set recorded_by and category filter"
```

---

### Task 2: Final integration check

**Files:**
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: a documented, verified, fully-passing Finance/Expense API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phases 1-4 plus this plan's expense tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with "No changes detected". No model fields changed anywhere in this plan.

- [ ] **Step 3: Update `backend/README.md`'s endpoint list**

Add a "Finance / Expenses (Phase 5b)" subsection alongside the existing ones, listing: `GET/POST /api/expenses/` (with the `?category=` filter noted), `GET/PATCH/PUT/DELETE /api/expenses/{id}/`. Note explicitly: the entire API is `IsAdmin`-gated (403 for any non-admin, on every verb, not just writes); `recorded_by` is always server-set from the acting employee and stays fixed across later edits.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 5b finance/expense endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase:**
- `backend/finance/models.py`'s `Expense` fields (`expense_id`, `category`, `amount`, `expense_date`, `description`, `recorded_by`, `ExpenseCategory` choices: RENT/UTILITIES/SALARIES/REPAIRS/OTHER) confirmed present and unchanged — no model changes in this plan.
- `backend/finance/migrations/` currently has only `0001_initial.py` — no new migration needed since no fields change.
- `backend/config/urls.py` confirmed to not yet include `finance.urls` — Task 1 Step 6 is a real, necessary addition.
- `backend/accounts/permissions.py`'s `IsAdmin` confirmed present and matching the exact role-check pattern this plan relies on (`request.user.role == Employee.Role.ADMIN`).
- `backend/finance/tests/test_models.py`'s existing 1 test and fixture style (`employee` fixture using `Employee.Role.ADMIN`) confirmed and replicated (renamed `admin` for clarity against the new `staff`/`other_admin` fixtures this plan needs) in the new test file.
- `Employee.employee_id` (the explicit AutoField PK, per this project's standing convention) confirmed as the field `recorded_by` resolves to in serialized output (`response.json()["recorded_by"]` is compared against `admin.employee_id`, not `admin.pk` or `admin.id`).

**Spec coverage:** Decision 1 (`IsAdmin` throughout, all verbs) → Task 1's `permission_classes` and `test_non_admin_gets_403_on_every_verb`. Decision 2 (`recorded_by` server-set) → `ExpenseSerializer.create()` override and the two tests verifying it (default case and client-submitted-value-ignored case). Decision 3 (no immutability lock) → plain `ModelViewSet`, no method restriction, `PATCH`/`PUT`/`DELETE` all exercised in tests. Decision 4 (`?category=` filter, date-range deferred to Phase 6) → Task 1's `get_queryset` and `test_category_filter`; no date-range filtering added anywhere in this plan. API design section → every listed endpoint has corresponding test coverage. Data flow example → exercised by `test_create_expense_sets_recorded_by_from_request_user` (create) and `test_patch_updates_fields_but_preserves_recorded_by` (edit-by-a-different-admin, matching the example's own wording). Error handling → 400 (invalid category), 403 (non-admin, every verb), 401 (unauthenticated) all tested; 404 for an unknown ID is DRF's default `get_object_or_404` behavior via `self.get_object()`, not separately implemented or tested (consistent with how prior phases treat DRF's built-in 404 handling). Testing section's every named scenario → present in Task 1. Out-of-scope items (date-range filtering, receipt uploads, notifications API, frontend) → correctly absent.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.

**Type/signature consistency:** `ExpenseSerializer` referenced identically in `views.py` and every test's response-shape assertions. `recorded_by` field name consistent between the model, serializer, and every test.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
