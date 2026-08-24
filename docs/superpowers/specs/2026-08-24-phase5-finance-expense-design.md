# Phase 5b: Finance / Expense Tracking — Design

## Context

Phases 1-4 (backend foundation, purchasing, sales, stock/equipment) are complete and merged,
152 tests passing. `Expense` has existed as a schema-only model since Phase 1 (`category`,
`amount`, `expense_date`, `description`, `recorded_by`) with no API. This phase builds standard
CRUD for recording business expenses (rent, utilities, salaries, repairs, other). It runs as an
independent track alongside Phase 5a (Notifications) — the two share no files, models, or apps,
and are implemented in parallel.

## Decisions made (with the user)

1. **Admin-only, throughout.** `IsAdmin` gates the entire `Expense` API — `GET`/`POST`/`PATCH`/
   `PUT`/`DELETE` all require the Admin role. This matches the sensitivity precedent already set
   by Phase 2's wholesale-cost masking (`Purchase`/`PurchaseItem` cost fields hidden from
   non-admins) — expenses are a financial-reporting concern, not a general staff activity, unlike
   every other domain API in this project (categories, products, purchases, sales,
   inventory/equipment), which are `IsAuthenticated` only.
2. **`recorded_by` is server-set, never client-submitted.** Always `request.user` on create —
   same principle as `Purchase.employee`/`Sale.employee` (Phases 2-3): the acting employee is
   never a value the client gets to choose.
3. **No immutability lock on `Expense`.** Unlike `Purchase`/`Sale` headers, an `Expense` record
   has no downstream state that depends on it — no cascading `Inventory` effects, no linked line
   items, nothing else in the schema references it. Plain `PATCH`/`PUT`/`DELETE` are safe here;
   there's no "already processed, don't touch" invariant to protect, so this phase does not
   invent one.
4. **List is filterable by `?category=`.** Matches the project's established filter pattern
   (Phase 4's `?product=` on equipment units, `?low_stock=true` on inventory). Date-range
   filtering is left to Phase 6's dashboard/reporting layer, which needs date-range aggregation
   across multiple models anyway — adding it here would duplicate that work ahead of knowing its
   actual shape.

## API design

All endpoints under `/api/expenses/`, `IsAdmin` only.

- `POST /api/expenses/` — create. Body: `category` (one of `Expense.ExpenseCategory` choices),
  `amount`, `expense_date`, `description` (optional). `recorded_by` is set server-side to
  `request.user`, never accepted from the request body.
- `GET /api/expenses/` — list, filterable `?category=<value>`. Ordered newest-first
  (`-expense_date`).
- `GET /api/expenses/{id}/` — retrieve.
- `PATCH`/`PUT /api/expenses/{id}/` — update any field except `recorded_by` (read-only, set once
  at creation and never reassigned even by a later editor — preserves who originally recorded
  the expense as a factual record, distinct from who may edit it later).
- `DELETE /api/expenses/{id}/` — delete. No soft-delete, no status field — a mis-recorded expense
  is simply removed, consistent with there being no downstream record that references it (Decision
  3).

## Data flow example

An admin submits `POST /api/expenses/` with `category=utilities`, `amount=45000`,
`expense_date=2026-08-20`, no description → server sets `recorded_by=request.user`, creates the
row, returns it with the assigned `expense_id`. Later, a typo in `amount` is fixed via `PATCH
/api/expenses/{id}/` — `recorded_by` stays as the original creator regardless of who performs
the edit. A duplicate entry is removed via `DELETE`.

## Error handling

400 for validation (invalid `category` choice, missing required field, non-numeric `amount`),
401/403 from existing auth middleware (403 specifically for a non-admin — `IsAdmin` denies
rather than 404s, since the resource's existence isn't sensitive the way another employee's
notification is), 404 for an unknown expense ID.

## Testing

API-level: create sets `recorded_by` from `request.user` regardless of what (if anything) the
client sends for it; list/retrieve as admin succeeds; list/retrieve/create/update/delete all
return 403 for a non-admin employee; `?category=` filters correctly; `PATCH` updates fields
while leaving `recorded_by` unchanged even when a different admin performs the edit than the one
who created it; `DELETE` removes the row; invalid `category` value returns 400; unauthenticated
requests return 401.

## Out of scope for this phase

- Date-range filtering / aggregation — Phase 6's dashboard layer (Decision 4).
- Receipt/attachment uploads — not in the original schema, not requested.
- Notifications API (Phase 5a, parallel track, separate spec).
- Any Next.js frontend work.
