# Frontend Phase 3: Catalog — Design

## Context

Frontend Phase 2 (Sales/Checkout) is complete and merged to `main`: the `/checkout` route is a real
point-of-sale screen, and Phase 1's foundation (design tokens, UI component library, BFF auth flow,
role-gated nav, `Providers`/`ToastProvider`) is in place and already exercised by real code. `/products`
still 404s even though `Nav` already links to it for both staff and admin.

This phase — Catalog — builds the product list (mockup `1d`) and product detail (mockup `1e`)
screens: browsing/searching/filtering the catalog, viewing a product's stock/pricing/specs/price
history, creating a new product, editing an existing one, and setting a new price. The backend API
for all of this already exists in full (Phase 1's `catalog` app) — no backend changes are needed
for this phase, unlike Phase 2's one-line filter addition.

Per the agreed phase order, Purchasing remains deferred pending its backend rework (mockup sections
2/3). This phase and the ones after it (Stock/Equipment → Suppliers/Customers/Employees →
Notifications → Dashboard) proceed independently of that.

## Decisions made (with the user)

1. **"Reorder" (mockup `1e`) renders as a disabled placeholder button.** It implies kicking off a
   purchase, which doesn't have a frontend yet (Purchasing is deferred). Matches the mockup's
   layout pixel-for-pixel without pretending to be functional.
2. **"Track serials" is derived, not stored.** The mockup's own assumptions list mentions a
   per-product "track serials" flag, but `Product` has no such field, and nothing else in the
   system enforces or reads one — only `EquipmentUnit` rows (independently created) exist. Rather
   than add an unused schema field, the product detail page shows "Track serials: On" whenever
   `GET /equipment-units/?product=<id>` returns at least one row, and "Off" otherwise. No backend
   change.
3. **Editing is one unified form + a separate price action.** A single `ProductFormDialog` (shared
   between create and edit) covers `Product` fields and, when editing an existing product,
   `Inventory.storage_location`. Setting a new price is a distinct action next to the price-history
   table — it creates a new `ProductPricing` row server-side (price history, not a mutation), so
   folding it into the same form would misrepresent what submitting it does.
4. **"+ New product" is in scope.** The mockup shows it directly on the list toolbar; the backend
   already supports `POST /products/` with server-generated barcode. Built alongside product edit
   since the two forms share almost all their fields.
5. **Print info sheet uses real `window.print()`** + a scoped `@media print` block, the same
   pattern Phase 2's receipt established — no PDF generation, no new printing infrastructure.
6. **Create/Edit uses the existing `Dialog` component**, not dedicated routes. The product list
   stays visible/scrollable behind it; one dialog component serves both create and edit since the
   field set is nearly identical.
7. **"+ New product" and "Edit" are admin/manager only in the UI**, even though the backend's
   `ProductViewSet`/`ProductPricingViewSet` permissions are just `IsAuthenticated` (no role check).
   The mockups consistently frame these screens from an Admin's perspective; Sales Staff keep full
   read/search/browse access via `/products` (already linked in their nav) but don't see the
   create/edit affordances. This is a UI-only gate, not a backend change — role comes from the
   existing session the same way Phase 2's Wholesale-column gating already works.
8. **A newly-created product has no `Inventory` row and `storage_location` cannot be set for it
   yet.** Confirmed from the backend: nothing auto-creates `Inventory` on `Product` save — it's
   only created via `get_or_create` inside the sales/purchasing services when stock first moves,
   and `InventoryViewSet` only allows `GET`/`PATCH` (no `POST`). So the create form has no
   `storage_location` field at all; the edit form shows it only when the product being edited
   already has an `Inventory` row (i.e., has been received/sold at least once). This is a known,
   accepted scope boundary, not treated as a gap to fix — Catalog defines what a product *is*;
   Stock/Purchasing defines what physically exists and where.

## Architecture

```
frontend/
  app/(protected)/
    products/
      page.tsx                    — product list (mockup 1d)
      [id]/page.tsx                — product detail (mockup 1e)
  components/products/
    ProductTable.tsx               — desktop-width list table (reuses ui/Table.tsx)
    ProductFormDialog.tsx          — shared create/edit dialog
    SetPriceDialog.tsx             — new-price-row dialog, opened from product detail
    StockCard.tsx                  — product detail: stock/location card
    PricingCard.tsx                — product detail: current price + margin, admin-only
    CatalogInfoCard.tsx            — product detail: category/brand/warranty/track-serials
    InfoSheetCard.tsx              — product detail: usage instructions + print
    SpecificationsCard.tsx         — product detail: specifications text
    PriceHistoryCard.tsx           — product detail: price-history table
  lib/products/
    useCatalogProducts.ts          — products+categories+current pricing+inventory join, list-page shaped
    useProductDetail.ts            — single product + its price history + its equipment-unit count
    productForm.ts                 — shared create/edit payload building + client-side validation
```

**Why a separate `useCatalogProducts` instead of extending Phase 2's `usePosCatalog`:** the two
screens need different shapes from the same underlying data — POS needs a lean barcode-keyed
lookup with no admin-only fields; Catalog's list needs wholesale price (when present),
`reorder_level`, `category_id` (for the filter tabs), and a derived status tag. Rather than
overload `PosCatalog`'s type with catalog-only fields, `useCatalogProducts` declares its own
`useQuery` calls — using the **exact same query keys** (`["products"]`, `["categories"]`,
`["product-pricing", "current"]`, `["inventory"]`) that `usePosCatalog` already uses. TanStack
Query dedupes by key, not by call site, so navigating between `/checkout` and `/products` shares
one cache instead of two independent fetches — with zero changes to Phase 2's files.

## Product list (`1d`)

`app/(protected)/products/page.tsx` reads the session server-side (`getSession()`, same pattern as
`/checkout`) and passes `role` down. `useCatalogProducts()` returns each product as:

```typescript
interface CatalogProduct {
  product_id: number;
  name: string;
  brand: string | null;
  model_number: string | null;
  barcode: string;
  category_id: number;
  category_name: string;
  retail_price: number;
  wholesale_price: number | null;   // null when the API omitted it (non-admin) or no pricing row exists
  quantity_in_stock: number;
  reorder_level: number;
  status: "ok" | "low_stock" | "out_of_stock";
}
```

`status` is derived once at join time: `quantity_in_stock === 0` → `"out_of_stock"`;
`quantity_in_stock <= reorder_level` → `"low_stock"`; else `"ok"` — matching the mockup's own rule
("Low stock = in stock ≤ reorder level") and its three-tag styling (`tag-accent` / `tag-outline` /
`tag-neutral`).

Category tabs are built from the fetched `categories` list (not hardcoded) — `All` plus one tab
per category, matching the mockup's dynamic-looking `TVs/Audio/Mobile/Appliances` set. Search
matches name/brand/barcode substrings, client-side, same scale reasoning as Phase 2's `searchCatalog`
(the whole catalog is already in memory for the join — a shop's catalog is hundreds, not millions,
of rows).

The Wholesale column is included in `ProductTable`'s column list only when the page-level `role` is
`admin`/`manager` — server-driven, not a client-side visibility hack, since the API itself already
omits the field for non-admins (the column would otherwise render `null`/blank, not actually hide
information, but the column shouldn't exist at all for the mockup's stated "Admin only" framing).

"Open" links to `/products/[id]`. "+ New product" opens `ProductFormDialog` in create mode.

## Product detail (`1e`)

`app/(protected)/products/[id]/page.tsx` uses `useProductDetail(id)`, which fetches: the single
product (`GET /products/:id/`), its price history (`fetchAllPages` over
`product-pricing/?product=<id>`, ordered by `effective_date desc` — the API already orders this
way), its inventory row if any (reuses the same `["inventory"]` query, found by product id — no new
fetch), and its equipment-unit count (`GET /equipment-units/?product=<id>`, used only for the
"Track serials" derivation per Decision 2 — the count itself isn't displayed, just its presence).

- **Header:** name, derived status tag (same three-way logic as the list), barcode, disabled
  "Reorder" button (Decision 1), "Edit" (opens `ProductFormDialog` in edit mode).
- **Stock card:** `quantity_in_stock` / `quantity_in_use` / `quantity_damaged` /
  `storage_location` from the inventory row — if none exists yet, shows "Not yet received" instead
  of blank fields (Decision 8 made visible, not silently empty).
- **Pricing card (admin/manager only):** current retail, current wholesale (when present), a
  computed margin `(retail − wholesale) / retail`, and the current row's `effective_date`. Hidden
  entirely for non-admin roles — mirrors the list's Wholesale-column gating.
- **Catalog info card:** category, brand/model, warranty months, "Track serials" (Decision 2).
- **Info sheet card:** `usage_instructions` text, "Print info sheet" (real print, Decision 5),
  "Edit" (opens the same `ProductFormDialog` as the header's Edit — not a separate, narrower edit
  affordance; the mockup's two "Edit" links both mean "edit the product").
- **Specifications card:** `specifications` text (a single free-text field on the backend, not
  structured key-value data — rendered as-is, matching how the mockup's own multi-line spec strings
  render as plain text elsewhere in this codebase already).
- **Price history card:** table of all `ProductPricing` rows for this product, current row tagged
  `current` (`is_current === true`), matching mockup `1e` exactly. "Set new price" button opens
  `SetPriceDialog`.

## Create / Edit (`ProductFormDialog`)

One dialog, two modes. Fields, all mapping directly to existing `Product`/`Inventory` API fields:

| Field | Create | Edit | Notes |
|---|---|---|---|
| `name` | yes | yes | required |
| `category` | yes (select) | shown, **disabled** | immutable after creation — backend's `validate_category` rejects a change |
| `brand` | yes | yes | optional |
| `model_number` | yes | yes | optional |
| `description` | yes | yes | optional, plain input |
| `specifications` | yes | yes | optional, `<textarea>` |
| `usage_instructions` | yes | yes | optional, `<textarea>` |
| `warranty_months` | yes | yes | optional, number |
| `reorder_level` | yes | yes | number, defaults to backend's default if left blank |
| `unit` | yes | yes | text, e.g. "pcs" |
| `storage_location` | **not shown** | shown only if an `Inventory` row exists (Decision 8) | PATCHes `Inventory`, not `Product` |
| `barcode` | — | — | never editable, system-generated, shown read-only in edit mode header only |

Submit: create → `POST /products/` (barcode comes back auto-generated per existing backend
behavior, no client involvement); edit → `PATCH /products/:id/` for Product fields, and if
`storage_location` was shown and changed, a second `PATCH /inventory/:inventory_id/` — two
requests, not because the UI shows two forms, but because they're two backend resources. On
success, invalidate the `["products"]` and (if inventory was touched) `["inventory"]` query keys so
the list/detail reflect the change immediately, and close the dialog.

## Set New Price (`SetPriceDialog`)

Opened from the price-history card. Fields: `retail_price` (required), `wholesale_price` (required
for admin, hidden/omitted for non-admin — the backend already resolves it server-side by carrying
forward the previous current price for non-admin submissions, per existing `ProductPricingViewSet`
behavior), `effective_date` (defaults to today). Submits `POST /product-pricing/`. On success,
invalidate `["product-pricing", "current"]` (so the list/detail's displayed price updates) and the
per-product price-history query, then close.

## Error handling

Reuses Phase 2's established patterns — no new mechanism:
- Field-level `400` validation errors from `POST`/`PATCH` map to per-field messages on the form
  (DRF's `{"field": ["message"]}` shape, same as every other form in this codebase).
- `403` (e.g., a non-admin somehow reaching an admin-only price submission) → toast via the
  existing `useToast()`.
- `404`/`5xx`/network failure → toast, dialog stays open with the form intact so nothing typed is
  lost.
- The list/detail pages' own data fetching reuses the loading/error guard pattern Phase 2's final
  review flagged as worth generalizing — this phase applies the same two-branch
  (`isLoading`/`isError`) guard inline at each screen rather than introducing a new shared
  component; extracting a reusable `QueryGate` is left as a follow-up recommendation, not built
  here, to avoid speculative abstraction from a sample size of two screens.

## Testing

**Vitest + RTL:** `useCatalogProducts`'s join and status-derivation logic (mirroring Phase 2's
`usePosCatalog` test structure — mocked fetch per endpoint, asserting the joined shape and all
three status values); `ProductTable` render/interaction (search, category tab filtering, Wholesale
column presence/absence by role); `ProductFormDialog` (create submit payload shape, edit submit
payload shape including the immutable-category disabled state, the conditional
`storage_location` field); `SetPriceDialog` (submit payload, admin-vs-non-admin wholesale field
visibility); each product-detail card's rendering, including the "Track serials"
derivation and the "no inventory row yet" state.

**Playwright e2e:** one smoke test extending the existing pattern — log in as admin → open
`/products` → search for a fixture product → open its detail page → edit a field → see the change
reflected on return to the list. Proportional to this phase's scope, matching the discipline
established in Phase 2.

## Out of scope for this phase

- Purchasing-driven product creation (mockup `2a`'s "new product not in catalog" flow) — that's
  Purchasing's own phase, once its backend rework lands.
- The "Reorder" button's actual behavior (Decision 1).
- A real, backend-persisted `track_serials` field (Decision 2) — revisit only if something besides
  this one UI label ever needs to read or set it.
- Deleting products (no delete affordance in the mockup; the backend's `ProductViewSet` supports
  DELETE but nothing in this phase's screens exposes it).
- A reusable `QueryGate` component (mentioned in Error handling) — a follow-up recommendation from
  Phase 2's final review, not built here.
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
