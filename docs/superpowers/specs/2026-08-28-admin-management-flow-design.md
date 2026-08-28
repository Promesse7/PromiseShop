# Admin/manager app-flow: products → purchases → stock → sales

Date: 2026-08-28
Status: approved for planning

## Context

Real user-reported confusion (not hypothetical): a shop admin created a product
directly on the Products page, then separately went to Purchases to record
buying stock for it. The purchase's "add item" search (`AddProductSingleForm`)
either missed the existing product (a whitespace/typo mismatch) or the admin
didn't trust the empty result, so they created a *second*, duplicate product
inline from the purchase. The 20 units they received went onto that duplicate's
`Inventory` row — invisible from the original product's page, which still
showed zero stock. From the user: "ntabwo nzibona muri stock" (I don't see it
in stock) and "yinjiriemo urebe urahasanga scales 60kg ebyiri" (you'll find
Scales 60kg twice).

A prior pass (commit `aba09fa`) already fixed the proximate cause in
purchasing: `AddProductSingleForm`/`AddProductBulkTable` now normalize
whitespace when matching, and show an explicit "No matches for '...'" message
before offering "add as new." That fix stands; this spec is the follow-up the
user asked for — the broader app-flow so the *system*, not just one search
box, makes the correct sequence obvious. Scope, per explicit user answers
during brainstorming: **redesign the app itself** (not a written guide),
**admin/manager only** (sales_staff/technician's checkout-first flow is
unchanged).

Recon during brainstorming surfaced two further concrete, previously-unnoticed
gaps in the same area:
- `ProductDetailPageClient`'s "Reorder" button is hardcoded `disabled` — wired
  to nothing.
- Dashboard's `LowStockTable` has no action at all on a low/out-of-stock row.
- Manager lands on `/dashboard` after login (`app/login/page.tsx`), but
  `DashboardPageClient` renders `AdminOnlyNotice` when `data.isForbidden` —
  the backend dashboard endpoints are gated to `IsAdmin` (admin-strict,
  excludes manager; see `[[project_isadmin_gotcha]]` memory). A manager's
  first post-login screen can be an "admin only" wall. This spec's checklist
  change (below) incidentally does NOT fix this — it's a pre-existing
  backend-permission mismatch, flagged here for visibility but out of scope
  for this pass (it needs a decision on whether managers should see the
  dashboard at all, which wasn't asked during brainstorming).
- Products' own "New product" form (`ProductFormDialog`, create mode) has no
  duplicate-name checking at all — the same failure mode purchasing had,
  un-fixed, because it's a blank form rather than a search-first UI.

## Goals

- State the products/purchases/stock/sales relationship explicitly in the UI,
  not just in developers' heads: Products = catalog (no quantity ever),
  Purchases = the only place stock increases, Sales = the only place stock
  decreases (purchase cancellation, already shipped, is the one exception),
  Stock = a read-mostly mirror of what Purchases/Sales have done.
- A first-time admin/manager sees a short setup checklist instead of empty
  KPI charts, and it permanently gives way to the normal dashboard once setup
  is done.
- Nav order reads left-to-right as the natural sequence: set up catalog → buy
  stock → watch stock → sell it.
- Low stock (dashboard table, product detail page) is one click away from
  actually doing something about it, carrying the specific product forward
  into a new purchase instead of dead-ending.
- The duplicate-product risk is guarded symmetrically in both places a
  product can be created (already done in Purchasing; add it to Products'
  own form).

## Non-goals

- Anything about sales_staff/technician's checkout flow (explicitly deferred
  by the user this pass) — including the related, real gap found in recon
  that Checkout doesn't warn before adding an out-of-stock item to the cart,
  only fails at final submit.
- Fixing the manager/dashboard `IsAdmin` permission mismatch noted above —
  flagged, not designed here.
- Any backend change. Every item below is achievable frontend-only; nothing
  here needs a new endpoint, model field, or migration.
- A generic "preferred supplier per product" feature. Reorder still requires
  picking a supplier — there's nowhere to store or infer a default one, and
  building that is out of scope for closing this particular loop.

## 1. Dashboard setup checklist

New component `components/dashboard/SetupChecklist.tsx`. `DashboardPageClient`
renders it instead of `QuickActions`/`StatCards`/the chart grid when setup is
incomplete; otherwise renders exactly what it renders today (unchanged).

**Completeness check** — a purchase has ever been received, full stop:

```ts
const hasReceivedPurchase = purchases.some((p) => p.status === "received");
```

This is the *only* gate, and it's one-way: once true for a shop, the
checklist never reappears, even if every product later drops back to zero
stock (that's normal operation, not an unfinished setup — re-showing a setup
checklist because of a low-stock moment would be confusing, not helpful).
`DashboardPageClient` needs a `purchases` query it doesn't have today — reuse
`usePurchases()` (already built for `PurchasesPageClient`, same
`fetchAllPages<Purchase>("purchases/")` shape) rather than adding a new hook.

**Item detection**, all derived from data `DashboardPageClient` already has
or now fetches, no new endpoints:

1. "Add your first category" — `categories.length === 0`
2. "Add your first product" — `products.length === 0`
3. "Record and receive your first purchase" — `!hasReceivedPurchase` (always
   unchecked while the checklist is showing at all, by definition of the
   gate above — included anyway so the list reads as a real 3-step sequence
   rather than jumping straight to step 3)

Each item is a link, not an auto-opened dialog — plain navigation to the
already-existing entry points (Products has its own "+ New product" and
"Manage categories" buttons right there; no need to duplicate that
affordance here):

- Item 1 → `/products`
- Item 2 → `/products`
- Item 3 → `/purchases?open=new` (see the query-param convention in section
  3 — this is the one checklist item that benefits from a one-click open,
  since "create your first purchase" is the actual call to action, not just
  "go look at this page")

Visually: a `Card` with a short intro line ("Let's get your shop set up") and
three rows, each a checkbox-style status icon (done = filled/accent, not-done
= outline) + label + link, matching the existing `Tag`/`Card` visual
language — no new design system.

## 2. Nav order

`components/layout/Nav.tsx`, `ADMIN_LINKS`: reorder from

```
Dashboard, Products, Sales, Purchases, Stock, Suppliers, Customers
```

to

```
Dashboard, Products, Purchases, Stock, Sales, Suppliers, Customers
```

(`Employees`/`Expenses` still appended after, admin-strict, unchanged.)
`STAFF_LINKS` (sales_staff/technician) is unchanged — out of scope per the
role-scope answer. `Nav.test.tsx`'s `getNavLinksForRole` assertions that
`toEqual` an exact array need their expected order updated to match.

## 3. Reorder: low stock → a prefilled purchase, one click

**The query-param convention.** `PurchasesPageClient` reads
`useSearchParams()` for two things, both optional and independent:

- `open=new` — auto-opens `NewPurchaseDialog` on mount (same dialog the
  existing "+ New purchase" button opens; this just also opens it
  programmatically once, via a `useEffect` keyed on the param being present).
- `reorder_product` / `reorder_name` — when present alongside `open=new`,
  passed into `NewPurchaseDialog` as an optional prop. Not used to skip the
  supplier picker (nothing stores a per-product preferred supplier — picking
  one is still a required, manual step) — only carried forward for what
  happens *after* the purchase header is created.

**`NewPurchaseDialog`** already does `router.push(`/purchases/${created.purchase_id}`)`
on successful create (`handleSubmit`). When it received reorder props, it
instead pushes `/purchases/${created.purchase_id}?prefill=${encodeURIComponent(reorder_name)}`.

**`PurchaseWorkspaceClient`** reads `prefill` from `useSearchParams()` and
passes it to `AddProductSingleForm` as a new optional prop
(`initialSearch?: string`).

**`AddProductSingleForm`**: `useState(() => initialSearch ?? "")` seeds
`search` instead of always starting empty. A `useEffect` on mount: if
`initialSearch` is set and exactly one product's normalized name equals the
normalized `initialSearch` (not just a substring match — an exact match
only, to avoid guessing wrong), call `selectProduct()` immediately instead
of leaving the user to click the one visible match. A substring/multiple-match
or zero-match result just leaves the search box prefilled, same as if the
user had typed it themselves — no auto-select ambiguity.

**Entry points**, both building the same URL shape
(`/purchases?open=new&reorder_product=${product_id}&reorder_name=${encodeURIComponent(name)}`):

- `ProductDetailPageClient`: the "Reorder" button loses `disabled` and
  becomes a `Link` (or `Button` with `href`, matching how other nav-style
  buttons in this codebase are built — e.g. `QuickActions`' `Button href=...`)
  to this URL, using `detail.product.product_id`/`detail.product.name`.
- `LowStockTable` (`components/dashboard/LowStockTable.tsx`): add a fourth
  column, "Action", a small "Reorder" link per row, same URL shape using
  `r.product_id`/`r.name` (the `CatalogProduct` rows it already receives
  carry both).

## 4. Duplicate-name warning on Products' own "New product" form

`ProductFormDialog` (create mode only — editing an existing product's name
isn't a duplicate-creation risk). Needs the existing products list to check
against; it currently only receives `categories` as a prop. `ProductsPageClient`
already has the full list via `catalog.all` (`useCatalogProducts()`) — pass
it down as a new `existingProducts: CatalogProduct[]` prop, reusing
already-fetched data rather than an extra query. (`ProductDetailPageClient`'s
own `ProductFormDialog` usage is edit-mode only, so it doesn't need this
prop — pass `[]` or make it optional, defaulting to no check when absent.)

Reuse the exact matching approach already shipped in `AddProductSingleForm`
(`normalizeName`: trim, lowercase, collapse whitespace, substring match) —
same risk, same fix, don't invent a second algorithm. As `values.name`
changes in create mode, compute the first matching existing product (if any)
and render a small non-blocking note under the Name field:

```
A similar product already exists: Scales 60kg (PES-SCL-00001)
```

Non-blocking: doesn't prevent submission, doesn't require confirmation —
purely informational, styled like the other inline hint text already in this
file (`text-xs text-text/50`-weight, not an error color, since it's not a
validation failure).

## Testing

All frontend, `vitest` + existing conventions in each touched file's sibling
`*.test.tsx` — no backend tests needed (no backend changes).

- `SetupChecklist.test.tsx` (new): renders when incomplete, each item's
  checked/unchecked state and link `href`, does not render once a received
  purchase exists.
- `DashboardPageClient.test.tsx`: switches between checklist and normal
  dashboard content based on the same condition.
- `Nav.test.tsx`: update the three `getNavLinksForRole` order assertions.
- `ProductDetailPageClient` page test: Reorder button is an enabled link
  with the right `href`, not a disabled button.
- `LowStockTable.test.tsx`: Reorder link per row, correct `href`.
- `PurchasesPageClient` test: `?open=new` auto-opens the dialog;
  `reorder_product`/`reorder_name` flow through to `NewPurchaseDialog`.
- `NewPurchaseDialog.test.tsx`: redirects to the plain purchase URL when no
  reorder props were given (existing behavior, must not regress); redirects
  with `?prefill=` when they were.
- `AddProductSingleForm.test.tsx`: `initialSearch` seeds the search box;
  auto-selects on an exact single match; leaves the box prefilled
  (no auto-select) on zero or multiple matches.
- `ProductFormDialog.test.tsx`: shows the "similar product" note in create
  mode on a name match; doesn't show it in edit mode or with no match;
  submitting isn't blocked by its presence.
