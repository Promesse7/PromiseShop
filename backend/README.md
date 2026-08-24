# Promise Electronic Shop — Backend

Django REST API: full DB schema, JWT auth, and CRUD for employees, categories,
suppliers, customers, products, and product pricing (Phase 1), plus purchasing
— draft purchases, line items, and receiving into stock (Phase 2), plus sales
— completing sales against stock, and returns/cancellations that restore it
(Phase 3), plus stock/equipment tracking — inventory stock levels and equipment
unit registration, status, and condition (Phase 4).

## Setup

1. Copy the environment template and fill in real secrets:
   ```bash
   cp .env.example .env
   ```
   `DJANGO_SECRET_KEY` must be set to a real random value of at least 32
   bytes/characters before running anything beyond local dev testing — it
   also signs JWTs (HS256), and a short key triggers simplejwt's
   `InsecureKeyLengthWarning`.
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

## Endpoints

- `POST /api/auth/login/`, `POST /api/auth/refresh/`
- `/api/employees/` (Admin only)
- `/api/categories/`, `/api/suppliers/`, `/api/customers/`, `/api/products/`
- `/api/product-pricing/?product=<id>` (wholesale_price visible to Admin only)
- `/api/health/`

### Purchasing (Phase 2)

- `POST/GET /api/purchases/`
- `GET/PATCH /api/purchases/{id}/`
- `POST /api/purchases/{id}/items/`
- `DELETE /api/purchases/{id}/items/{item_id}/`
- `POST /api/purchases/{id}/receive/`

### Sales / POS (Phase 3)

- `POST/GET /api/sales/`
- `GET /api/sales/{id}/`
- `POST /api/sales/{id}/return/`
- `POST /api/sales/{id}/cancel/`

Sales are immutable once created — no PATCH/PUT/DELETE; a completed sale can
only be reversed via the `return`/`cancel` actions above, which restore the
locked stock. `notifications.NotificationLog` still has no directly-exposed
API — this phase only writes to it internally as a side effect of completing
a sale.

### Stock & Equipment (Phase 4)

- `GET /api/inventory/` (with optional `?low_stock=true` filter)
- `GET/PATCH /api/inventory/{id}/`
- `POST/GET /api/equipment-units/`
- `GET/PATCH /api/equipment-units/{id}/`
- `POST /api/equipment-units/{id}/change-status/`

`Inventory` quantities (`quantity_in_stock`, `in_use`, `damaged`) are never
directly editable — only `storage_location` may be updated via PATCH.
`EquipmentUnit.status` and `serial_number` are never editable via PATCH;
status changes only via the dedicated `change-status` action.

The admin dashboard remains schema-only — see
`docs/superpowers/specs/2026-08-23-phase1-backend-foundation-design.md` for
what's deferred to later phases.

### Notifications (Phase 5a)

- `GET /api/notifications/` (with optional `?unread=true` filter)
- `GET /api/notifications/{id}/`
- `POST /api/notifications/{id}/mark-read/`

Notifications are always scoped to the authenticated employee's own `recipient`
rows — no endpoint lets one employee read or mark another's notifications.
Notifications are never client-created; they are generated internally by the
system as a side effect of certain operations (such as completing a sale).
