# Phase 1: Backend Foundation — Design

## Context

Promise Electronic Shop needs an Inventory & Sales Management System: purchasing, sales/POS,
stock and serialized-equipment tracking, pricing history, and an admin dashboard, with
role-based access (Sales Staff / Technician / Admin). Two source documents drive this:

- `Promise Electronic Shop - Inventory System Design.docx` — the original written requirements
  and a 13(ish)-table relational schema (employees, categories, suppliers, products,
  product_pricing, inventory, equipment_units, equipment_status_history, customers, purchases,
  purchase_items, sales, sale_items, expenses, notification_log).
- A Claude Design mockup handoff (`Inventory UI Mockups.dc.html`, 20 screens across four
  "turns") — a more detailed, later-stage design that adds a reworked purchasing flow and a
  batch-intake/overhead-allocation/VAT/margin system not in the original docx.

The full project (Next.js frontend + Django REST backend + PostgreSQL + Celery/Redis, ~20
screens, tablet POS variants, i18n, VAT/margin logic) is too large for one implementation pass.
It will be built in phases; this document covers **Phase 1 only: the Django backend
foundation** — project setup, full DB schema, auth/RBAC, and CRUD APIs for the entities every
later phase depends on. No frontend work happens in this phase.

## Decisions already made (with the user)

1. **Purchasing flow**: the shop assigns and prints its own barcode at purchase entry (mockup
   screens 2a/2b/2c), which explicitly replaces the docx's/mockup 1f's "scan the manufacturer's
   existing barcode" flow. Barcodes are never manually typed by staff (only "Regenerate" is
   available in the UI).
2. **VAT / overhead-allocation / true-cost margin system** (mockup "turn 3": batch intake with
   allocated overheads, 18% VAT input/output tracking, margin targets, gross-vs-net dashboard)
   is **deferred** to a later phase, consistent with the docx's original plan ("tax and detailed
   expense breakdowns are a planned follow-on phase"). Phase 1's schema does not include batch/
   overhead tables.
3. **Build order**: backend foundation first (this document), then later phases layer on
   purchasing, sales/POS, stock/equipment, dashboard/notifications, and finally the Next.js UI.
4. **Local dev environment**: Docker Compose (Postgres + Redis + Django). Docker Desktop is not
   yet installed on the dev machine — the user will install it before implementation starts.
5. **Backend structure**: modular, domain-driven Django apps (not one giant app, not Django's
   built-in `User` model as a separate table from `Employee`).

## Architecture

Docker Compose with three services:
- `postgres` (16) — primary datastore
- `redis` (7) — not consumed by any code in Phase 1, but wired now (via Celery in a later
  phase for the "email admin on every sale" requirement) so the compose file doesn't need a
  structural change later
- `web` — Django 5.x + Django REST Framework, Python 3.12

Auth: `djangorestframework-simplejwt`. `POST /api/auth/login/` exchanges username+password for
an access + refresh token pair. Every other endpoint requires `Authorization: Bearer <token>`.
RBAC is enforced via DRF permission classes reading `request.user.role`, not a separate
permissions table (per the docx: "application-layer permission check, not a separate table").

Secrets (DB credentials, Django `SECRET_KEY`, JWT signing key) live in a `.env` file, gitignored,
with `.env.example` committed as a template.

## Components

One Django project (`config`) containing seven domain apps:

| App | Models | API in Phase 1? |
|---|---|---|
| `accounts` | `Employee` (custom `AUTH_USER_MODEL`) | Yes — login, CRUD (Admin only) |
| `catalog` | `Category`, `Product`, `ProductPricing` | Yes — full CRUD |
| `purchasing` | `Supplier`, `Purchase`, `PurchaseItem` | Supplier CRUD only; Purchase/PurchaseItem models+migrations only, no endpoints yet |
| `sales` | `Customer`, `Sale`, `SaleItem` | Customer CRUD only; Sale/SaleItem models+migrations only, no endpoints yet |
| `stock` | `Inventory`, `EquipmentUnit`, `EquipmentStatusHistory` | Models+migrations only, no endpoints yet |
| `finance` | `Expense` | Model only |
| `notifications` | `NotificationLog` | Model only |

Rationale: all 15 tables are FK-linked (e.g. `PurchaseItem.product_id → Product`), so the full
schema is created in one pass to avoid migration churn later. Only the entities every other
phase depends on (employees, categories, suppliers, customers, products, pricing) get working
API endpoints now; purchasing/sales/stock business logic (receive-purchase stock increment,
complete-sale stock decrement + admin email, equipment status-change audit trail) is
substantial and belongs to its own phase/spec.

### Schema notes (deltas from the docx)

- `Category` gains a `code` field (short, e.g. `AUD`, `TV`, `MOB`) — not in the original docx —
  needed to generate barcodes in the mockup's observed format `PES-{CATEGORY_CODE}-{00000}`
  (e.g. `PES-AUD-00147`, `PES-TV-00082`, `PES-MOB-00095`).
- `Product.barcode` is system-generated, never user-entered. A shared service function
  `generate_barcode(category)` computes the next zero-padded sequence number within that
  category (based on the current max existing suffix for that category, not a running total, so
  gaps from deletions don't get reused awkwardly). `Product.barcode` has a DB-level unique
  constraint; generation runs inside the same transaction as product creation with a row lock
  on the category (`select_for_update`) to prevent two concurrent creations in the same category
  from computing the same next number. Used both for direct catalog creation
  (mockup 1d's "+ New product") and for new-product entry during purchasing (2a/2b) — those
  reuse the same underlying `Product` creation path.
- `Employee` is Django's `AUTH_USER_MODEL` directly (extends `AbstractBaseUser` +
  `PermissionsMixin`), not a separate profile linked to Django's built-in `User` — avoids two
  parallel user tables. `role` stays a plain string field with a `choices` constraint
  (`admin`, `manager`, `sales_staff`, `technician`), matching the docx's free-text intent but
  constrained to known values DRF permission classes can check.
- Everything else (field names, types, constraints, FKs) follows the docx schema in
  `Promise Electronic Shop - Inventory System Design.docx` section 4 directly.

## RBAC matrix (Phase 1 endpoints)

The design decisions above name two specific admin-only gates (wholesale price visibility,
employee management) without stating a full per-endpoint permission matrix. To remove that
ambiguity before implementation:

| Endpoint | Read (list/retrieve) | Write (create/update/delete) |
|---|---|---|
| `/api/auth/login/` | any credentialed request | — |
| `/api/employees/` | Admin only | Admin only |
| `/api/categories/` | any authenticated employee | any authenticated employee |
| `/api/suppliers/` | any authenticated employee | any authenticated employee |
| `/api/customers/` | any authenticated employee | any authenticated employee |
| `/api/products/` | any authenticated employee | any authenticated employee |
| `/api/products/{id}/pricing/` | any authenticated employee (wholesale_price field omitted unless role is Admin) | any authenticated employee (can set retail_price; wholesale_price accepted only from Admin — non-admin submissions get a 403 if they include it) |

Rationale: purchasing/sales staff need to read and write catalog/supplier/customer data as part
of their daily work (per the mockups, e.g. screens 1d/2a/2b are usable by Sales Staff), so
Phase 1 doesn't lock those down beyond authentication. The two things the docx and mockups are
explicit about — wholesale cost visibility and employee/account management — stay Admin-gated.
Finer-grained write restrictions (e.g. only Admin can edit an existing product's price per
mockup 2c) can be tightened in the phase that builds that specific screen's backing endpoint,
once that flow's exact rules are worked out.

## Data flow (Phase 1 scope)

1. **Login**: `POST /api/auth/login/` with username+password → simplejwt validates against
   `Employee`'s hashed password → returns `{access, refresh, role}`.
2. **Authenticated request**: client sends `Authorization: Bearer <access>` → DRF authenticates
   the `Employee` → permission class checks `role` for admin-gated fields/endpoints (e.g.
   `ProductPricing.wholesale_price` is excluded from the serializer for non-admin roles, per the
   docx's "wholesale price & margins Admin-only" rule from the mockups).
3. **Product creation** (direct or via future purchasing flow): `Category` + submitted fields →
   `generate_barcode(category)` → `Product` row created with the generated barcode → an initial
   `ProductPricing` row created with `is_current=True`.
4. **Price change**: creating a new `ProductPricing` row for a product sets the previous
   current row's `is_current=False` and the new row's `is_current=True` — atomic, one DB
   transaction — so historical purchases/sales keep the price valid at their own date (docx
   business rule).

## Error handling

Custom DRF exception handler returns a consistent shape: `{"detail": "...", "code": "..."}`.
- 401 — missing/invalid/expired token
- 403 — authenticated but role lacks permission (e.g. non-admin hitting employee CRUD)
- 400 — validation failure, with per-field messages (e.g. duplicate `Category.code`, missing
  required field)
- 404 — standard DRF not-found for unknown IDs

## Testing

`pytest-django`. Written test-first (red/green) per normal practice:
- Model-level: field constraints, `generate_barcode` sequencing (including the
  gap-after-deletion case), price-history `is_current` flip-on-create behavior.
- API-level: login success/failure, token refresh, RBAC enforcement (403 for non-admin on
  admin-only endpoints/fields), full CRUD happy-path + validation-failure cases for each
  exposed endpoint (employees, categories, suppliers, customers, products, product_pricing).

## Out of scope for Phase 1 (explicitly deferred)

- Purchasing, sales/POS, stock/equipment, dashboard, and notification API endpoints and
  business logic (later phases, each with its own design).
- VAT / overhead-allocation / true-cost margin system (mockup turn 3) — deferred per decision
  #2 above.
- Any Next.js frontend work.
- Celery task wiring (Redis service exists in compose, but no tasks are defined yet).
- i18n (EN/RW toggle) — a frontend-phase concern.
- Motion/animation spec (mockup turn 4) — frontend-phase, cosmetic.
