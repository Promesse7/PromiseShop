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
