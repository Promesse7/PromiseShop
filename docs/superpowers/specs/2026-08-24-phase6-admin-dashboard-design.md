# Phase 6: Admin Dashboard — Design

## Context

Phases 1-4 (backend foundation, purchasing, sales, stock/equipment) are complete and merged,
152 tests passing. Phase 5a (notifications) and Phase 5b (finance/expense) are in progress as
parallel implementation tracks. This phase builds a read-only reporting/aggregation API for the
admin dashboard — no new persisted state, no mutations, purely querying and summarizing existing
models (`Sale`/`SaleItem`, `Purchase`, `Inventory`, `EquipmentUnit`, `Expense`,
`NotificationLog`) across every prior phase.

**Dependency note:** this phase reads `Expense` and `NotificationLog` directly via the ORM, not
through Phase 5's HTTP API — so it has no hard code dependency on Phase 5's endpoints existing.
Both models have been present in the schema since Phase 1. Implementation is nonetheless
sequenced after Phase 5a/5b merge, to avoid three concurrent branches touching
`backend/config/urls.py` at once.

## Decisions made (with the user)

1. **Scope: all four widgets** — sales summary, stock health, financial snapshot, and a recent
   activity feed. Confirmed directly with the user rather than assumed.
2. **Four focused endpoints, not one combined response.** Each is independently testable and
   cacheable, a frontend screen fetches only what it needs, and a slow aggregation in one widget
   never blocks the others. Rejected a single combined `GET /api/dashboard/` in favor of this.
3. **Fixed time periods via `?period=`, not arbitrary date ranges.** `today|week|month|year`,
   computed server-side from the current date — matches a period-selector UX rather than a
   free-form date picker, and avoids pushing date-range validation onto the API.
4. **`IsAdmin` throughout.** The dashboard aggregates expense data (already admin-only per Phase
   5b) and is an admin-facing surface by definition — no separate RBAC question needed.
5. **Read-only, no new persisted state.** Every endpoint is `GET`. Nothing in this phase writes
   to any model.
6. **Activity feed merges in Python, not SQL.** `Sale`, `Purchase`, and `NotificationLog` are
   heterogeneous tables with no common base — fetching the top N from each and merging by
   timestamp in application code is simpler and more portable than a raw SQL `UNION`, and at
   dashboard-feed scale (default 20 items) the extra rows fetched per source are negligible.

## API design

All endpoints under `/api/dashboard/`, `IsAdmin` only, `GET` only.

- `GET /api/dashboard/sales-summary/?period=today|week|month|year` — total revenue (sum of
  `Sale.total_amount` for `status=completed` sales in the period), sale count, and the top 5
  products by revenue (aggregating `SaleItem.subtotal` grouped by product) for the period. An
  invalid `period` value returns 400.
- `GET /api/dashboard/stock-health/` — count of products where `is_low_stock` (Phase 4's
  `quantity_in_stock <= product.reorder_level`), and a count of `EquipmentUnit` rows grouped by
  `status`. No `period` param — a point-in-time snapshot.
- `GET /api/dashboard/financial-snapshot/?period=today|week|month|year` — total `Expense` amount
  for the period grouped by `category`, alongside the same period's total revenue (reusing
  sales-summary's calculation), and a single `net` figure (revenue minus total expenses) — not a
  full P&L statement, just a revenue-vs-spend figure for the period.
- `GET /api/dashboard/activity-feed/?limit=<int, default 20>` — the `limit` most recent events
  merged from `Sale` (by `sale_date` or equivalent creation timestamp), `Purchase` (by its
  creation timestamp), and `NotificationLog` (the requesting admin's own rows, by `sent_at`),
  sorted newest-first. Each item includes a `type` discriminator (`"sale"` / `"purchase"` /
  `"notification"`) plus enough fields to render a one-line summary.

## Data flow example

Admin opens the dashboard → frontend fires four requests in parallel → `sales-summary?
period=today` sums today's completed sales and ranks products; `stock-health` recomputes
`is_low_stock` across all `Inventory` rows and tallies `EquipmentUnit` statuses;
`financial-snapshot?period=today` sums today's `Expense` rows by category alongside today's
revenue; `activity-feed?limit=20` fetches the 20 most recent `Sale`/`Purchase`/`NotificationLog`
rows relevant to this admin and merges them into one timeline.

## Error handling

400 for an invalid `period` value on `sales-summary`/`financial-snapshot`. 401/403 from existing
auth middleware (403 for a non-admin employee). No 404s — none of these endpoints take a
resource ID. An empty period (zero sales, zero expenses) returns zero-valued fields, not an
error.

## Testing

Aggregation-level: revenue/expense totals match manually-summed fixtures for each period
boundary (confirm a sale just inside vs. just outside a period's boundary is included/excluded
correctly); top-5 products ordered by revenue descending, correctly limited to 5 even with more
products sold; low-stock count matches `is_low_stock` semantics exactly (reusing Phase 4's own
definition, not reimplementing it); equipment status breakdown counts match
`EquipmentUnit.UnitStatus` choices exhaustively (a status with zero units still appears with
count 0, not omitted); activity feed correctly interleaves and sorts three different model types
newest-first, respects `?limit=`, and only includes the requesting admin's own notifications (not
another admin's). API-level: 403 for non-admin on every endpoint; invalid `period` returns 400 on
both period-taking endpoints; a period with no data returns zero values rather than erroring.

## Out of scope for this phase

- Any write/mutation endpoints.
- Charts or visualization — a frontend concern, this phase returns data only.
- Historical trend data beyond the four fixed periods (e.g. "compare to last month").
- Arbitrary date-range queries (Decision 3).
- Any Next.js frontend work.
