# Phase 1: Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Django REST backend foundation for the Promise Electronic Shop Inventory System — full DB schema (15 tables across 7 apps), JWT auth with role-based access control, and working CRUD APIs for the entities every later phase depends on (employees, categories, suppliers, customers, products, product pricing).

**Architecture:** Docker Compose runs `postgres` (16), `redis` (7, unused until a later phase), and `web` (Django 5.1 + DRF, Python 3.12). One Django project (`config`) with seven domain apps: `accounts`, `catalog`, `purchasing`, `sales`, `stock`, `finance`, `notifications`. Every model uses an explicit `<name>_id` primary key matching the docx schema's column names. Auth is `djangorestframework-simplejwt`; RBAC is enforced in DRF permission classes reading `request.user.role`, not a separate permissions table.

**Tech Stack:** Python 3.12, Django 5.1, djangorestframework 3.15, djangorestframework-simplejwt 5.3, psycopg[binary], django-environ, pytest, pytest-django, PostgreSQL 16, Redis 7, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-23-phase1-backend-foundation-design.md`

## Global Constraints

- All 15 tables use an explicit `<name>_id` `AutoField` primary key (e.g. `employee_id`, `product_id`) — never Django's implicit default `id` — for direct cross-reference with the docx schema.
- `Employee` is the custom `AUTH_USER_MODEL` (extends `AbstractBaseUser` + `PermissionsMixin`). Django's built-in `password` field IS the docx's `password_hash` column — no separate field.
- RBAC matrix (from the spec, binding for every task below):
  - `/api/employees/` — Admin only, read and write.
  - `/api/categories/`, `/api/suppliers/`, `/api/customers/`, `/api/products/` — any authenticated employee, read and write.
  - `/api/product-pricing/` — any authenticated employee can read/write, but `wholesale_price` is omitted from responses for non-admins and rejected (403) if a non-admin submits it.
- `Product.barcode` is always system-generated via `catalog.services.generate_barcode(category) -> str`, never accepted from a client.
- Creating a new `ProductPricing` row for a product must, in the same transaction, flip any existing `is_current=True` row for that product to `False` before saving the new row as current.
- Tests use `pytest-django` and DRF's `APIClient` — never Django's `TestCase`/`manage.py test` runner directly (though `pytest-django` uses `TestCase`-compatible transactional wrapping under the hood, tests are pytest-style functions/classes run via `pytest`).
- Every task ends with `git add` + `git commit` using a specific, real commit message.
- Money fields are `DecimalField(max_digits=12, decimal_places=2)` throughout (never `FloatField`).

---

## Task 1: Project scaffolding — Docker Compose, Django project, health check

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `backend/manage.py`
- Create: `backend/pytest.ini`
- Create: `backend/config/__init__.py`
- Create: `backend/config/settings.py`
- Create: `backend/config/urls.py`
- Create: `backend/config/wsgi.py`
- Create: `backend/config/asgi.py`
- Create: `backend/core/__init__.py`
- Create: `backend/core/views.py`
- Test: `backend/core/tests/__init__.py`
- Test: `backend/core/tests/test_health.py`

**Interfaces:**
- Produces: `GET /api/health/` → `200 {"status": "ok"}`, used by later tasks/CI as a smoke check.
- Produces: `config.settings` module readable by every later app (`INSTALLED_APPS`, `AUTH_USER_MODEL`, `REST_FRAMEWORK`, `DATABASES`, `CACHES`).

- [ ] **Step 1: Write `backend/requirements.txt`**

```
Django==5.1.4
djangorestframework==3.15.2
djangorestframework-simplejwt==5.3.1
psycopg[binary]==3.2.3
django-environ==0.11.2
pytest==8.3.3
pytest-django==4.9.0
```

- [ ] **Step 2: Write `.env.example`** (repo root)

```
DJANGO_SECRET_KEY=change-me-in-.env
DJANGO_DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
POSTGRES_DB=promiseshop
POSTGRES_USER=promiseshop
POSTGRES_PASSWORD=change-me-in-.env
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
REDIS_URL=redis://redis:6379/0
```

Copy it to `.env` in the same step (not committed — already covered by the repo's `.gitignore`):

```bash
cp .env.example .env
```

- [ ] **Step 3: Write `docker-compose.yml`** (repo root)

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  web:
    build: ./backend
    command: python manage.py runserver 0.0.0.0:8000
    volumes:
      - ./backend:/app
    ports:
      - "8000:8000"
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

volumes:
  postgres_data:
```

- [ ] **Step 4: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
```

- [ ] **Step 5: Write `backend/manage.py`**

```python
#!/usr/bin/env python
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Write `backend/config/__init__.py`** (empty file)

- [ ] **Step 7: Write `backend/config/settings.py`**

```python
from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "core",
    "accounts",
    "catalog",
    "purchasing",
    "sales",
    "stock",
    "finance",
    "notifications",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT"),
    }
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("REDIS_URL"),
    }
}

AUTH_USER_MODEL = "accounts.Employee"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "core.exceptions.custom_exception_handler",
}

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Kigali"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
```

- [ ] **Step 8: Write `backend/config/urls.py`**

```python
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
]
```

- [ ] **Step 9: Write `backend/config/wsgi.py`**

```python
import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_wsgi_application()
```

- [ ] **Step 10: Write `backend/config/asgi.py`**

```python
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
application = get_asgi_application()
```

- [ ] **Step 11: Write `backend/core/__init__.py`** (empty file)

- [ ] **Step 12: Write `backend/core/exceptions.py`**

```python
from rest_framework.views import exception_handler


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data.get("detail") if isinstance(response.data, dict) else None
    response.data = {
        "detail": detail or response.data,
        "code": getattr(exc, "default_code", "error"),
    }
    return response
```

- [ ] **Step 13: Write the failing test — `backend/core/tests/__init__.py`** (empty file) **and `backend/core/tests/test_health.py`**

```python
from rest_framework.test import APIClient


def test_health_endpoint_returns_ok():
    client = APIClient()
    response = client.get("/api/health/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 14: Write `backend/pytest.ini`**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings
python_files = test_*.py
testpaths = .
```

- [ ] **Step 15: Write `backend/core/views.py`**

```python
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})
```

- [ ] **Step 16: Write `backend/core/urls.py`**

```python
from django.urls import path
from core.views import health

urlpatterns = [
    path("health/", health, name="health"),
]
```

- [ ] **Step 17: Create empty app packages that `INSTALLED_APPS` references so Django can boot**

```bash
mkdir -p backend/accounts backend/catalog backend/purchasing backend/sales backend/stock backend/finance backend/notifications
for app in accounts catalog purchasing sales stock finance notifications; do
  touch "backend/$app/__init__.py"
  cat > "backend/$app/apps.py" <<PYEOF
from django.apps import AppConfig


class $(python3 -c "print('$app'.capitalize())")Config(AppConfig):
    default_auto_field = "django.db.models.AutoField"
    name = "$app"
PYEOF
done
```

(If a shell one-liner like the above is awkward in your environment, just hand-write each `backend/<app>/apps.py` individually with the matching `<App>Config` class name — `AccountsConfig`, `CatalogConfig`, `PurchasingConfig`, `SalesConfig`, `StockConfig`, `FinanceConfig`, `NotificationsConfig`.)

Each app package is otherwise empty (no `models.py` yet) until its own task below.

- [ ] **Step 18: Bring up Postgres and Redis, build the web image**

```bash
docker compose up -d postgres redis
docker compose build web
```

Expected: both containers report healthy/running (`docker compose ps`).

- [ ] **Step 19: Run the test to verify it fails first (no `runserver`/app wiring issue, just confirm the harness works)**

Run:
```bash
docker compose run --rm web pytest core/tests/test_health.py -v
```
Expected at this point: PASS (the view and urls were already written in steps 15-16 before this run — this step's real purpose is confirming the whole Docker + Django + pytest-django chain works end to end for the first time). If it fails, fix whichever of steps 1-17 caused it before proceeding.

- [ ] **Step 20: Run the full test suite once to confirm a clean baseline**

```bash
docker compose run --rm web pytest -v
```
Expected: 1 passed (`test_health_endpoint_returns_ok`).

- [ ] **Step 21: Commit**

```bash
git add docker-compose.yml .env.example backend/
git commit -m "Scaffold Django backend project with Docker Compose and health check"
```

---

## Task 2: `accounts` app — Employee custom user model

**Files:**
- Create: `backend/accounts/models.py`
- Create: `backend/accounts/managers.py`
- Create: `backend/accounts/admin.py`
- Create: `backend/accounts/migrations/__init__.py`
- Test: `backend/accounts/tests/__init__.py`
- Test: `backend/accounts/tests/test_models.py`

**Interfaces:**
- Consumes: nothing (first domain model; `config.settings.AUTH_USER_MODEL = "accounts.Employee"` already points here from Task 1).
- Produces: `accounts.models.Employee` with fields `employee_id, full_name, role, phone, email, username, password, hire_date, status, created_at`, properties `is_active`, `is_staff`, and `Employee.Role` / `Employee.Status` `TextChoices` classes — every later task that references an employee (FKs, auth) imports `from accounts.models import Employee`.

- [ ] **Step 1: Write the failing test — `backend/accounts/tests/__init__.py`** (empty) **and `backend/accounts/tests/test_models.py`**

```python
import pytest
from datetime import date
from accounts.models import Employee

pytestmark = pytest.mark.django_db


def test_create_user_hashes_password_and_check_password_works():
    employee = Employee.objects.create_user(
        username="e.mugisha",
        password="s3cret-pass",
        full_name="Eric Mugisha",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.SALES_STAFF,
    )
    assert employee.password != "s3cret-pass"
    assert employee.check_password("s3cret-pass")


def test_is_active_reflects_status():
    employee = Employee.objects.create_user(
        username="a.uwase",
        password="pw",
        full_name="Alice Uwase",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.ADMIN,
        status=Employee.Status.INACTIVE,
    )
    assert employee.is_active is False

    employee.status = Employee.Status.ACTIVE
    assert employee.is_active is True


def test_is_staff_reflects_admin_role_only():
    admin = Employee.objects.create_user(
        username="admin1", password="pw", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )
    staff = Employee.objects.create_user(
        username="staff1", password="pw", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )
    assert admin.is_staff is True
    assert staff.is_staff is False


def test_username_must_be_unique():
    Employee.objects.create_user(
        username="dupe", password="pw", full_name="First",
        hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
    )
    with pytest.raises(Exception):
        Employee.objects.create_user(
            username="dupe", password="pw", full_name="Second",
            hire_date=date(2025, 1, 1), role=Employee.Role.TECHNICIAN,
        )


def test_create_superuser_defaults_to_admin_role():
    superuser = Employee.objects.create_superuser(username="root", password="pw")
    assert superuser.role == Employee.Role.ADMIN
    assert superuser.is_staff is True
    assert superuser.is_superuser is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest accounts/tests/test_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'accounts.models'` (or similar import error).

- [ ] **Step 3: Write `backend/accounts/managers.py`**

```python
from django.contrib.auth.base_user import BaseUserManager
from datetime import date


class EmployeeManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError("Employees must have a username")
        if "full_name" not in extra_fields:
            raise ValueError("Employees must have a full_name")
        if "hire_date" not in extra_fields:
            raise ValueError("Employees must have a hire_date")

        employee = self.model(username=username, **extra_fields)
        employee.set_password(password)
        employee.save(using=self._db)
        return employee

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault("role", self.model.Role.ADMIN)
        extra_fields.setdefault("full_name", username)
        extra_fields.setdefault("hire_date", date.today())
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(username, password, **extra_fields)
```

- [ ] **Step 4: Write `backend/accounts/models.py`**

```python
from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models

from accounts.managers import EmployeeManager


class Employee(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        SALES_STAFF = "sales_staff", "Sales Staff"
        TECHNICIAN = "technician", "Technician"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        TERMINATED = "terminated", "Terminated"

    employee_id = models.AutoField(primary_key=True)
    full_name = models.CharField(max_length=120)
    role = models.CharField(max_length=30, choices=Role.choices)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, unique=True, blank=True, null=True)
    username = models.CharField(max_length=50, unique=True)
    # `password` is inherited from AbstractBaseUser — this IS the docx's
    # password_hash column; Django always stores it hashed.
    hire_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = EmployeeManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["full_name", "hire_date"]

    @property
    def is_active(self):
        return self.status == self.Status.ACTIVE

    @property
    def is_staff(self):
        return self.role == self.Role.ADMIN

    def __str__(self):
        return f"{self.full_name} ({self.username})"
```

- [ ] **Step 5: Write `backend/accounts/admin.py`**

```python
from django.contrib import admin
from accounts.models import Employee

admin.site.register(Employee)
```

- [ ] **Step 6: Create migrations directory marker**

```bash
mkdir -p backend/accounts/migrations
touch backend/accounts/migrations/__init__.py
```

- [ ] **Step 7: Generate and apply the migration**

```bash
docker compose run --rm web python manage.py makemigrations accounts
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 8: Run test to verify it passes**

Run: `docker compose run --rm web pytest accounts/tests/test_models.py -v`
Expected: 5 passed.

- [ ] **Step 9: Commit**

```bash
git add backend/accounts/
git commit -m "Add Employee custom user model with role/status and password hashing"
```

---

## Task 3: JWT auth — login and refresh endpoints

**Files:**
- Create: `backend/accounts/serializers.py` (auth-related serializer only in this task; `EmployeeSerializer` for CRUD comes in Task 4)
- Create: `backend/accounts/views.py` (auth views only in this task)
- Modify: `backend/config/urls.py`
- Test: `backend/accounts/tests/test_auth_api.py`

**Interfaces:**
- Consumes: `accounts.models.Employee` (Task 2).
- Produces: `POST /api/auth/login/` → `{access, refresh, role}` on success, 401 on bad credentials. `POST /api/auth/refresh/` → `{access}`. Every later authenticated-API test uses `POST /api/auth/login/` to obtain a token.

- [ ] **Step 1: Write the failing test — `backend/accounts/tests/test_auth_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="e.mugisha",
        password="s3cret-pass",
        full_name="Eric Mugisha",
        hire_date=date(2025, 1, 15),
        role=Employee.Role.SALES_STAFF,
    )


def test_login_with_valid_credentials_returns_tokens_and_role(employee):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "s3cret-pass"},
        format="json",
    )
    assert response.status_code == 200
    body = response.json()
    assert "access" in body
    assert "refresh" in body
    assert body["role"] == Employee.Role.SALES_STAFF


def test_login_with_invalid_credentials_returns_401(employee):
    client = APIClient()
    response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "wrong-pass"},
        format="json",
    )
    assert response.status_code == 401


def test_refresh_issues_new_access_token(employee):
    client = APIClient()
    login_response = client.post(
        "/api/auth/login/",
        {"username": "e.mugisha", "password": "s3cret-pass"},
        format="json",
    )
    refresh_token = login_response.json()["refresh"]

    refresh_response = client.post(
        "/api/auth/refresh/", {"refresh": refresh_token}, format="json"
    )
    assert refresh_response.status_code == 200
    assert "access" in refresh_response.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest accounts/tests/test_auth_api.py -v`
Expected: FAIL — `/api/auth/login/` returns 404 (not yet routed).

- [ ] **Step 3: Write `backend/accounts/serializers.py`**

```python
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class EmployeeTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["role"] = self.user.role
        return data
```

- [ ] **Step 4: Write `backend/accounts/views.py`**

```python
from rest_framework_simplejwt.views import TokenObtainPairView

from accounts.serializers import EmployeeTokenObtainPairSerializer


class EmployeeTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmployeeTokenObtainPairSerializer
```

- [ ] **Step 5: Wire URLs in `backend/config/urls.py`**

```python
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import EmployeeTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/auth/login/", EmployeeTokenObtainPairView.as_view(), name="auth-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
]
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest accounts/tests/test_auth_api.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/accounts/serializers.py backend/accounts/views.py backend/config/urls.py backend/accounts/tests/test_auth_api.py
git commit -m "Add JWT login/refresh endpoints returning employee role"
```

---

## Task 4: RBAC permissions + Employee CRUD API (Admin only)

**Files:**
- Create: `backend/accounts/permissions.py`
- Modify: `backend/accounts/serializers.py` (add `EmployeeSerializer`)
- Modify: `backend/accounts/views.py` (add `EmployeeViewSet`)
- Create: `backend/accounts/urls.py`
- Modify: `backend/config/urls.py`
- Test: `backend/accounts/tests/test_employee_api.py`

**Interfaces:**
- Consumes: `accounts.models.Employee` (Task 2), auth endpoints (Task 3) for obtaining tokens in tests.
- Produces: `accounts.permissions.IsAdmin` (a DRF `BasePermission` subclass) — imported by every later task that needs an admin-only gate, including the `catalog` pricing task. `GET/POST/PUT/PATCH/DELETE /api/employees/` and `/api/employees/{employee_id}/`.

- [ ] **Step 1: Write the failing test — `backend/accounts/tests/test_employee_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_admin_can_list_employees(admin, sales_staff):
    client = auth_client(admin, "adminpass")
    response = client.get("/api/employees/")
    assert response.status_code == 200
    assert response.json()["count"] == 2


def test_admin_can_create_employee(admin):
    client = auth_client(admin, "adminpass")
    response = client.post(
        "/api/employees/",
        {
            "username": "t.nkurunziza",
            "password": "newpass123",
            "full_name": "Tom Nkurunziza",
            "hire_date": "2026-01-10",
            "role": Employee.Role.TECHNICIAN,
        },
        format="json",
    )
    assert response.status_code == 201
    body = response.json()
    assert "password" not in body
    created = Employee.objects.get(username="t.nkurunziza")
    assert created.check_password("newpass123")


def test_non_admin_gets_403_listing_employees(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    response = client.get("/api/employees/")
    assert response.status_code == 403


def test_non_admin_gets_403_creating_employee(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/employees/",
        {
            "username": "should.fail",
            "password": "pw",
            "full_name": "Nope",
            "hire_date": "2026-01-10",
            "role": Employee.Role.TECHNICIAN,
        },
        format="json",
    )
    assert response.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest accounts/tests/test_employee_api.py -v`
Expected: FAIL — `/api/employees/` returns 404.

- [ ] **Step 3: Write `backend/accounts/permissions.py`**

```python
from rest_framework.permissions import BasePermission
from accounts.models import Employee


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == Employee.Role.ADMIN
        )
```

- [ ] **Step 4: Add `EmployeeSerializer` to `backend/accounts/serializers.py`**

```python
from rest_framework import serializers
from accounts.models import Employee


class EmployeeSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = Employee
        fields = [
            "employee_id", "full_name", "role", "phone", "email",
            "username", "password", "hire_date", "status", "created_at",
        ]
        read_only_fields = ["employee_id", "created_at"]

    def create(self, validated_data):
        password = validated_data.pop("password")
        return Employee.objects.create_user(password=password, **validated_data)

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance
```

- [ ] **Step 5: Add `EmployeeViewSet` to `backend/accounts/views.py`**

```python
from rest_framework import viewsets

from accounts.models import Employee
from accounts.permissions import IsAdmin
from accounts.serializers import EmployeeSerializer


class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all().order_by("employee_id")
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdmin]
```

- [ ] **Step 6: Write `backend/accounts/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from accounts.views import EmployeeViewSet

router = DefaultRouter()
router.register("employees", EmployeeViewSet, basename="employee")

urlpatterns = router.urls
```

- [ ] **Step 7: Wire into `backend/config/urls.py`**

```python
from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

from accounts.views import EmployeeTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("accounts.urls")),
    path("api/auth/login/", EmployeeTokenObtainPairView.as_view(), name="auth-login"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
]
```

- [ ] **Step 8: Run test to verify it passes**

Run: `docker compose run --rm web pytest accounts/tests/test_employee_api.py -v`
Expected: 4 passed.

- [ ] **Step 9: Run the full accounts test suite to confirm no regressions**

Run: `docker compose run --rm web pytest accounts/ -v`
Expected: 12 passed (5 model + 3 auth + 4 employee API).

- [ ] **Step 10: Commit**

```bash
git add backend/accounts/
git commit -m "Add IsAdmin permission and admin-only Employee CRUD API"
```

---

## Task 5: `catalog` app — Category model + CRUD API

**Files:**
- Create: `backend/catalog/models.py` (Category only in this task; Product/ProductPricing added in Tasks 6-7)
- Create: `backend/catalog/serializers.py` (CategorySerializer only)
- Create: `backend/catalog/views.py` (CategoryViewSet only)
- Create: `backend/catalog/urls.py`
- Create: `backend/catalog/admin.py`
- Modify: `backend/config/urls.py`
- Create: `backend/catalog/migrations/__init__.py`
- Test: `backend/catalog/tests/__init__.py`
- Test: `backend/catalog/tests/test_category_api.py`

**Interfaces:**
- Consumes: `accounts.models.Employee` (Task 2, for auth in tests).
- Produces: `catalog.models.Category` with fields `category_id, name, code, description` — imported by `catalog.models.Product` (Task 6) via `ForeignKey("catalog.Category", ...)`.

- [ ] **Step 1: Write the failing test — `backend/catalog/tests/__init__.py`** (empty) **and `backend/catalog/tests/test_category_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_authenticated_employee_can_create_and_list_categories(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/categories/", {"name": "Audio", "code": "AUD", "description": "Speakers, mics"},
        format="json",
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/categories/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/categories/")
    assert response.status_code == 401


def test_duplicate_code_rejected(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    client.post("/api/categories/", {"name": "Audio", "code": "AUD"}, format="json")
    response = client.post("/api/categories/", {"name": "Audio Two", "code": "AUD"}, format="json")
    assert response.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest catalog/tests/test_category_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalog.models'`.

- [ ] **Step 3: Write `backend/catalog/models.py`**

```python
from django.db import models


class Category(models.Model):
    category_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=80, unique=True)
    code = models.CharField(max_length=10, unique=True)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name
```

- [ ] **Step 4: Write `backend/catalog/serializers.py`**

```python
from rest_framework import serializers
from catalog.models import Category


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["category_id", "name", "code", "description"]
        read_only_fields = ["category_id"]
```

- [ ] **Step 5: Write `backend/catalog/views.py`**

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from catalog.models import Category
from catalog.serializers import CategorySerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("category_id")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
```

- [ ] **Step 6: Write `backend/catalog/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from catalog.views import CategoryViewSet

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")

urlpatterns = router.urls
```

- [ ] **Step 7: Write `backend/catalog/admin.py`**

```python
from django.contrib import admin
from catalog.models import Category

admin.site.register(Category)
```

- [ ] **Step 8: Wire into `backend/config/urls.py`** — add `path("api/", include("catalog.urls")),` to the `urlpatterns` list alongside the existing includes.

- [ ] **Step 9: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/catalog/migrations
touch backend/catalog/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations catalog
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 10: Run test to verify it passes**

Run: `docker compose run --rm web pytest catalog/tests/test_category_api.py -v`
Expected: 3 passed.

- [ ] **Step 11: Commit**

```bash
git add backend/catalog/
git commit -m "Add Category model and authenticated CRUD API"
```

---

## Task 6: `catalog` app — Product model + barcode generation service + CRUD API

**Files:**
- Modify: `backend/catalog/models.py` (add `Product`)
- Create: `backend/catalog/services.py`
- Modify: `backend/catalog/serializers.py` (add `ProductSerializer`)
- Modify: `backend/catalog/views.py` (add `ProductViewSet`)
- Modify: `backend/catalog/urls.py`
- Modify: `backend/catalog/admin.py`
- Test: `backend/catalog/tests/test_barcode_service.py`
- Test: `backend/catalog/tests/test_product_api.py`

**Interfaces:**
- Consumes: `catalog.models.Category` (Task 5).
- Produces: `catalog.models.Product` (imported by `purchasing.models.PurchaseItem`, `sales.models.SaleItem`, `stock.models.Inventory`/`EquipmentUnit`, and `catalog.models.ProductPricing` in later tasks). `catalog.services.generate_barcode(category: Category) -> str` — must be called inside a transaction; imported wherever a `Product` is created.

- [ ] **Step 1: Write the failing test — `backend/catalog/tests/test_barcode_service.py`**

```python
import pytest
from django.db import transaction
from catalog.models import Category, Product
from catalog.services import generate_barcode

pytestmark = pytest.mark.django_db


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def make_product(category, barcode, name="Some product"):
    return Product.objects.create(
        category=category, barcode=barcode, name=name,
    )


def test_first_barcode_in_category_is_00001(category):
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00001"


def test_next_barcode_increments_from_max_existing(category):
    make_product(category, "PES-AUD-00001")
    make_product(category, "PES-AUD-00147")
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00148"


def test_barcode_does_not_reuse_number_after_deletion(category):
    p1 = make_product(category, "PES-AUD-00001")
    make_product(category, "PES-AUD-00002")
    p1.delete()
    with transaction.atomic():
        barcode = generate_barcode(category)
    assert barcode == "PES-AUD-00003"


def test_sequential_calls_produce_distinct_barcodes(category):
    with transaction.atomic():
        first = generate_barcode(category)
        make_product(category, first)
        second = generate_barcode(category)
    assert first != second
    assert second == "PES-AUD-00002"


def test_different_categories_have_independent_sequences():
    audio = Category.objects.create(name="Audio", code="AUD")
    tv = Category.objects.create(name="Televisions", code="TV")
    make_product(audio, "PES-AUD-00005")
    with transaction.atomic():
        tv_barcode = generate_barcode(tv)
    assert tv_barcode == "PES-TV-00001"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest catalog/tests/test_barcode_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'catalog.services'` (and `Product` doesn't exist yet either).

- [ ] **Step 3: Add `Product` to `backend/catalog/models.py`** (append below `Category`)

```python
class Product(models.Model):
    product_id = models.AutoField(primary_key=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    barcode = models.CharField(max_length=50, unique=True, editable=False)
    name = models.CharField(max_length=150)
    brand = models.CharField(max_length=80, blank=True, null=True)
    model_number = models.CharField(max_length=80, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    specifications = models.TextField(blank=True, null=True)
    usage_instructions = models.TextField(blank=True, null=True)
    warranty_months = models.PositiveIntegerField(default=0)
    reorder_level = models.PositiveIntegerField(default=5)
    unit = models.CharField(max_length=20, default="pcs")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.barcode})"
```

- [ ] **Step 4: Write `backend/catalog/services.py`**

```python
import re
from django.db import transaction

from catalog.models import Category, Product

BARCODE_PATTERN = re.compile(r"-(\d{5})$")


def generate_barcode(category: Category) -> str:
    """Compute the next shop-assigned barcode for a category.

    Must be called inside a transaction. Locks the category row so two
    concurrent product creations in the same category can't compute the
    same next number.
    """
    locked_category = Category.objects.select_for_update().get(pk=category.pk)

    max_suffix = 0
    for barcode in Product.objects.filter(category=locked_category).values_list(
        "barcode", flat=True
    ):
        match = BARCODE_PATTERN.search(barcode)
        if match:
            max_suffix = max(max_suffix, int(match.group(1)))

    next_number = max_suffix + 1
    return f"PES-{locked_category.code}-{next_number:05d}"
```

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose run --rm web pytest catalog/tests/test_barcode_service.py -v`

Note: this will still fail at this point because `Product` migrations don't exist yet — generate and apply them first:

```bash
docker compose run --rm web python manage.py makemigrations catalog
docker compose run --rm web python manage.py migrate
docker compose run --rm web pytest catalog/tests/test_barcode_service.py -v
```
Expected: 5 passed.

- [ ] **Step 6: Write the failing test — `backend/catalog/tests/test_product_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def category():
    return Category.objects.create(name="Audio", code="AUD")


def test_creating_product_auto_assigns_barcode(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {
            "category": category.category_id,
            "name": "JBL Flip 6 Speaker",
            "brand": "JBL",
            "model_number": "JBLFLIP6BLK",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["barcode"] == "PES-AUD-00001"


def test_second_product_in_same_category_gets_next_number(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    client.post("/api/products/", {"category": category.category_id, "name": "First"}, format="json")
    response = client.post(
        "/api/products/", {"category": category.category_id, "name": "Second"}, format="json"
    )
    assert response.json()["barcode"] == "PES-AUD-00002"


def test_submitted_barcode_is_ignored(sales_staff, category):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/products/",
        {"category": category.category_id, "name": "Sneaky", "barcode": "HACKED-00001"},
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["barcode"] == "PES-AUD-00001"
```

- [ ] **Step 7: Run test to verify it fails**

Run: `docker compose run --rm web pytest catalog/tests/test_product_api.py -v`
Expected: FAIL — `/api/products/` returns 404.

- [ ] **Step 8: Add `ProductSerializer` to `backend/catalog/serializers.py`**

```python
from catalog.models import Product


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            "product_id", "category", "barcode", "name", "brand", "model_number",
            "description", "specifications", "usage_instructions", "warranty_months",
            "reorder_level", "unit", "is_active", "created_at",
        ]
        read_only_fields = ["product_id", "barcode", "created_at"]
```

- [ ] **Step 9: Add `ProductViewSet` to `backend/catalog/views.py`**

```python
from django.db import transaction

from catalog.models import Product
from catalog.serializers import ProductSerializer
from catalog.services import generate_barcode


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("product_id")
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        with transaction.atomic():
            category = serializer.validated_data["category"]
            barcode = generate_barcode(category)
            serializer.save(barcode=barcode)
```

- [ ] **Step 10: Register in `backend/catalog/urls.py`** — add `router.register("products", ProductViewSet, basename="product")` after the categories registration, and import `ProductViewSet`.

- [ ] **Step 11: Register in `backend/catalog/admin.py`** — add `admin.site.register(Product)`.

- [ ] **Step 12: Run test to verify it passes**

Run: `docker compose run --rm web pytest catalog/tests/test_product_api.py -v`
Expected: 3 passed.

- [ ] **Step 13: Run the full catalog suite to confirm no regressions**

Run: `docker compose run --rm web pytest catalog/ -v`
Expected: 11 passed (3 category API + 5 barcode service + 3 product API).

- [ ] **Step 14: Commit**

```bash
git add backend/catalog/
git commit -m "Add Product model with system-generated barcode and CRUD API"
```

---

## Task 7: `catalog` app — ProductPricing model + wholesale-masking serializer + CRUD API

**Files:**
- Modify: `backend/catalog/models.py` (add `ProductPricing`)
- Modify: `backend/catalog/serializers.py` (add `ProductPricingSerializer`)
- Modify: `backend/catalog/views.py` (add `ProductPricingViewSet`)
- Modify: `backend/catalog/urls.py`
- Modify: `backend/catalog/admin.py`
- Test: `backend/catalog/tests/test_product_pricing_api.py`

**Interfaces:**
- Consumes: `catalog.models.Product` (Task 6), `accounts.models.Employee.Role` (Task 2).
- Produces: `catalog.models.ProductPricing` with `is_current`-flip-on-create behavior. Endpoint: `GET/POST /api/product-pricing/?product=<product_id>`.

- [ ] **Step 1: Write the failing test — `backend/catalog/tests/test_product_pricing_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee
from catalog.models import Category, Product, ProductPricing

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_admin_sees_wholesale_price(admin, product):
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    client = auth_client(admin, "adminpass")
    response = client.get(f"/api/product-pricing/?product={product.product_id}")
    assert response.status_code == 200
    assert response.json()["results"][0]["wholesale_price"] == "108000.00"


def test_non_admin_does_not_see_wholesale_price(sales_staff, product):
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    client = auth_client(sales_staff, "staffpass")
    response = client.get(f"/api/product-pricing/?product={product.product_id}")
    assert response.status_code == 200
    assert "wholesale_price" not in response.json()["results"][0]


def test_non_admin_submitting_wholesale_price_is_rejected(sales_staff, product):
    client = auth_client(sales_staff, "staffpass")
    response = client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "100000.00",
            "retail_price": "145000.00",
            "effective_date": "2026-01-01",
        },
        format="json",
    )
    assert response.status_code == 403


def test_new_pricing_row_flips_previous_current_to_false(admin, product):
    client = auth_client(admin, "adminpass")
    client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "108000.00",
            "retail_price": "145000.00",
            "effective_date": "2026-01-01",
        },
        format="json",
    )
    first = ProductPricing.objects.get(product=product)
    assert first.is_current is True

    client.post(
        "/api/product-pricing/",
        {
            "product": product.product_id,
            "wholesale_price": "110000.00",
            "retail_price": "150000.00",
            "effective_date": "2026-06-01",
        },
        format="json",
    )
    first.refresh_from_db()
    assert first.is_current is False
    second = ProductPricing.objects.exclude(pk=first.pk).get(product=product)
    assert second.is_current is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest catalog/tests/test_product_pricing_api.py -v`
Expected: FAIL — `ImportError: cannot import name 'ProductPricing'`.

- [ ] **Step 3: Add `ProductPricing` to `backend/catalog/models.py`** (append below `Product`)

```python
class ProductPricing(models.Model):
    price_id = models.AutoField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="pricing_history")
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2)
    retail_price = models.DecimalField(max_digits=12, decimal_places=2)
    effective_date = models.DateField()
    is_current = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.product} @ {self.effective_date}"
```

- [ ] **Step 4: Generate and apply migration**

```bash
docker compose run --rm web python manage.py makemigrations catalog
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 5: Add `ProductPricingSerializer` to `backend/catalog/serializers.py`**

```python
from catalog.models import ProductPricing


class ProductPricingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductPricing
        fields = ["price_id", "product", "wholesale_price", "retail_price", "effective_date", "is_current"]
        read_only_fields = ["price_id", "is_current"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_admin = bool(
            request and request.user.is_authenticated
            and request.user.role == request.user.Role.ADMIN
        )
        if not is_admin:
            data.pop("wholesale_price", None)
        return data
```

- [ ] **Step 6: Add `ProductPricingViewSet` to `backend/catalog/views.py`**

```python
from rest_framework.exceptions import PermissionDenied

from catalog.models import ProductPricing
from catalog.serializers import ProductPricingSerializer


class ProductPricingViewSet(viewsets.ModelViewSet):
    serializer_class = ProductPricingSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = ProductPricing.objects.all().order_by("-effective_date")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def perform_create(self, serializer):
        is_admin = self.request.user.role == self.request.user.Role.ADMIN
        if "wholesale_price" in self.request.data and not is_admin:
            raise PermissionDenied("Only Admin can set wholesale_price.")

        with transaction.atomic():
            product = serializer.validated_data["product"]
            ProductPricing.objects.filter(product=product, is_current=True).update(is_current=False)
            serializer.save(is_current=True)
```

- [ ] **Step 7: Register in `backend/catalog/urls.py`** — import `ProductPricingViewSet` and add `router.register("product-pricing", ProductPricingViewSet, basename="product-pricing")`.

- [ ] **Step 8: Register in `backend/catalog/admin.py`** — add `admin.site.register(ProductPricing)`.

- [ ] **Step 9: Run test to verify it passes**

Run: `docker compose run --rm web pytest catalog/tests/test_product_pricing_api.py -v`
Expected: 4 passed.

- [ ] **Step 10: Run the full catalog suite**

Run: `docker compose run --rm web pytest catalog/ -v`
Expected: 15 passed.

- [ ] **Step 11: Commit**

```bash
git add backend/catalog/
git commit -m "Add ProductPricing model with wholesale masking and price-history flip logic"
```

---

## Task 8: `purchasing` app — Supplier model + CRUD API

**Files:**
- Create: `backend/purchasing/models.py` (Supplier only in this task; Purchase/PurchaseItem in Task 10)
- Create: `backend/purchasing/serializers.py`
- Create: `backend/purchasing/views.py`
- Create: `backend/purchasing/urls.py`
- Create: `backend/purchasing/admin.py`
- Create: `backend/purchasing/migrations/__init__.py`
- Test: `backend/purchasing/tests/__init__.py`
- Test: `backend/purchasing/tests/test_supplier_api.py`

**Interfaces:**
- Consumes: nothing new (auth from Task 2/3).
- Produces: `purchasing.models.Supplier` — imported by `purchasing.models.Purchase` (Task 10) via FK.

- [ ] **Step 1: Write the failing test — `backend/purchasing/tests/__init__.py`** (empty) **and `backend/purchasing/tests/test_supplier_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_authenticated_employee_can_create_and_list_suppliers(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    create_response = client.post(
        "/api/suppliers/",
        {"name": "Kigali Electronics Ltd", "contact_person": "J. Habimana", "phone": "0788000000"},
        format="json",
    )
    assert create_response.status_code == 201

    list_response = client.get("/api/suppliers/")
    assert list_response.status_code == 200
    assert list_response.json()["count"] == 1


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/suppliers/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest purchasing/tests/test_supplier_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'purchasing.models'`.

- [ ] **Step 3: Write `backend/purchasing/models.py`**

```python
from django.db import models


class Supplier(models.Model):
    supplier_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name
```

- [ ] **Step 4: Write `backend/purchasing/serializers.py`**

```python
from rest_framework import serializers
from purchasing.models import Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["supplier_id", "name", "contact_person", "phone", "email", "address"]
        read_only_fields = ["supplier_id"]
```

- [ ] **Step 5: Write `backend/purchasing/views.py`**

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from purchasing.models import Supplier
from purchasing.serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by("supplier_id")
    serializer_class = SupplierSerializer
    permission_classes = [IsAuthenticated]
```

- [ ] **Step 6: Write `backend/purchasing/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from purchasing.views import SupplierViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")

urlpatterns = router.urls
```

- [ ] **Step 7: Write `backend/purchasing/admin.py`**

```python
from django.contrib import admin
from purchasing.models import Supplier

admin.site.register(Supplier)
```

- [ ] **Step 8: Wire into `backend/config/urls.py`** — add `path("api/", include("purchasing.urls")),`.

- [ ] **Step 9: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/purchasing/migrations
touch backend/purchasing/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations purchasing
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 10: Run test to verify it passes**

Run: `docker compose run --rm web pytest purchasing/tests/test_supplier_api.py -v`
Expected: 2 passed.

- [ ] **Step 11: Commit**

```bash
git add backend/purchasing/
git commit -m "Add Supplier model and authenticated CRUD API"
```

---

## Task 9: `sales` app — Customer model + CRUD API

**Files:**
- Create: `backend/sales/models.py` (Customer only in this task; Sale/SaleItem in Task 11)
- Create: `backend/sales/serializers.py`
- Create: `backend/sales/views.py`
- Create: `backend/sales/urls.py`
- Create: `backend/sales/admin.py`
- Create: `backend/sales/migrations/__init__.py`
- Test: `backend/sales/tests/__init__.py`
- Test: `backend/sales/tests/test_customer_api.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `sales.models.Customer` — imported by `sales.models.Sale` (Task 11) via FK, nullable (walk-in sales).

- [ ] **Step 1: Write the failing test — `backend/sales/tests/__init__.py`** (empty) **and `backend/sales/tests/test_customer_api.py`**

```python
import pytest
from datetime import date
from rest_framework.test import APIClient
from accounts.models import Employee

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
def sales_staff():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


def test_authenticated_employee_can_create_customer_with_minimal_fields(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    response = client.post("/api/customers/", {}, format="json")
    assert response.status_code == 201


def test_authenticated_employee_can_create_and_list_customers(sales_staff):
    client = auth_client(sales_staff, "staffpass")
    client.post("/api/customers/", {"name": "Jean Claude", "phone": "0788123456"}, format="json")
    response = client.get("/api/customers/")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_unauthenticated_request_gets_401():
    client = APIClient()
    response = client.get("/api/customers/")
    assert response.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest sales/tests/test_customer_api.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sales.models'`.

- [ ] **Step 3: Write `backend/sales/models.py`**

```python
from django.db import models


class Customer(models.Model):
    customer_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=120, blank=True, null=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(max_length=120, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name or f"Walk-in customer #{self.customer_id}"
```

- [ ] **Step 4: Write `backend/sales/serializers.py`**

```python
from rest_framework import serializers
from sales.models import Customer


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["customer_id", "name", "phone", "email", "address"]
        read_only_fields = ["customer_id"]
```

- [ ] **Step 5: Write `backend/sales/views.py`**

```python
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from sales.models import Customer
from sales.serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("customer_id")
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
```

- [ ] **Step 6: Write `backend/sales/urls.py`**

```python
from rest_framework.routers import DefaultRouter
from sales.views import CustomerViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet, basename="customer")

urlpatterns = router.urls
```

- [ ] **Step 7: Write `backend/sales/admin.py`**

```python
from django.contrib import admin
from sales.models import Customer

admin.site.register(Customer)
```

- [ ] **Step 8: Wire into `backend/config/urls.py`** — add `path("api/", include("sales.urls")),`.

- [ ] **Step 9: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/sales/migrations
touch backend/sales/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations sales
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 10: Run test to verify it passes**

Run: `docker compose run --rm web pytest sales/tests/test_customer_api.py -v`
Expected: 3 passed.

- [ ] **Step 11: Commit**

```bash
git add backend/sales/
git commit -m "Add Customer model and authenticated CRUD API"
```

---

## Task 10: `purchasing` app — Purchase + PurchaseItem models (schema only)

**Files:**
- Modify: `backend/purchasing/models.py` (add `Purchase`, `PurchaseItem`)
- Modify: `backend/purchasing/admin.py`
- Test: `backend/purchasing/tests/test_models.py`

**Interfaces:**
- Consumes: `purchasing.models.Supplier` (Task 8), `accounts.models.Employee` (Task 2), `catalog.models.Product` (Task 6).
- Produces: `purchasing.models.Purchase`, `purchasing.models.PurchaseItem` — no API in Phase 1; a later purchasing-flow phase adds endpoints and the receive-stock business logic.

- [ ] **Step 1: Write the failing test — `backend/purchasing/tests/test_models.py`**

```python
import pytest
from datetime import date
from django.db import IntegrityError
from accounts.models import Employee
from catalog.models import Category, Product
from purchasing.models import Supplier, Purchase, PurchaseItem

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
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_create_purchase_with_default_payment_status(employee, supplier):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
        total_paid="500000.00", total_invoiced="500000.00",
    )
    assert purchase.payment_status == Purchase.PaymentStatus.PAID


def test_purchase_item_requires_valid_purchase_and_product(employee, supplier, product):
    purchase = Purchase.objects.create(
        supplier=supplier, employee=employee, purchase_date=date(2026, 1, 1),
        total_paid="145000.00", total_invoiced="145000.00",
    )
    item = PurchaseItem.objects.create(
        purchase=purchase, product=product, quantity=1,
        unit_cost_paid="108000.00", unit_cost_invoiced="112000.00",
        subtotal_paid="108000.00", subtotal_invoiced="112000.00",
    )
    assert item.purchase == purchase
    assert item.product == product


def test_purchase_item_cannot_be_created_without_purchase(product):
    with pytest.raises(IntegrityError):
        PurchaseItem.objects.create(
            purchase=None, product=product, quantity=1,
            unit_cost_paid="1.00", unit_cost_invoiced="1.00",
            subtotal_paid="1.00", subtotal_invoiced="1.00",
        )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest purchasing/tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'Purchase'`.

- [ ] **Step 3: Add `Purchase` and `PurchaseItem` to `backend/purchasing/models.py`** (append below `Supplier`)

```python
class Purchase(models.Model):
    class PaymentStatus(models.TextChoices):
        PAID = "paid", "Paid"
        PARTIAL = "partial", "Partial"
        UNPAID = "unpaid", "Unpaid"

    purchase_id = models.AutoField(primary_key=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="purchases")
    invoice_number = models.CharField(max_length=60, blank=True, null=True)
    purchase_date = models.DateField()
    total_paid = models.DecimalField(max_digits=12, decimal_places=2)
    total_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    payment_status = models.CharField(
        max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PAID
    )

    def __str__(self):
        return f"Purchase #{self.purchase_id} - {self.supplier}"


class PurchaseItem(models.Model):
    purchase_item_id = models.AutoField(primary_key=True)
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="purchase_items")
    quantity = models.PositiveIntegerField()
    unit_cost_paid = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost_invoiced = models.DecimalField(max_digits=12, decimal_places=2)
    price_discrepancy_note = models.TextField(blank=True, null=True)
    subtotal_paid = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal_invoiced = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product} x{self.quantity} (Purchase #{self.purchase_id})"
```

- [ ] **Step 4: Generate and apply migration**

```bash
docker compose run --rm web python manage.py makemigrations purchasing
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 5: Register in `backend/purchasing/admin.py`** — add `admin.site.register(Purchase)` and `admin.site.register(PurchaseItem)`.

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest purchasing/tests/test_models.py -v`
Expected: 3 passed.

- [ ] **Step 7: Run the full purchasing suite**

Run: `docker compose run --rm web pytest purchasing/ -v`
Expected: 5 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/purchasing/
git commit -m "Add Purchase and PurchaseItem schema (models only, no API yet)"
```

---

## Task 11: `sales` app — Sale + SaleItem models (schema only)

**Files:**
- Modify: `backend/sales/models.py` (add `Sale`, `SaleItem`)
- Modify: `backend/sales/admin.py`
- Test: `backend/sales/tests/test_models.py`

**Interfaces:**
- Consumes: `sales.models.Customer` (Task 9), `accounts.models.Employee` (Task 2), `catalog.models.Product` (Task 6).
- Produces: `sales.models.Sale`, `sales.models.SaleItem` — no API in Phase 1. `sales.models.Sale` is also imported by `notifications.models.NotificationLog` (Task 14).

- [ ] **Step 1: Write the failing test — `backend/sales/tests/test_models.py`**

```python
import pytest
from datetime import date
from accounts.models import Employee
from catalog.models import Category, Product
from sales.models import Customer, Sale, SaleItem

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_sale_allows_null_customer_for_walk_in(employee):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    assert sale.customer is None
    assert sale.status == Sale.SaleStatus.COMPLETED


def test_sale_with_customer(employee):
    customer = Customer.objects.create(name="Jean Claude")
    sale = Sale.objects.create(employee=employee, customer=customer, total_amount="145000.00")
    assert sale.customer == customer


def test_sale_item_links_sale_and_product(employee, product):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    item = SaleItem.objects.create(
        sale=sale, product=product, quantity=1, unit_price="145000.00", subtotal="145000.00"
    )
    assert item.sale == sale
    assert item.product == product
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest sales/tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'Sale'`.

- [ ] **Step 3: Add `Sale` and `SaleItem` to `backend/sales/models.py`** (append below `Customer`)

```python
class Sale(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        MOBILE_MONEY = "mobile_money", "Mobile Money"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"

    class SaleStatus(models.TextChoices):
        COMPLETED = "completed", "Completed"
        RETURNED = "returned", "Returned"
        CANCELLED = "cancelled", "Cancelled"

    sale_id = models.AutoField(primary_key=True)
    customer = models.ForeignKey(
        Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales"
    )
    employee = models.ForeignKey("accounts.Employee", on_delete=models.PROTECT, related_name="sales")
    sale_date = models.DateTimeField(auto_now_add=True)
    payment_method = models.CharField(
        max_length=30, choices=PaymentMethod.choices, blank=True, null=True
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=SaleStatus.choices, default=SaleStatus.COMPLETED)

    def __str__(self):
        return f"Sale #{self.sale_id}"


class SaleItem(models.Model):
    sale_item_id = models.AutoField(primary_key=True)
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="sale_items")
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    def __str__(self):
        return f"{self.product} x{self.quantity} (Sale #{self.sale_id})"
```

- [ ] **Step 4: Generate and apply migration**

```bash
docker compose run --rm web python manage.py makemigrations sales
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 5: Register in `backend/sales/admin.py`** — add `admin.site.register(Sale)` and `admin.site.register(SaleItem)`.

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest sales/tests/test_models.py -v`
Expected: 3 passed.

- [ ] **Step 7: Run the full sales suite**

Run: `docker compose run --rm web pytest sales/ -v`
Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/sales/
git commit -m "Add Sale and SaleItem schema (models only, no API yet)"
```

---

## Task 12: `stock` app — Inventory, EquipmentUnit, EquipmentStatusHistory (schema only)

**Files:**
- Create: `backend/stock/models.py`
- Create: `backend/stock/admin.py`
- Create: `backend/stock/migrations/__init__.py`
- Test: `backend/stock/tests/__init__.py`
- Test: `backend/stock/tests/test_models.py`

**Interfaces:**
- Consumes: `catalog.models.Product` (Task 6), `accounts.models.Employee` (Task 2).
- Produces: `stock.models.Inventory`, `stock.models.EquipmentUnit`, `stock.models.EquipmentStatusHistory` — no API in Phase 1; a later stock/equipment phase adds endpoints and audit-trail write logic.

- [ ] **Step 1: Write the failing test — `backend/stock/tests/__init__.py`** (empty) **and `backend/stock/tests/test_models.py`**

```python
import pytest
from datetime import date
from django.db import IntegrityError
from accounts.models import Employee
from catalog.models import Category, Product
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="staff1", password="staffpass", full_name="Staff One",
        hire_date=date(2025, 1, 1), role=Employee.Role.SALES_STAFF,
    )


@pytest.fixture
def product():
    category = Category.objects.create(name="Audio", code="AUD")
    return Product.objects.create(category=category, barcode="PES-AUD-00001", name="JBL Flip 6")


def test_inventory_is_one_per_product(product):
    Inventory.objects.create(product=product, quantity_in_stock=10)
    with pytest.raises(IntegrityError):
        Inventory.objects.create(product=product, quantity_in_stock=5)


def test_equipment_unit_serial_number_must_be_unique(product):
    EquipmentUnit.objects.create(
        product=product, serial_number="JBL6-KX2093", status=EquipmentUnit.UnitStatus.IN_STOCK
    )
    with pytest.raises(IntegrityError):
        EquipmentUnit.objects.create(
            product=product, serial_number="JBL6-KX2093", status=EquipmentUnit.UnitStatus.IN_STOCK
        )


def test_equipment_status_history_chain(product, employee):
    unit = EquipmentUnit.objects.create(
        product=product, serial_number="JBL6-KX2094", status=EquipmentUnit.UnitStatus.IN_STOCK
    )
    history = EquipmentStatusHistory.objects.create(
        unit=unit,
        previous_status=EquipmentUnit.UnitStatus.IN_STOCK,
        new_status=EquipmentUnit.UnitStatus.UNDER_REPAIR,
        changed_by=employee,
        notes="Speaker rattling",
    )
    assert history.unit == unit
    assert history.changed_by == employee
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest stock/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'stock.models'`.

- [ ] **Step 3: Write `backend/stock/models.py`**

```python
from django.db import models


class Inventory(models.Model):
    inventory_id = models.AutoField(primary_key=True)
    product = models.OneToOneField(
        "catalog.Product", on_delete=models.CASCADE, related_name="inventory"
    )
    quantity_in_stock = models.IntegerField(default=0)
    quantity_in_use = models.IntegerField(default=0)
    quantity_damaged = models.IntegerField(default=0)
    storage_location = models.CharField(max_length=80, blank=True, null=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Inventory for {self.product}"


class EquipmentUnit(models.Model):
    class UnitStatus(models.TextChoices):
        IN_STOCK = "in_stock", "In stock"
        IN_USE = "in_use", "In use"
        DAMAGED = "damaged", "Damaged"
        UNDER_REPAIR = "under_repair", "Under repair"
        SOLD = "sold", "Sold"

    unit_id = models.AutoField(primary_key=True)
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="equipment_units"
    )
    serial_number = models.CharField(max_length=100, unique=True)
    status = models.CharField(max_length=20, choices=UnitStatus.choices)
    assigned_to = models.ForeignKey(
        "accounts.Employee", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="assigned_equipment",
    )
    storage_location = models.CharField(max_length=80, blank=True, null=True)
    condition_notes = models.TextField(blank=True, null=True)
    status_changed_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.product} [{self.serial_number}]"


class EquipmentStatusHistory(models.Model):
    history_id = models.AutoField(primary_key=True)
    unit = models.ForeignKey(EquipmentUnit, on_delete=models.CASCADE, related_name="status_history")
    previous_status = models.CharField(max_length=20, blank=True, null=True)
    new_status = models.CharField(max_length=20)
    changed_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="equipment_changes"
    )
    change_date = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.unit} {self.previous_status} -> {self.new_status}"
```

- [ ] **Step 4: Write `backend/stock/admin.py`**

```python
from django.contrib import admin
from stock.models import Inventory, EquipmentUnit, EquipmentStatusHistory

admin.site.register(Inventory)
admin.site.register(EquipmentUnit)
admin.site.register(EquipmentStatusHistory)
```

- [ ] **Step 5: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/stock/migrations
touch backend/stock/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations stock
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest stock/tests/test_models.py -v`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/stock/
git commit -m "Add Inventory, EquipmentUnit, EquipmentStatusHistory schema (models only)"
```

---

## Task 13: `finance` app — Expense model (schema only)

**Files:**
- Create: `backend/finance/models.py`
- Create: `backend/finance/admin.py`
- Create: `backend/finance/migrations/__init__.py`
- Test: `backend/finance/tests/__init__.py`
- Test: `backend/finance/tests/test_models.py`

**Interfaces:**
- Consumes: `accounts.models.Employee` (Task 2).
- Produces: `finance.models.Expense` — no API in Phase 1.

- [ ] **Step 1: Write the failing test — `backend/finance/tests/__init__.py`** (empty) **and `backend/finance/tests/test_models.py`**

```python
import pytest
from datetime import date
from accounts.models import Employee
from finance.models import Expense

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_create_expense(employee):
    expense = Expense.objects.create(
        category=Expense.ExpenseCategory.RENT,
        amount="200000.00",
        expense_date=date(2026, 1, 1),
        recorded_by=employee,
    )
    assert expense.category == Expense.ExpenseCategory.RENT
    assert expense.recorded_by == employee
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest finance/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'finance.models'`.

- [ ] **Step 3: Write `backend/finance/models.py`**

```python
from django.db import models


class Expense(models.Model):
    class ExpenseCategory(models.TextChoices):
        RENT = "rent", "Rent"
        UTILITIES = "utilities", "Utilities"
        SALARIES = "salaries", "Salaries"
        REPAIRS = "repairs", "Repairs"
        OTHER = "other", "Other"

    expense_id = models.AutoField(primary_key=True)
    category = models.CharField(max_length=50, choices=ExpenseCategory.choices)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    description = models.TextField(blank=True, null=True)
    recorded_by = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="expenses_recorded"
    )

    def __str__(self):
        return f"{self.category} - {self.amount} ({self.expense_date})"
```

- [ ] **Step 4: Write `backend/finance/admin.py`**

```python
from django.contrib import admin
from finance.models import Expense

admin.site.register(Expense)
```

- [ ] **Step 5: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/finance/migrations
touch backend/finance/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations finance
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest finance/tests/test_models.py -v`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/finance/
git commit -m "Add Expense schema (model only, no API yet)"
```

---

## Task 14: `notifications` app — NotificationLog model (schema only)

**Files:**
- Create: `backend/notifications/models.py`
- Create: `backend/notifications/admin.py`
- Create: `backend/notifications/migrations/__init__.py`
- Test: `backend/notifications/tests/__init__.py`
- Test: `backend/notifications/tests/test_models.py`

**Interfaces:**
- Consumes: `accounts.models.Employee` (Task 2), `sales.models.Sale` (Task 11).
- Produces: `notifications.models.NotificationLog` — no API in Phase 1; a later sales/notifications phase writes rows here and adds endpoints.

- [ ] **Step 1: Write the failing test — `backend/notifications/tests/__init__.py`** (empty) **and `backend/notifications/tests/test_models.py`**

```python
import pytest
from datetime import date
from accounts.models import Employee
from sales.models import Sale
from notifications.models import NotificationLog

pytestmark = pytest.mark.django_db


@pytest.fixture
def employee():
    return Employee.objects.create_user(
        username="admin1", password="adminpass", full_name="Admin One",
        hire_date=date(2025, 1, 1), role=Employee.Role.ADMIN,
    )


def test_notification_log_without_related_sale(employee):
    log = NotificationLog.objects.create(type="low_stock", recipient=employee)
    assert log.related_sale is None
    assert log.status == NotificationLog.NotificationStatus.SENT


def test_notification_log_with_related_sale(employee):
    sale = Sale.objects.create(employee=employee, total_amount="145000.00")
    log = NotificationLog.objects.create(
        type="sale_alert", recipient=employee, related_sale=sale
    )
    assert log.related_sale == sale
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm web pytest notifications/tests/test_models.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'notifications.models'`.

- [ ] **Step 3: Write `backend/notifications/models.py`**

```python
from django.db import models


class NotificationLog(models.Model):
    class NotificationStatus(models.TextChoices):
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    notification_id = models.AutoField(primary_key=True)
    type = models.CharField(max_length=30)
    recipient = models.ForeignKey(
        "accounts.Employee", on_delete=models.PROTECT, related_name="notifications_received"
    )
    related_sale = models.ForeignKey(
        "sales.Sale", on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications"
    )
    sent_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(
        max_length=20, choices=NotificationStatus.choices, default=NotificationStatus.SENT
    )

    def __str__(self):
        return f"{self.type} -> {self.recipient} ({self.status})"
```

- [ ] **Step 4: Write `backend/notifications/admin.py`**

```python
from django.contrib import admin
from notifications.models import NotificationLog

admin.site.register(NotificationLog)
```

- [ ] **Step 5: Create migrations directory and generate/apply migration**

```bash
mkdir -p backend/notifications/migrations
touch backend/notifications/migrations/__init__.py
docker compose run --rm web python manage.py makemigrations notifications
docker compose run --rm web python manage.py migrate
```

- [ ] **Step 6: Run test to verify it passes**

Run: `docker compose run --rm web pytest notifications/tests/test_models.py -v`
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/notifications/
git commit -m "Add NotificationLog schema (model only, no API yet)"
```

---

## Task 15: Final integration check

**Files:**
- Create: `backend/README.md`
- No source files modified (verification-only task, plus the new README).

**Interfaces:**
- Consumes: everything from Tasks 1-14.
- Produces: a documented, verified, fully-passing Phase 1 backend.

- [ ] **Step 1: Confirm `INSTALLED_APPS` in `backend/config/settings.py` already lists all 7 apps** (it does, from Task 1, Step 7) — no change needed, just visually confirm `accounts, catalog, purchasing, sales, stock, finance, notifications` are all present.

- [ ] **Step 2: Run the full test suite**

```bash
docker compose run --rm web pytest -v
```
Expected: all tests from Tasks 1-14 pass (1 health + 5 employee model + 3 auth + 4 employee API + 3 category API + 5 barcode service + 3 product API + 4 pricing API + 2 supplier API + 3 purchasing model + 3 customer API + 3 sales model + 3 stock model + 1 finance model + 2 notifications model = 45 passed). If any fail, use `superpowers:systematic-debugging` to investigate — do not proceed until all pass.

- [ ] **Step 3: Confirm no missing migrations**

```bash
docker compose run --rm web python manage.py makemigrations --check --dry-run
```
Expected: exits 0 with no output (no model changes without a matching migration).

- [ ] **Step 4: Write `backend/README.md`**

```markdown
# Promise Electronic Shop — Backend (Phase 1)

Django REST API: full DB schema, JWT auth, and CRUD for employees, categories,
suppliers, customers, products, and product pricing.

## Setup

1. Copy the environment template and fill in real secrets:
   ```bash
   cp .env.example .env
   ```
2. Start Postgres and Redis:
   ```bash
   docker compose up -d postgres redis
   ```
3. Apply migrations:
   ```bash
   docker compose run --rm web python manage.py migrate
   ```
4. Create an admin account:
   ```bash
   docker compose run --rm web python manage.py createsuperuser
   ```
5. Run the test suite:
   ```bash
   docker compose run --rm web pytest -v
   ```
6. Start the API:
   ```bash
   docker compose up web
   ```
   The API is now at `http://localhost:8000/api/`, and the Django admin at
   `http://localhost:8000/admin/`.

## Endpoints (Phase 1)

- `POST /api/auth/login/`, `POST /api/auth/refresh/`
- `/api/employees/` (Admin only)
- `/api/categories/`, `/api/suppliers/`, `/api/customers/`, `/api/products/`
- `/api/product-pricing/?product=<id>` (wholesale_price visible to Admin only)
- `/api/health/`

Purchasing, sales/POS, stock/equipment, dashboard, and notification endpoints
are schema-only in Phase 1 (models + migrations exist; no API yet) — see
`docs/superpowers/specs/2026-08-23-phase1-backend-foundation-design.md` for
what's deferred to later phases.
```

- [ ] **Step 5: Commit**

```bash
git add backend/README.md
git commit -m "Add backend setup README and confirm Phase 1 test suite passes clean"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Docker Compose, 3 services) → Task 1. Components table (7 apps, API-vs-schema-only split) → Tasks 2-14 map one-to-one to the table's rows. Schema notes (Category.code, generate_barcode with select_for_update, Employee as AUTH_USER_MODEL) → Tasks 2, 5, 6. RBAC matrix → Tasks 3, 4, 5, 6, 7 (every endpoint in the matrix has a corresponding permission assertion in that task's tests). Data flow (login, authenticated request, product creation, price change) → Tasks 3, 6, 7. Error handling (custom exception handler, 401/403/400/404) → Task 1 (handler wiring) plus 401/403 assertions throughout Tasks 3-9. Testing section (model-level + API-level, gap-after-deletion barcode case, is_current flip) → present in Tasks 2, 6, 7 explicitly. Out-of-scope list → reflected by Tasks 10-14 being schema-only (no serializers/views) and no Celery/Next.js/i18n/motion work anywhere in this plan.
- **Placeholder scan:** no TBD/TODO/"add appropriate handling" phrases; every step has literal code or a literal shell command.
- **Type/signature consistency:** `generate_barcode(category: Category) -> str` (Task 6) is called identically in `ProductViewSet.perform_create` (Task 6) with no other call sites. `Employee.Role` / `Employee.Status` (Task 2) are referenced with matching member names (`ADMIN`, `MANAGER`, `SALES_STAFF`, `TECHNICIAN`; `ACTIVE`, `INACTIVE`, `TERMINATED`) in every later task that touches roles (3, 4, 7, 8-14 fixtures). `IsAdmin` (Task 4) is defined once and not re-implemented elsewhere. FK `related_name`s introduced in earlier tasks (`products`, `pricing_history`, `purchases`, `sales`, `equipment_units`, etc.) are not reused for a different relation anywhere else.
- **Two real bugs caught and fixed in this review:**
  1. Six API tests (Tasks 4, 5, 6, 7, 8) read `response.json()["count"]` / `["results"]`, assuming paginated list responses, but the original `REST_FRAMEWORK` setting in Task 1 didn't configure a pagination class (DRF would have returned a bare list, and those tests would fail with `KeyError`). Fixed by adding `DEFAULT_PAGINATION_CLASS: PageNumberPagination` and `PAGE_SIZE: 20` to Task 1's settings.
  2. Task 2's `EmployeeManager.create_superuser` never set `is_superuser=True` (a real field from `PermissionsMixin`, defaulting to `False` — unlike `is_staff`, which is a derived property here), but Task 2's own test asserts `superuser.is_superuser is True`. Fixed by adding `extra_fields.setdefault("is_superuser", True)`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-23-phase1-backend-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
