# Phase 5a: Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal notifications inbox API — an employee reads their own `NotificationLog` rows and marks them read. No new notification-producing triggers.

**Architecture:** One schema addition (`NotificationLog.read_at`), then `notifications/serializers.py` + `notifications/views.py` + `notifications/urls.py` on top of the existing model. `NotificationLogViewSet` is a `ReadOnlyModelViewSet` (list/retrieve only — no create/update/destroy routes exist at all) plus one custom `mark-read` action, so there is nothing to explicitly forbid: the router simply never generates the routes this API shouldn't have.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-phase5-notifications-design.md`

## Global Constraints

- `GET /api/notifications/` always filters to `recipient=request.user` — no employee, including Admins, can read another employee's notifications through this endpoint.
- Retrieving or mark-reading another employee's notification returns 404, never 403 — the endpoint must not reveal whether a given ID exists to a non-owner.
- `RBAC`: `IsAuthenticated` only — no admin gate. The recipient filter is what restricts access.
- Notifications are never client-created — no `POST /api/notifications/` on the collection.
- `mark-read` is idempotent: calling it twice never errors, and never moves `read_at` to a later timestamp on the second call.
- Every model uses an explicit `<name>_id` AutoField primary key — `NotificationLog.notification_id` already exists, unchanged.
- Tests use pytest-django + DRF's APIClient — never Django's TestCase/manage.py test.
- Money fields are not touched by this plan (no money fields on `NotificationLog`).

---

### Task 1: Schema addition and read-only list/retrieve API

**Files:**
- Modify: `backend/notifications/models.py`
- Create: `backend/notifications/migrations/0002_notificationlog_read_at.py` (generated via `makemigrations`, not hand-written)
- Create: `backend/notifications/serializers.py`
- Create: `backend/notifications/views.py`
- Create: `backend/notifications/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/notifications/tests/test_notification_api.py`

**Interfaces:**
- Consumes: `notifications.models.NotificationLog` (existing fields: `notification_id`, `type`, `recipient`, `related_sale`, `sent_at`, `status`; this task adds `read_at`).
- Produces: `NotificationLogSerializer` (all fields read-only via this serializer — used for both list/retrieve output and the Task 2 mark-read action's response), `GET /api/notifications/`, `GET /api/notifications/{id}/`.

- [ ] **Step 1: Write the failing tests — `backend/notifications/tests/test_notification_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from notifications.models import NotificationLog

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
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def other_employee():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_list_only_returns_own_notifications(employee, other_employee):
    NotificationLog.objects.create(type="sale_alert", recipient=employee)
    NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1


def test_list_unread_filter(employee):
    from django.utils import timezone
    NotificationLog.objects.create(type="sale_alert", recipient=employee, read_at=timezone.now())
    NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/?unread=true")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_list_ordered_newest_first(employee):
    first = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    second = NotificationLog.objects.create(type="sale_reversed", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get("/api/notifications/")
    results = response.json()["results"]
    assert results[0]["notification_id"] == second.notification_id
    assert results[1]["notification_id"] == first.notification_id


def test_retrieve_own_notification(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.get(f"/api/notifications/{log.notification_id}/")
    assert response.status_code == 200
    assert response.json()["type"] == "sale_alert"


def test_retrieve_other_employees_notification_returns_404(employee, other_employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.get(f"/api/notifications/{log.notification_id}/")
    assert response.status_code == 404


def test_post_to_collection_returns_405(employee):
    client = auth_client(employee, "adminpass")
    response = client.post("/api/notifications/", {"type": "sale_alert"}, format="json")
    assert response.status_code == 405


def test_patch_put_delete_return_405(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    url = f"/api/notifications/{log.notification_id}/"
    assert client.patch(url, {"type": "x"}, format="json").status_code == 405
    assert client.put(url, {"type": "x"}, format="json").status_code == 405
    assert client.delete(url).status_code == 405


def test_unauthenticated_request_returns_401():
    client = APIClient()
    response = client.get("/api/notifications/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest notifications/tests/test_notification_api.py -v`
Expected: FAIL — `/api/notifications/` returns 404 (not yet routed) and `read_at` doesn't exist on the model yet.

- [ ] **Step 3: Add `read_at` to `backend/notifications/models.py`**

Add this field to `NotificationLog`, immediately after the existing `status` field:

```python
    read_at = models.DateTimeField(null=True, blank=True)
```

- [ ] **Step 4: Generate and review the migration**

Run: `docker compose run --rm web python manage.py makemigrations notifications`
Expected output: a new file `backend/notifications/migrations/0002_notificationlog_read_at.py` adding the single `read_at` field, depending on `0001_initial`. Open the generated file and confirm it only adds this one field — no unrelated changes.

- [ ] **Step 5: Write `backend/notifications/serializers.py`**

```python
from rest_framework import serializers

from notifications.models import NotificationLog


class NotificationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationLog
        fields = [
            "notification_id", "type", "recipient", "related_sale",
            "sent_at", "status", "read_at",
        ]
        read_only_fields = fields
```

- [ ] **Step 6: Write `backend/notifications/views.py`**

```python
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from notifications.models import NotificationLog
from notifications.serializers import NotificationLogSerializer


class NotificationLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = NotificationLog.objects.filter(
            recipient=self.request.user
        ).order_by("-sent_at")
        if self.request.query_params.get("unread") == "true":
            queryset = queryset.filter(read_at__isnull=True)
        return queryset

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(NotificationLogSerializer(notification).data)
```

(The `mark_read` action's routing and tests are Task 2's responsibility — leave it here since it lives on the same class, but Task 2 owns testing it. `ReadOnlyModelViewSet` provides only `list`/`retrieve`, so `POST` to the collection and `PATCH`/`PUT`/`DELETE` to the detail URL are never routed at all — DRF returns 405 automatically, matching this task's own tests in Step 1.)

- [ ] **Step 7: Write `backend/notifications/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from notifications.views import NotificationLogViewSet

router = DefaultRouter()
router.register("notifications", NotificationLogViewSet, basename="notification")

urlpatterns = router.urls
```

- [ ] **Step 8: Modify `backend/config/urls.py`** — add `path("api/", include("notifications.urls")),` to the `urlpatterns` list, alongside the existing includes (`core.urls`, `accounts.urls`, `catalog.urls`, `purchasing.urls`, `sales.urls`, `stock.urls`).

- [ ] **Step 9: Run tests to verify they pass**

Run: `docker compose run --rm web pytest notifications/tests/test_notification_api.py -v`
Expected: 8 passed.

- [ ] **Step 10: Commit**

```bash
git add backend/notifications/ backend/config/urls.py
git commit -m "Add read_at to NotificationLog and a read-only notifications list/retrieve API"
```

---

### Task 2: Mark-read action

**Files:**
- Create: `backend/notifications/tests/test_mark_read.py`

**Interfaces:**
- Consumes: `NotificationLogViewSet.mark_read` (already written in Task 1, Step 6 — this task only adds test coverage for it, since it shares a class with Task 1's list/retrieve and cannot be meaningfully split into a separate file without duplicating the class).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing tests — `backend/notifications/tests/test_mark_read.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from notifications.models import NotificationLog

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
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


@pytest.fixture
def other_employee():
    return Employee.objects.create_user(
        username="admin2", password="adminpass", full_name="Admin Two",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_mark_read_sets_read_at(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    response = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert response.status_code == 200
    log.refresh_from_db()
    assert log.read_at is not None
    assert response.json()["read_at"] is not None


def test_mark_read_is_idempotent(employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=employee)
    client = auth_client(employee, "adminpass")
    first = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    log.refresh_from_db()
    first_read_at = log.read_at
    second = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert second.status_code == 200
    log.refresh_from_db()
    assert log.read_at == first_read_at


def test_mark_read_other_employees_notification_returns_404(employee, other_employee):
    log = NotificationLog.objects.create(type="sale_alert", recipient=other_employee)
    client = auth_client(employee, "adminpass")
    response = client.post(f"/api/notifications/{log.notification_id}/mark-read/")
    assert response.status_code == 404
    log.refresh_from_db()
    assert log.read_at is None


def test_mark_read_unauthenticated_returns_401():
    client = APIClient()
    response = client.post("/api/notifications/1/mark-read/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail (or pass unexpectedly)**

Run: `docker compose run --rm web pytest notifications/tests/test_mark_read.py -v`
Expected: PASS — Task 1 already wrote the `mark_read` action in `views.py`. This step exists to confirm that claim is true, not to write new implementation code. If any test fails, the `mark_read` action from Task 1 has a defect — fix `backend/notifications/views.py` directly (do not modify the tests to fit broken behavior) and re-run until green.

- [ ] **Step 3: Run the full notifications suite**

Run: `docker compose run --rm web pytest notifications/ -v`
Expected: 15 passed (3 existing model tests from Phase 1 + 8 from Task 1 + 4 new from this task).

- [ ] **Step 4: Commit**

```bash
git add backend/notifications/tests/test_mark_read.py
git commit -m "Add test coverage for the notifications mark-read action"
```

---

### Task 3: Final integration check

**Files:**
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: a documented, verified, fully-passing notifications API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phases 1-4 plus this plan's notification tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with "No changes detected" — the `read_at` migration from Task 1 should already be committed, so nothing further is pending.

- [ ] **Step 3: Update `backend/README.md`'s endpoint list**

Add a "Notifications (Phase 5a)" subsection alongside the existing ones, listing: `GET /api/notifications/` (with the `?unread=true` filter noted), `GET /api/notifications/{id}/`, `POST /api/notifications/{id}/mark-read/`. Note explicitly: notifications are always scoped to the authenticated employee's own `recipient` rows; no endpoint lets one employee read or mark another's notifications; notifications are never client-created.

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 5a notifications endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase:**
- `backend/notifications/models.py`'s `NotificationLog` fields (`notification_id`, `type`, `recipient`, `related_sale`, `sent_at`, `status`, `NotificationStatus` choices) confirmed present and unchanged except for this plan's own `read_at` addition.
- `backend/notifications/migrations/` currently has only `0001_initial.py` — Task 1's `0002_notificationlog_read_at.py` is the correct next number.
- `backend/config/urls.py` confirmed to not yet include `notifications.urls` — Task 1 Step 8 is a real, necessary addition.
- `backend/sales/services.py`'s `_notify_admins` (Phase 3) already creates `NotificationLog` rows with `type="sale_alert"`/`"sale_reversed"` — unchanged by this plan, confirmed no modification needed since this plan only adds a read/mark-read layer on top.
- `backend/notifications/tests/test_models.py`'s existing 2 tests and fixture style (`employee` fixture using `Employee.Role.ADMIN`, matching the sales-notification precedent) confirmed and replicated in every new test file in this plan.
- `EmployeeTokenObtainPairView`/`/api/auth/login/` login flow confirmed matching pattern used in every prior phase's `auth_client` helper.

**Spec coverage:** Decision 1 (`read_at` schema addition) → Task 1. Decision 2 (personal inbox, `IsAuthenticated` only, recipient-filtered) → Task 1's `get_queryset` and its cross-employee isolation tests. Decision 3 (no new triggers) → correctly absent from every task; `sales/services.py` is never touched. Decision 4 (never client-created, mark-read is the only write) → `ReadOnlyModelViewSet` + Task 1's 405 tests + Task 2's mark-read tests. Decision 5 (otherwise immutable) → no `PATCH`/`PUT`/`DELETE` routes exist at all (structural, not just tested). API design section → `GET` list/retrieve (Task 1), `?unread=true` filter (Task 1), `mark-read` action (Task 1 implementation, Task 2 test coverage), 404-not-403 isolation (Task 1 + Task 2). Data flow example → exercised end-to-end across Task 1's list test and Task 2's mark-read test. Error handling → 401 (Task 1), 404 for cross-employee access (Task 1 retrieve, Task 2 mark-read). Testing section's every named scenario → present across Tasks 1-2. Out-of-scope items (new triggers, bulk mark-all-read, dashboard, finance) → correctly absent.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.

**Type/signature consistency:** `NotificationLogSerializer` referenced identically in Task 1 (views.py) and Task 2 (asserting on its output shape via `response.json()["read_at"]`). `mark_read` action's URL (`mark-read`, hyphenated per DRF's `url_path` convention) matches between Task 1's implementation and Task 2's test URLs.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
