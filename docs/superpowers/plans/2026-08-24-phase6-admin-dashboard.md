# Phase 6: Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only reporting/aggregation API for the admin dashboard — four focused endpoints summarizing sales, stock health, finances, and recent activity, querying existing models directly via the ORM.

**Architecture:** A new Django app, `dashboard/`, with no models and no migrations — every endpoint is a plain `rest_framework.views.APIView` subclass (not a ViewSet, since there is no single CRUD resource: four independent report endpoints, each `GET`-only) returning a plain dict via `Response()`. A shared `dashboard/services.py` holds `resolve_period_range(period)`, used by the two period-taking endpoints. `IsAdmin` (existing, from `accounts.permissions`) gates every endpoint.

**Tech Stack:** Django 5.1, DRF, pytest-django, PostgreSQL — unchanged. No new dependencies. No migrations — the app defines no models.

**Spec:** `docs/superpowers/specs/2026-08-24-phase6-admin-dashboard-design.md`

## Global Constraints

- Every endpoint is `GET` only, `IsAdmin`-gated, and writes nothing to any model.
- `period` (where accepted) is one of `today|week|month|year`. Boundary semantics (fixed for this plan, since the spec leaves exact boundaries to implementation): `today` = the current calendar day; `week` = the current day plus the preceding 6 days (rolling 7-day window, not Mon-Sun); `month` = the 1st of the current calendar month through today (calendar month-to-date, not rolling 30 days); `year` = January 1st of the current year through today (calendar year-to-date). An unrecognized `period` value raises `rest_framework.exceptions.ValidationError`, which DRF converts to 400 automatically inside `APIView.dispatch` — no manual `try/except` needed in any view.
- `Sale` revenue calculations only count `status=Sale.SaleStatus.COMPLETED` rows — returned/cancelled sales never count as revenue.
- Aggregations that group by a fixed choice set (`EquipmentUnit.UnitStatus`, `Expense.ExpenseCategory`) must include every choice in the response even when its count/total is zero — never omit a zero row.
- No model changes anywhere in this plan. No new migrations.
- Tests use pytest-django + DRF's APIClient — never Django's TestCase/manage.py test.
- Money fields already exist as `DecimalField(max_digits=12, decimal_places=2)` on `Sale.total_amount`, `SaleItem.subtotal`, `Expense.amount` — this plan only reads them, adds no new money fields.

---

### Task 1: App scaffold and sales-summary endpoint

**Files:**
- Create: `backend/dashboard/__init__.py`
- Create: `backend/dashboard/apps.py`
- Create: `backend/dashboard/tests/__init__.py`
- Modify: `backend/config/settings.py`
- Create: `backend/dashboard/services.py`
- Create: `backend/dashboard/views.py`
- Create: `backend/dashboard/urls.py`
- Modify: `backend/config/urls.py`
- Create: `backend/dashboard/tests/test_sales_summary.py`

**Interfaces:**
- Consumes: `sales.models.Sale` (`status`, `SaleStatus.COMPLETED`, `sale_date`, `total_amount`, `employee`), `sales.models.SaleItem` (`sale`, `product`, `subtotal`) — all existing, unchanged. `accounts.permissions.IsAdmin` — existing, unchanged.
- Produces: `dashboard.services.resolve_period_range(period) -> (start_date, end_date)` — raises `rest_framework.exceptions.ValidationError` on an unrecognized `period`; both returned values are `datetime.date` objects (inclusive range). Consumed by Task 3 (`financial-snapshot`), which needs the identical period semantics. `GET /api/dashboard/sales-summary/`.

- [ ] **Step 1: Write the failing tests — `backend/dashboard/tests/test_sales_summary.py`**

```python
import pytest
from datetime import date, timedelta
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from sales.models import Sale, SaleItem

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
def staff():
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


def make_completed_sale(employee, product, sale_date, amount, quantity=1):
    sale = Sale.objects.create(
        employee=employee, total_amount=amount, status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=sale.pk).update(sale_date=sale_date)
    sale.refresh_from_db()
    SaleItem.objects.create(
        sale=sale, product=product, quantity=quantity,
        unit_price=amount / quantity, subtotal=amount,
    )
    return sale


def test_sales_summary_today(admin, product):
    from django.utils import timezone
    now = timezone.now()
    make_completed_sale(admin, product, now, Decimal("10000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 1
    assert Decimal(body["total_revenue"]) == Decimal("10000.00")


def test_sales_summary_excludes_sales_outside_period(admin, product):
    from django.utils import timezone
    now = timezone.now()
    outside = now - timedelta(days=40)
    make_completed_sale(admin, product, outside, Decimal("5000.00"))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    assert response.json()["sale_count"] == 0


def test_sales_summary_excludes_non_completed_sales(admin, product):
    from django.utils import timezone
    sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("9000.00"), status=Sale.SaleStatus.CANCELLED,
    )
    SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price=Decimal("9000.00"), subtotal=Decimal("9000.00"),
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    assert response.json()["sale_count"] == 0


def test_sales_summary_top_products_ordered_and_limited_to_5(admin, category):
    from django.utils import timezone
    now = timezone.now()
    products = [
        Product.objects.create(category=category, barcode=f"PES-AUD-0000{i}", name=f"Item {i}")
        for i in range(6)
    ]
    for i, prod in enumerate(products):
        make_completed_sale(admin, prod, now, Decimal(str(1000 * (i + 1))))
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    top = response.json()["top_products"]
    assert len(top) == 5
    revenues = [Decimal(p["revenue"]) for p in top]
    assert revenues == sorted(revenues, reverse=True)
    assert revenues[0] == Decimal("6000.00")


def test_sales_summary_empty_period_returns_zero_not_error(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert body["sale_count"] == 0
    assert Decimal(body["total_revenue"]) == Decimal("0")
    assert body["top_products"] == []


def test_sales_summary_invalid_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/?period=bogus")
    assert response.status_code == 400


def test_sales_summary_missing_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/sales-summary/")
    assert response.status_code == 400


def test_sales_summary_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 403


def test_sales_summary_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/sales-summary/?period=today")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest dashboard/tests/test_sales_summary.py -v`
Expected: FAIL — `dashboard` app doesn't exist yet, `/api/dashboard/sales-summary/` returns 404.

- [ ] **Step 3: Create `backend/dashboard/__init__.py`** (empty file)

- [ ] **Step 4: Create `backend/dashboard/apps.py`**

```python
from django.apps import AppConfig


class DashboardConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "dashboard"
```

- [ ] **Step 5: Create `backend/dashboard/tests/__init__.py`** (empty file)

- [ ] **Step 6: Modify `backend/config/settings.py`** — add `"dashboard",` to `INSTALLED_APPS`, after `"notifications",`.

- [ ] **Step 7: Write `backend/dashboard/services.py`**

```python
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import ValidationError

VALID_PERIODS = {"today", "week", "month", "year"}


def resolve_period_range(period):
    if period not in VALID_PERIODS:
        raise ValidationError({"period": f"Invalid period: {period!r}. Must be one of {sorted(VALID_PERIODS)}."})

    today = timezone.localdate()

    if period == "today":
        start = today
    elif period == "week":
        start = today - timedelta(days=6)
    elif period == "month":
        start = today.replace(day=1)
    else:
        start = today.replace(month=1, day=1)

    return start, today
```

- [ ] **Step 8: Write `backend/dashboard/views.py`**

```python
from decimal import Decimal

from django.db.models import Sum
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin
from dashboard.services import resolve_period_range
from sales.models import Sale, SaleItem


class SalesSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        period = request.query_params.get("period")
        start, end = resolve_period_range(period)

        completed_sales = Sale.objects.filter(
            status=Sale.SaleStatus.COMPLETED, sale_date__date__range=(start, end)
        )
        total_revenue = completed_sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")
        sale_count = completed_sales.count()

        top_products = (
            SaleItem.objects.filter(
                sale__status=Sale.SaleStatus.COMPLETED,
                sale__sale_date__date__range=(start, end),
            )
            .values("product_id", "product__name")
            .annotate(revenue=Sum("subtotal"))
            .order_by("-revenue")[:5]
        )

        return Response({
            "period": period,
            "total_revenue": total_revenue,
            "sale_count": sale_count,
            "top_products": [
                {
                    "product_id": row["product_id"],
                    "product_name": row["product__name"],
                    "revenue": row["revenue"],
                }
                for row in top_products
            ],
        })
```

(`BasePermission` is imported but unused at this point — remove that import; it was a leftover from drafting. Only import what Step 8's actual code uses: `Decimal`, `Sum`, `Response`, `APIView`, `IsAdmin`, `resolve_period_range`, `Sale`, `SaleItem`.)

- [ ] **Step 9: Write `backend/dashboard/urls.py`**

```python
from django.urls import path

from dashboard.views import SalesSummaryView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
]
```

- [ ] **Step 10: Modify `backend/config/urls.py`** — add `path("api/", include("dashboard.urls")),` to the `urlpatterns` list, after the `finance.urls` include.

- [ ] **Step 11: Run tests to verify they pass**

Run: `docker compose run --rm web pytest dashboard/tests/test_sales_summary.py -v`
Expected: 9 passed.

- [ ] **Step 12: Commit**

```bash
git add backend/dashboard/ backend/config/settings.py backend/config/urls.py
git commit -m "Scaffold dashboard app and add sales-summary aggregation endpoint"
```

---

### Task 2: Stock-health endpoint

**Files:**
- Modify: `backend/dashboard/views.py`
- Modify: `backend/dashboard/urls.py`
- Create: `backend/dashboard/tests/test_stock_health.py`

**Interfaces:**
- Consumes: `stock.models.Inventory` (`quantity_in_stock`, `product__reorder_level`), `stock.models.EquipmentUnit` (`status`, `UnitStatus` choices) — existing, unchanged from Phase 4.
- Produces: `GET /api/dashboard/stock-health/`. Nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests — `backend/dashboard/tests/test_stock_health.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory, EquipmentUnit

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
def staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def test_low_stock_count(admin, category):
    low_product = Product.objects.create(
        category=category, barcode="PES-AUD-00001", name="Low", reorder_level=5,
    )
    ok_product = Product.objects.create(
        category=category, barcode="PES-AUD-00002", name="OK", reorder_level=5,
    )
    Inventory.objects.create(product=low_product, quantity_in_stock=2)
    Inventory.objects.create(product=ok_product, quantity_in_stock=50)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    assert response.json()["low_stock_count"] == 1


def test_equipment_status_counts_include_zero_statuses(admin, category):
    product = Product.objects.create(category=category, barcode="PES-AUD-00003", name="Speaker")
    EquipmentUnit.objects.create(product=product, serial_number="A1", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=product, serial_number="A2", status=EquipmentUnit.UnitStatus.IN_STOCK)
    EquipmentUnit.objects.create(product=product, serial_number="A3", status=EquipmentUnit.UnitStatus.SOLD)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    counts = response.json()["equipment_status_counts"]
    assert counts["in_stock"] == 2
    assert counts["sold"] == 1
    assert counts["damaged"] == 0
    assert counts["under_repair"] == 0
    assert counts["in_use"] == 0
    assert set(counts.keys()) == {"in_stock", "in_use", "damaged", "under_repair", "sold"}


def test_stock_health_empty_state(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 200
    body = response.json()
    assert body["low_stock_count"] == 0
    assert all(count == 0 for count in body["equipment_status_counts"].values())


def test_stock_health_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 403


def test_stock_health_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/stock-health/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest dashboard/tests/test_stock_health.py -v`
Expected: FAIL — `/api/dashboard/stock-health/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/dashboard/views.py`**

```python
from django.db.models import Count, F

from stock.models import EquipmentUnit, Inventory


class StockHealthView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        low_stock_count = Inventory.objects.filter(
            quantity_in_stock__lte=F("product__reorder_level")
        ).count()

        status_counts = {choice[0]: 0 for choice in EquipmentUnit.UnitStatus.choices}
        for row in EquipmentUnit.objects.values("status").annotate(count=Count("unit_id")):
            status_counts[row["status"]] = row["count"]

        return Response({
            "low_stock_count": low_stock_count,
            "equipment_status_counts": status_counts,
        })
```

(`Sum`, `Decimal`, `Response`, `APIView`, `IsAdmin` are already imported at the top of the file from Task 1 — add `from django.db.models import Count, F` as a new import line, and `from stock.models import EquipmentUnit, Inventory` — don't duplicate existing imports.)

- [ ] **Step 4: Modify `backend/dashboard/urls.py`**

```python
from django.urls import path

from dashboard.views import SalesSummaryView, StockHealthView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
    path("dashboard/stock-health/", StockHealthView.as_view(), name="dashboard-stock-health"),
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose run --rm web pytest dashboard/tests/test_stock_health.py -v`
Expected: 5 passed.

- [ ] **Step 6: Run the full dashboard suite to confirm no regressions**

Run: `docker compose run --rm web pytest dashboard/ -v`
Expected: 14 passed (9 from Task 1 + 5 from this task).

- [ ] **Step 7: Commit**

```bash
git add backend/dashboard/
git commit -m "Add stock-health dashboard endpoint (low-stock count, equipment status breakdown)"
```

---

### Task 3: Financial-snapshot endpoint

**Files:**
- Modify: `backend/dashboard/views.py`
- Modify: `backend/dashboard/urls.py`
- Create: `backend/dashboard/tests/test_financial_snapshot.py`

**Interfaces:**
- Consumes: `dashboard.services.resolve_period_range` (Task 1), `sales.models.Sale` (Task 1's revenue logic, duplicated here per-endpoint rather than shared, since the spec treats each dashboard endpoint as independently computed), `finance.models.Expense` (`category`, `ExpenseCategory` choices, `amount`, `expense_date`) — existing, unchanged from Phase 5b.
- Produces: `GET /api/dashboard/financial-snapshot/`. Nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests — `backend/dashboard/tests/test_financial_snapshot.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product
from finance.models import Expense
from sales.models import Sale, SaleItem

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
def staff():
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


def test_financial_snapshot_computes_net(admin, product):
    from django.utils import timezone
    now = timezone.now()
    today = timezone.localdate()
    sale = Sale.objects.create(
        employee=admin, total_amount=Decimal("50000.00"), status=Sale.SaleStatus.COMPLETED,
    )
    Sale.objects.filter(pk=sale.pk).update(sale_date=now)
    SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price=Decimal("50000.00"), subtotal=Decimal("50000.00"),
    )
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount=Decimal("20000.00"),
        expense_date=today, recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert Decimal(body["total_revenue"]) == Decimal("50000.00")
    assert Decimal(body["total_expenses"]) == Decimal("20000.00")
    assert Decimal(body["net"]) == Decimal("30000.00")


def test_financial_snapshot_expenses_by_category_include_zero_categories(admin):
    today = date.today()
    Expense.objects.create(
        category=Expense.ExpenseCategory.RENT, amount=Decimal("20000.00"),
        expense_date=today, recorded_by=admin,
    )
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    body = response.json()
    by_category = body["expenses_by_category"]
    assert Decimal(by_category["rent"]) == Decimal("20000.00")
    assert Decimal(by_category["utilities"]) == Decimal("0")
    assert set(by_category.keys()) == {"rent", "utilities", "salaries", "repairs", "other"}


def test_financial_snapshot_empty_period_returns_zero(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 200
    body = response.json()
    assert Decimal(body["total_revenue"]) == Decimal("0")
    assert Decimal(body["total_expenses"]) == Decimal("0")
    assert Decimal(body["net"]) == Decimal("0")


def test_financial_snapshot_invalid_period_returns_400(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=bogus")
    assert response.status_code == 400


def test_financial_snapshot_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 403


def test_financial_snapshot_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/financial-snapshot/?period=today")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest dashboard/tests/test_financial_snapshot.py -v`
Expected: FAIL — `/api/dashboard/financial-snapshot/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/dashboard/views.py`**

```python
from finance.models import Expense


class FinancialSnapshotView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        period = request.query_params.get("period")
        start, end = resolve_period_range(period)

        total_revenue = Sale.objects.filter(
            status=Sale.SaleStatus.COMPLETED, sale_date__date__range=(start, end)
        ).aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00")

        expenses_in_period = Expense.objects.filter(expense_date__range=(start, end))
        total_expenses = expenses_in_period.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")

        by_category = {choice[0]: Decimal("0.00") for choice in Expense.ExpenseCategory.choices}
        for row in expenses_in_period.values("category").annotate(total=Sum("amount")):
            by_category[row["category"]] = row["total"]

        return Response({
            "period": period,
            "total_revenue": total_revenue,
            "total_expenses": total_expenses,
            "expenses_by_category": by_category,
            "net": total_revenue - total_expenses,
        })
```

(`Decimal`, `Sum`, `Response`, `APIView`, `IsAdmin`, `resolve_period_range`, `Sale` are already imported at the top of the file from Task 1 — add `from finance.models import Expense` as a new import line, don't duplicate existing imports.)

- [ ] **Step 4: Modify `backend/dashboard/urls.py`**

```python
from django.urls import path

from dashboard.views import FinancialSnapshotView, SalesSummaryView, StockHealthView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
    path("dashboard/stock-health/", StockHealthView.as_view(), name="dashboard-stock-health"),
    path("dashboard/financial-snapshot/", FinancialSnapshotView.as_view(), name="dashboard-financial-snapshot"),
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose run --rm web pytest dashboard/tests/test_financial_snapshot.py -v`
Expected: 6 passed.

- [ ] **Step 6: Run the full dashboard suite to confirm no regressions**

Run: `docker compose run --rm web pytest dashboard/ -v`
Expected: 20 passed (14 from Task 2's checkpoint + 6 from this task).

- [ ] **Step 7: Commit**

```bash
git add backend/dashboard/
git commit -m "Add financial-snapshot dashboard endpoint (revenue vs expenses by period)"
```

---

### Task 4: Activity-feed endpoint

**Files:**
- Modify: `backend/dashboard/views.py`
- Modify: `backend/dashboard/urls.py`
- Create: `backend/dashboard/tests/test_activity_feed.py`

**Interfaces:**
- Consumes: `sales.models.Sale` (`sale_id`, `sale_date`, `total_amount`), `purchasing.models.Purchase` (`purchase_id`, `purchase_date`, `supplier`), `notifications.models.NotificationLog` (`notification_id`, `sent_at`, `type`, `recipient`) — all existing, unchanged.
- Produces: `GET /api/dashboard/activity-feed/`. Nothing consumed by later tasks.

- [ ] **Step 1: Write the failing tests — `backend/dashboard/tests/test_activity_feed.py`**

```python
import pytest
from datetime import date
from decimal import Decimal
from rest_framework.test import APIClient
from accounts.models import Employee
from notifications.models import NotificationLog
from purchasing.models import Purchase, Supplier
from sales.models import Sale

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


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Acme Supplies")


def test_activity_feed_merges_and_sorts_three_types(admin, supplier):
    Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    Purchase.objects.create(
        supplier=supplier, employee=admin, purchase_date=date.today(), status=Purchase.Status.DRAFT,
    )
    NotificationLog.objects.create(type="sale_alert", recipient=admin)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 3
    types = {item["type"] for item in body}
    assert types == {"sale", "purchase", "notification"}


def test_activity_feed_respects_limit(admin):
    for _ in range(5):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/?limit=3")
    assert response.status_code == 200
    assert len(response.json()) == 3


def test_activity_feed_default_limit_is_20(admin):
    for _ in range(25):
        Sale.objects.create(employee=admin, total_amount=Decimal("1000.00"), status=Sale.SaleStatus.COMPLETED)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    assert len(response.json()) == 20


def test_activity_feed_only_includes_requesting_admins_notifications(admin, other_admin):
    NotificationLog.objects.create(type="sale_alert", recipient=admin)
    NotificationLog.objects.create(type="sale_alert", recipient=other_admin)
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    notification_items = [item for item in response.json() if item["type"] == "notification"]
    assert len(notification_items) == 1


def test_activity_feed_empty_state(admin):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 200
    assert response.json() == []


def test_activity_feed_non_admin_returns_403(staff):
    client = auth_client(staff, "staffpass")
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 403


def test_activity_feed_unauthenticated_returns_401():
    client = APIClient()
    response = client.get("/api/dashboard/activity-feed/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm web pytest dashboard/tests/test_activity_feed.py -v`
Expected: FAIL — `/api/dashboard/activity-feed/` returns 404 (not yet routed).

- [ ] **Step 3: Append to `backend/dashboard/views.py`**

```python
from datetime import datetime

from django.utils import timezone

from notifications.models import NotificationLog
from purchasing.models import Purchase


class ActivityFeedView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        limit = int(request.query_params.get("limit", 20))

        sales = Sale.objects.order_by("-sale_date")[:limit]
        purchases = Purchase.objects.order_by("-purchase_date", "-purchase_id")[:limit]
        notifications = NotificationLog.objects.filter(
            recipient=request.user
        ).order_by("-sent_at")[:limit]

        items = []
        for sale in sales:
            items.append({
                "type": "sale",
                "id": sale.sale_id,
                "timestamp": sale.sale_date,
                "summary": f"Sale #{sale.sale_id} - {sale.total_amount}",
            })
        for purchase in purchases:
            purchase_timestamp = timezone.make_aware(
                datetime.combine(purchase.purchase_date, datetime.min.time())
            )
            items.append({
                "type": "purchase",
                "id": purchase.purchase_id,
                "timestamp": purchase_timestamp,
                "summary": f"Purchase #{purchase.purchase_id} - {purchase.supplier}",
            })
        for notification in notifications:
            items.append({
                "type": "notification",
                "id": notification.notification_id,
                "timestamp": notification.sent_at,
                "summary": notification.type,
            })

        items.sort(key=lambda item: item["timestamp"], reverse=True)
        return Response(items[:limit])
```

(`Response`, `APIView`, `IsAdmin`, `Sale` are already imported at the top of the file from Task 1 — add `from datetime import datetime`, `from django.utils import timezone`, `from notifications.models import NotificationLog`, `from purchasing.models import Purchase` as new import lines, don't duplicate existing imports.)

- [ ] **Step 4: Modify `backend/dashboard/urls.py`**

```python
from django.urls import path

from dashboard.views import ActivityFeedView, FinancialSnapshotView, SalesSummaryView, StockHealthView

urlpatterns = [
    path("dashboard/sales-summary/", SalesSummaryView.as_view(), name="dashboard-sales-summary"),
    path("dashboard/stock-health/", StockHealthView.as_view(), name="dashboard-stock-health"),
    path("dashboard/financial-snapshot/", FinancialSnapshotView.as_view(), name="dashboard-financial-snapshot"),
    path("dashboard/activity-feed/", ActivityFeedView.as_view(), name="dashboard-activity-feed"),
]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `docker compose run --rm web pytest dashboard/tests/test_activity_feed.py -v`
Expected: 7 passed.

- [ ] **Step 6: Run the full dashboard suite to confirm no regressions**

Run: `docker compose run --rm web pytest dashboard/ -v`
Expected: 27 passed (20 from Task 3's checkpoint + 7 from this task).

- [ ] **Step 7: Commit**

```bash
git add backend/dashboard/
git commit -m "Add activity-feed dashboard endpoint merging sales, purchases, and notifications"
```

---

### Task 5: Final integration check

**Files:**
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: a documented, verified, fully-passing admin dashboard API.

- [ ] **Step 1: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Phases 1-5 plus this plan's dashboard tests pass — state the exact final count from the real output. If any fail, use `superpowers:systematic-debugging` to investigate; do not proceed until all pass.

- [ ] **Step 2: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with "No changes detected" — the `dashboard` app defines no models, so there is nothing to migrate.

- [ ] **Step 3: Update `backend/README.md`**

Add a "Admin Dashboard (Phase 6)" subsection alongside the existing ones, listing: `GET /api/dashboard/sales-summary/?period=today|week|month|year`, `GET /api/dashboard/stock-health/` (no period param), `GET /api/dashboard/financial-snapshot/?period=...`, `GET /api/dashboard/activity-feed/?limit=<n, default 20>`. Note explicitly: every endpoint is `IsAdmin`-gated and read-only; `period` boundaries are `today` (current day), `week` (rolling 7 days), `month` (calendar month-to-date), `year` (calendar year-to-date); an invalid `period` returns 400. Update the closing "admin dashboard remains schema-only" sentence — the admin dashboard now HAS an API; remove or rewrite that sentence since nothing in the backend remains schema-only after this phase (confirm this by checking whether any other model is still undocumented before rewriting — if something is, name it instead of removing the sentence outright).

- [ ] **Step 4: Commit**

```bash
git add backend/README.md
git commit -m "Document Phase 6 admin dashboard endpoints in README, confirm suite passes clean"
```

---

## Self-Review Notes

**Mechanical verification against the real codebase (all confirmed correct):**
- `backend/dashboard/` does not exist yet — confirmed via directory listing before writing this plan. This is the first phase in this project requiring a brand-new Django app (all prior phases built on Phase 1's schema-only apps) — Task 1 explicitly scaffolds `apps.py`/`__init__.py`/`tests/__init__.py` and registers it in `INSTALLED_APPS`, a step every prior phase's plan could skip.
- `backend/config/settings.py`'s `INSTALLED_APPS` list confirmed to end at `"notifications",` (post-Phase-5-merge state) — Task 1's insertion point is correct.
- `backend/config/urls.py` confirmed to already include `notifications.urls` and `finance.urls` (post-Phase-5-merge) but not yet `dashboard.urls` — Task 1's addition is real and necessary.
- `sales.models.Sale` fields (`sale_id`, `customer`, `employee`, `sale_date` — `DateTimeField(auto_now_add=True)`, `payment_method`, `total_amount`, `status`, `SaleStatus.COMPLETED/RETURNED/CANCELLED`) and `SaleItem` fields (`sale`, `product`, `quantity`, `unit_price`, `subtotal`) confirmed present and unchanged.
- `purchasing.models.Purchase` fields (`purchase_id`, `supplier`, `employee`, `purchase_date` — a `DateField`, NOT `DateTimeField`, `total_paid`, `total_invoiced`, `payment_status`, `status`) confirmed present — Task 4's activity feed explicitly handles the `DateField`-to-comparable-timestamp conversion via `timezone.make_aware(datetime.combine(...))`, since `Purchase` has no timestamp field finer than a day.
- `stock.models.Inventory` (`quantity_in_stock`, `product` OneToOne) and `EquipmentUnit` (`status`, `UnitStatus` choices: `IN_STOCK`/`IN_USE`/`DAMAGED`/`UNDER_REPAIR`/`SOLD`) confirmed present and unchanged from Phase 4.
- `catalog.models.Product.reorder_level` (`PositiveIntegerField(default=5)`) confirmed present, used identically to Phase 4's `is_low_stock` definition (`quantity_in_stock <= product.reorder_level`), satisfying the spec's "reusing Phase 4's own definition, not reimplementing it" requirement via the same comparison expressed as an ORM `F()` filter.
- `finance.models.Expense` fields (`category`, `ExpenseCategory.RENT/UTILITIES/SALARIES/REPAIRS/OTHER`, `amount`, `expense_date`, `recorded_by`) confirmed present and unchanged from Phase 5b.
- `notifications.models.NotificationLog` fields (`notification_id`, `type`, `recipient`, `sent_at`, `read_at`) confirmed present and unchanged from Phase 5a.
- `accounts.permissions.IsAdmin` confirmed present, reused unchanged — no new permission class written anywhere in this plan.

**Spec coverage:** Decision 1 (all four widgets) → one task each (Tasks 1-4). Decision 2 (four focused endpoints, not combined) → confirmed by the four separate `APIView` classes and four separate URL paths. Decision 3 (fixed periods via `?period=`, server-computed) → `resolve_period_range` (Task 1), reused by Task 3; Task 2 (`stock-health`) correctly takes no period param, matching the spec's "point-in-time snapshot" framing. Decision 4 (`IsAdmin` throughout) → every view's `permission_classes = [IsAdmin]`, tested in every task. Decision 5 (read-only, no persisted state) → no models, no migrations, `GET`-only views throughout (non-`GET` methods 405 automatically via DRF's `APIView` default `http_method_not_allowed` — not separately tested per task, since it's structural, matching how Phase 5a's `ReadOnlyModelViewSet` needed no explicit method-restriction tests either). Decision 6 (activity feed merges in Python, not SQL) → Task 4's fetch-then-merge-then-sort implementation, explicitly not a SQL `UNION`. API design section → every listed endpoint has a corresponding task and test file. Data flow example → exercised end-to-end across all four tasks' tests, particularly Task 4's multi-type merge test. Error handling → 400 (invalid period, Tasks 1 and 3), 403 (non-admin, every task), 401 (unauthenticated, every task), zero-value-not-error for empty periods (Tasks 1-3). Testing section's every named scenario → present across Tasks 1-4 (period boundary correctness via the "excludes sales outside period" tests, top-5 ordering/limiting, low-stock count matching Phase 4's definition, exhaustive status/category breakdowns including zero rows, activity feed interleaving/sorting/limit/own-notifications-only). Out-of-scope items (write endpoints, charts, historical trends beyond four periods, arbitrary date ranges, frontend) → correctly absent from every task.

**Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command. Task 1 Step 8's note about removing an unused `BasePermission` import and Task 5 Step 3's conditional README wording are explicit, actionable instructions, not vague placeholders.

**Type/signature consistency:** `resolve_period_range(period) -> (date, date)` (Task 1) is imported and called identically in Task 3 (`FinancialSnapshotView`). `Sale.SaleStatus.COMPLETED` referenced identically in Tasks 1 and 3. `EquipmentUnit.UnitStatus.choices` and `Expense.ExpenseCategory.choices` referenced identically wherever the exhaustive-zero-inclusion pattern is used (Tasks 2 and 3 respectively). View class names (`SalesSummaryView`, `StockHealthView`, `FinancialSnapshotView`, `ActivityFeedView`) match exactly between `views.py` and each task's `urls.py` update.

**Test count arithmetic:** stated inline at each checkpoint as sanity checks, not hard requirements — Task 5 explicitly instructs reporting the real final count rather than forcing a match to the estimate, following the pattern established after Phase 5a's plan mis-estimated its own pre-existing test count.

## Execution Handoff

After saving the plan, offer execution choice:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints
