# Frontend Phase 7: Admin Dashboard — Design

## Context

Frontend Phases 1-3 (Foundation, Sales/Checkout, Catalog) are complete and merged to `main`. `/dashboard`
currently renders a stub ("Coming soon") even though both Admin and Manager are redirected there on login
(Phase 1's login rule). This phase replaces the stub with the real screen (mockup `1m`): monthly revenue,
purchase cost, gross profit, a reorder list, top sellers, slow movers, and a 6-month revenue-vs-cost trend
chart. Stock/Equipment, Suppliers/Customers/Employees, and Notifications are being built in parallel by
separate agents in separate worktrees — this phase touches only `app/(protected)/dashboard/*`,
`components/dashboard/*`, `lib/dashboard/*`, and an additive block in `lib/types.ts`.

The backend's `dashboard` app (`backend/dashboard/views.py`) already exposes four endpoints
(`sales-summary`, `stock-health`, `financial-snapshot`, `activity-feed`), all gated by `IsAdmin`
(`backend/accounts/permissions.py`), which checks `request.user.role == Employee.Role.ADMIN`
**strictly** — a Manager is 403'd on every one of them, even though Manager lands on `/dashboard` after
login per Phase 1's redirect rule. No backend changes are in scope for this phase (standing rule).

## Decisions made

Built autonomously (no live user available mid-task) — every deviation from the mockup's literal
assumptions is documented here, the same discipline Phase 3's Decisions 1/2/7/8 established.

1. **A Manager who lands on `/dashboard` sees an "Admins only" state, not a crash or a generic error
   toast.** `sales-summary` and `stock-health` are both called on page load specifically so a 403 from
   either is detected immediately (via `ApiError.status` from `lib/api-client.ts`) before any other data
   fetch is attempted, and the page renders a dedicated empty state instead of partial/broken cards. The
   Phase 1 login-redirect rule (`admin`/`manager` → `/dashboard`) is unchanged — fixing that mismatch is
   out of scope for a frontend-only phase.
2. **"Purchase cost" and the 6-month trend/top-sellers/slow-movers data are computed client-side from the
   raw `/sales/` and `/purchases/` lists (`fetchAllPages`), not from `dashboard/sales-summary`'s
   `top_products`.** `sales-summary` only returns revenue by 5 products, with no unit counts and no
   historical-month support (`resolve_period_range` only accepts `today/week/month/year`, relative to
   *now* — there is no way to ask for a specific past calendar month). Raw sales already embed `items[]`
   (product, quantity, subtotal) per `SaleSerializer`, so the same client-side fetch-and-aggregate that
   Phase 3's `useCatalogProducts` established for its join is reused here for revenue-by-month,
   units-and-revenue-by-product (top sellers), and last-sale-date-per-product (slow movers). `sales-summary`
   and `stock-health` are still called — they're the cheapest way to (a) get the headline
   "this month" revenue/sale-count figures and (b) probe for the manager-403 case per Decision 1 — but
   their output isn't threaded into the trend/top-sellers/slow-movers cards.
3. **"Gross profit" = this month's sales revenue − this month's purchase cost (sum of `total_paid` across
   `/purchases/` whose `purchase_date` falls in the current month), not true COGS from sold items.** This
   mirrors the mockup's own framing exactly — its "Purchase cost" card is captioned "(paid amounts)", and
   its gross-profit figure is described as "revenue − COGS" in the mockup's label but the only cost figure
   the mockup itself surfaces is period purchase cost, not per-item cost of goods sold. Reusing the
   mockup's own approximation avoids inventing a COGS model the backend doesn't compute anywhere.
   `dashboard/financial-snapshot` (revenue − **expenses**, a different figure from the `finance` app) is
   not used for this card — expenses and purchase cost are not the same thing, and using it would silently
   misrepresent what the mockup's card means. `financial-snapshot` is not called at all in this phase.
4. **The "Low stock / out of stock" table reuses `lib/products/useCatalogProducts`'s existing join
   (product + category + price + inventory, already deriving an `ok`/`low_stock`/`out_of_stock` status) as
   a read-only import**, rather than re-fetching `/inventory/` and `/products/` separately. This is exactly
   the cache-sharing precedent Phase 3's own design doc describes (same `["products"]`/`["inventory"]`
   query keys, deduped by TanStack Query regardless of which screen issued the fetch) — no edits are made
   to that hook or to any file under `components/products/`. `stock-health`'s `low_stock_count` still
   drives the headline "Needs reorder" stat (it's the admin-gated, authoritative count); the sub-detail
   "N out of stock" and the table rows are derived from the reused join.
5. **Top sellers and slow movers are capped at the top 5 / bottom 5 rows** (matching the mockup's own
   4-and-3-row tables closely, rounded to a consistent cap) rather than rendering the whole catalog —
   proportional to a dashboard summary, not a full report.
6. **"Export CSV" is real, not a placeholder.** Once the dashboard's numbers are already fetched and
   aggregated client-side, generating a CSV (headline stats + top sellers + low-stock rows) from that same
   in-memory data and triggering a `Blob` download needs no backend endpoint and no new infrastructure —
   unlike Phase 3's "Reorder" button (Decision 1 there), which implied a whole unbuilt purchasing flow,
   this is a small, self-contained addition.
7. **The 6-month trend and slow-movers computations assume the shop's sales/purchase history stays in the
   hundreds-to-low-thousands of rows**, consistent with Phase 3's own stated reasoning for fetching a
   whole list into memory ("a shop's catalog is hundreds, not millions, of rows"). If sales volume grows
   far beyond that, this client-side aggregation would need a real backend historical-reporting endpoint —
   explicitly out of scope here, called out below.

## Architecture

```
frontend/
  app/(protected)/dashboard/
    page.tsx                     — server: getSession() → role, renders DashboardPageClient
    DashboardPageClient.tsx       — client: orchestrates useDashboardData(), renders cards/chart/tables
  components/dashboard/
    StatCards.tsx                 — Sales revenue / Purchase cost / Gross profit / Needs reorder (4 cards)
    RevenueTrendChart.tsx         — inline SVG bar+line chart, 6 months, mirrors mockup's own SVG structure
    LowStockTable.tsx             — Product / On hand / Reorder at
    TopSellersTable.tsx           — Product / Units / Revenue
    SlowMoversTable.tsx           — Product / On hand / Last sold
    AdminOnlyNotice.tsx           — shown to a Manager (or any 403) instead of the dashboard content
    ExportCsvButton.tsx           — builds and downloads the CSV from already-fetched data
  lib/dashboard/
    useDashboardData.ts           — the one hook: sales-summary + stock-health (admin-gated probes) +
                                     raw /sales/ + /purchases/ (fetchAllPages) + reused useCatalogProducts,
                                     aggregated into every card's view model
    csv.ts                        — buildDashboardCsv(data): string — pure function, unit-tested directly
  lib/types.ts                    — additive: Purchase, PurchaseItem (minimal), SalesSummary, StockHealth
```

## Data flow

`DashboardPageClient` calls `useDashboardData()`. The hook:
1. Fires `GET /dashboard/sales-summary/?period=month` and `GET /dashboard/stock-health/` (React Query).
   If either resolves to an `ApiError` with `status === 403`, the hook exposes `isForbidden: true` and
   skips every other fetch (`enabled: !isForbidden` on the remaining queries) — no wasted requests, no
   partial UI.
2. Otherwise fires `fetchAllPages<Sale>("sales/")` and `fetchAllPages<Purchase>("purchases/")`, and calls
   `useCatalogProducts()` (Phase 3's hook, imported read-only) for the product/category/price/inventory
   join.
3. Aggregates, memoized on the fetched data:
   - **This month's revenue** = `sales-summary.total_revenue` (already period-correct server-side).
   - **This month's purchase cost** = sum of `purchases[].total_paid` where `purchase_date` is in the
     current calendar month (client-side date filter over the raw list).
   - **Gross profit** = revenue − purchase cost; **margin%** = profit / revenue (Decision 3).
   - **Needs reorder** = `stock-health.low_stock_count` (headline) + count of `useCatalogProducts().all`
     rows with `status === "out_of_stock"` (sub-detail) (Decision 4).
   - **Low-stock table** = `useCatalogProducts().all` filtered to `status !== "ok"`, sorted worst-first
     (out-of-stock before low-stock), capped at 5 (Decision 5).
   - **Top sellers** = group `sales[].items[]` (only `status === "completed"` sales in the current month)
     by `product`, summing `quantity` and `subtotal`, joined to product names via `useCatalogProducts`,
     sorted by revenue desc, capped at 5 (Decisions 2, 5).
   - **Slow movers** = for every product with `quantity_in_stock > 0`, the latest `sale_date` across all
     completed sales containing that product; products with no sale in the last 30 days (or no sale at
     all, in which case the shop's earliest known reference point is used, so a genuinely never-sold
     product still surfaces), sorted oldest-last-sale-first, capped at 5.
   - **6-month trend** = for each of the trailing 6 calendar months (this month and the 5 before it),
     sum completed sales revenue and sum purchase `total_paid`, from the same raw lists already fetched.
4. `isLoading`/`isError`/`isForbidden` drive `DashboardPageClient`'s three-way branch (loading skeleton /
   error toast+retry / `AdminOnlyNotice`), matching the `isLoading`/`isError` guard pattern every prior
   phase's pages already use.

## Error handling

Reuses the established mechanism, no new one:
- 403 on the two admin-gated probe calls → `AdminOnlyNotice` (Decision 1), not a toast — this is an
  expected, permanent state for a Manager, not a transient error.
- 404/5xx/network failure on any fetch → `useToast()` error toast with a retry-safe message, page shows a
  lightweight inline retry affordance (matching Phase 3's `isError` branch: reload button).
- No forms/mutations on this page, so there's no 400 field-error path to handle.

## Testing

**Vitest + RTL:** `useDashboardData`'s every aggregation function tested directly against mocked
`fetch` responses (revenue/cost/profit math, the 403→`isForbidden` short-circuit, low-stock reuse of
`useCatalogProducts`'s derivation, top-sellers grouping, slow-movers 30-day cutoff, 6-month bucketing
across a year boundary); `buildDashboardCsv` tested as a pure function; each card/table component's
rendering; `AdminOnlyNotice` rendering on `isForbidden`.

**Playwright e2e:** one smoke test in `e2e/dashboard.spec.ts` — log in as admin → land on `/dashboard` →
see the four stat cards and at least one table populated with fixture data — proportional to this phase's
scope, matching the discipline established in Phases 2 and 3. Not run during implementation (parallel
worktrees share port 3000 and the dev database); run once after all four in-flight phases are merged.

## Out of scope for this phase

- Any backend change — no historical-month `dashboard` endpoint, no per-product COGS, no CSV/export
  endpoint. Everything above is built entirely from existing list/detail endpoints.
- `dashboard/financial-snapshot` and `dashboard/activity-feed` — not used by this screen (Decision 3
  explains why `financial-snapshot` doesn't fit; `activity-feed` isn't part of mockup `1m`).
- Fixing the Phase 1 login-redirect rule so a Manager doesn't land on `/dashboard` in the first place —
  a real fix belongs to whichever phase owns the auth flow, not this one; Decision 1's graceful notice is
  the scoped mitigation.
- A real historical-reporting backend for shops whose sales history outgrows client-side aggregation
  (Decision 7).
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
