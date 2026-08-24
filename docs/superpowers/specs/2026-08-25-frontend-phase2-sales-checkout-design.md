# Frontend Phase 2: Sales/Checkout — Design

## Context

Frontend Phase 1 (Foundation) is complete and merged to `main`: project scaffold, Nocturne
design-token theme, reusable UI components (`Button`, `Card`, `Field`, `Tag`, `Table`, `Dialog`,
`Toast`, `SegmentedToggle`), the BFF auth flow, and the role-gated `(protected)` layout shell with
nav. Only the login screen (mockup `1a`) has real content — `/checkout` and `/dashboard` are
`"Coming soon"` stubs, and every other domain route 404s.

The backend (Phases 1-6) is complete for every domain except purchasing, whose API still models
the mockup's older scan-in design (`1f`) rather than the reworked shop-assigned-barcode /
overhead-allocation flow the newer mockup sections (`2`, `3`) describe. Per a decision made before
this phase, purchasing frontend work is deferred until that backend rework happens; this phase and
the ones after it build out the rest of the app first: Sales/Checkout → Catalog →
Stock/Equipment → Suppliers/Customers/Employees → Notifications → Dashboard.

This phase — Sales/Checkout — is the first domain screen. It builds the point-of-sale flow: a new
sale (scan/search → cart → totals → complete), the receipt, and a tablet-optimized variant of the
same flow. Staff land here immediately after login, so it's the highest-traffic screen in the app.

## Decisions made (with the user)

1. **Scope: mockups `1b` (checkout), `1c` (receipt), and `1n` (tablet POS checkout) together, one
   page/route.** Desktop and tablet share the same cart/totals/submit logic; only the layout
   differs (table vs. card-stack, per a Tailwind breakpoint — see Layout below). Tablet's other
   two screens (`1o` receive-stock, `1p` equipment status) are out of scope — they belong to the
   Stock/Equipment and Purchasing phases respectively.
2. **The motion spec (mockup section `4`: scan pulse, spinner, checkmark-draw completion,
   skeleton loading, cross-fade transitions) is explicitly deferred to a later cross-cutting
   polish pass**, once more screens exist to apply it consistently across. This phase uses plain,
   functional loading/success states.
3. **Barcode scanning is plain keyboard-emulation input** — no scanner-hardware SDK or Web Serial
   integration. A USB/Bluetooth barcode scanner types digits into whatever text field is focused
   and sends Enter, identically to a person typing a barcode and pressing Enter. The "Scan barcode
   or search product" field is just a normal controlled `<input>`.
4. **EN/RW toggle stays visual-only**, consistent with Phase 1 Decision 5 — no i18n library, no
   Kinyarwanda strings introduced in this phase.
5. **Receipt printing uses the browser's native `window.print()`** against a `@media print`
   stylesheet scoped to the receipt card — no PDF generation, no thermal-printer/ESC-POS
   integration.
6. **Sale returns/cancellation are out of scope for this phase**, even though the backend already
   supports `POST /sales/{id}/return/` and `/cancel/`. This phase covers creating a new sale
   end-to-end only; browsing/reversing past sales becomes its own later phase.
7. **One small backend addition**: add an `?is_current=true` query filter to
   `ProductPricingViewSet.get_queryset`, mirroring the filter pattern already used by that same
   view (`?product=<id>`) and by `InventoryViewSet` (`?low_stock=true`). Without it, getting "all
   current retail prices" requires fetching the entire price-history table (one row per price
   change, ever) and filtering client-side — bounded today, but it degrades every time any
   product's price changes. `Product` (no search/barcode filter) and `Inventory` (bounded, one row
   per product) don't need backend changes — see Data flow below for why.

## Architecture

```
frontend/
  app/
    (protected)/
      checkout/page.tsx         — replaces the stub; renders <PosCheckout>
  components/
    pos/
      PosCheckout.tsx           — top-level state: cart, submit, view (cart | receipt)
      CartTable.tsx             — desktop layout (mockup 1b), >= lg breakpoint
      CartCards.tsx             — tablet layout (mockup 1n), < lg breakpoint
      Receipt.tsx                — mockup 1c, print-styled
      ScanSearchField.tsx        — shared scan/search input + "not in catalog" inline state
    layout/
      ToastProvider.tsx          — new: context + useToast(), mounted in (protected)/layout.tsx
  lib/
    pos/
      usePosCatalog.ts            — joins products + current pricing + inventory into a lookup map
      cart.ts                     — pure functions: addItem, setQuantity, removeItem, totals
  backend/catalog/views.py        — ProductPricingViewSet.get_queryset: add is_current filter
```

`PosCheckout` holds `view: "cart" | "receipt"` and switches between `<CartTable>`/`<CartCards>`
(picked by CSS breakpoint, not JS — both render, one is hidden via Tailwind `hidden lg:block` /
`lg:hidden`, so there's no layout-detection flicker) and `<Receipt>` after a successful sale.

## Data flow

**Catalog lookup (`usePosCatalog`):** three TanStack Query hooks — `useProducts()` (`GET
/products/`), `useCurrentPricing()` (`GET /product-pricing/?is_current=true`, the new filter), and
`useInventory()` (`GET /inventory/`) — each cached independently. A `useMemo` joins them on
`product_id` into `Map<barcode, PosProduct>` (`{product_id, barcode, name, brand, model_number,
category_name, retail_price, quantity_in_stock}`). All three lists are bounded by catalog size
(products, current-prices-only, one-inventory-row-per-product), so fetching each in full and
joining in memory is the right call at this scale — no new search infrastructure needed.

**Scan/search:** the input's `onChange` (search-as-you-type) and `onKeyDown` (Enter, for scanner
input) both resolve against the joined map — exact `barcode` match first, then a
case-insensitive substring match against `name`/`brand`/`model_number`/`barcode` for the "Search"
button/typed queries. A match calls `cart.addItem`; no match shows the mockup's own inline
"Not in catalog — add product?" text next to the field (link is a placeholder for now — creating
new products belongs to the Catalog phase).

**Cart state:** plain `useState<CartLine[]>` in `PosCheckout`, `CartLine = {product: PosProduct,
quantity: number}`. `lib/pos/cart.ts` holds pure helpers (`addItem` increments quantity if the
product's already in the cart, `setQuantity`/`removeItem`, `totals(lines)` → `{itemCount,
subtotal}`) so they're unit-testable without rendering anything.

**Submit:** `Complete sale` calls `apiFetch<Sale>("sales/", {method: "POST", body:
JSON.stringify({items: lines.map(l => ({product: l.product.product_id, quantity: l.quantity})),
payment_method, customer})})` — `CreateSaleSerializer` already accepts exactly this shape. On
success, `PosCheckout` stores the returned `Sale` and switches `view` to `"receipt"`; the
`usePosCatalog` queries invalidate (`quantity_in_stock` changed) so returning to a new sale shows
fresh stock numbers.

## Toast manager

Phase 1 built the `Toast` presentational component but no trigger/queue/dismiss mechanism — this
phase adds the minimal one that unblocks it: a `ToastProvider` (React context) holding one active
`{message, variant} | null`, with `useToast()` exposing `show(message, variant?)`. Auto-dismiss
after 4s (matches the mockup's `toastIn` animation's rough on-screen duration, without adopting
its exact motion — Decision 2). Mounted once in `(protected)/layout.tsx` so every phase after this
one reuses it for mutation feedback and errors, per Phase 1's own stated intent.

## Layout: desktop vs. tablet

Single route, one breakpoint: Tailwind's `lg` (1024px). `>= lg` renders `<CartTable>` (mockup
`1b`'s table: Product/Barcode/Retail price/Qty/Subtotal columns, 350px-wide totals+payment rail).
`< lg` renders `<CartCards>` (mockup `1n`'s stacked cards with 44px `−`/`+` steppers and touch
targets, `Due` stat card, vertical payment-method segmented control). Both consume the same `cart`
state and helpers — only presentation differs. The existing role-gated `Nav` is unchanged at every
width (Decision 1 — the mockup's tablet-condensed nav is cosmetic, deferred).

## Receipt

`<Receipt sale={sale} employee={session} />` renders mockup `1c`: shop identity placeholders
(matching the login screen's `[Shop Address] · [Phone] · [Email]`), sale id/date/served-by/payment
method, line items, total, and the Murakoze/warranty footer copy verbatim from the mockup.
`Print receipt` calls `window.print()`; a `@media print` block (scoped via a wrapping class, e.g.
`.receipt-print`) hides everything else on the page — nav, toasts, the rest of the app chrome —
matching how a real till receipt print should look. `New sale` resets `PosCheckout`'s `view` to
`"cart"` and `lines` to `[]`.

## Error handling

- **Unknown barcode/no search match:** inline text near the scan field (no modal, no toast) —
  matches the mockup's own stated pattern.
- **`400` from `POST /sales/`** (e.g., insufficient stock, empty `items`): toast with the
  response's error message via the new `ToastProvider`; cart state is untouched so the user can
  correct and retry without re-entering everything.
- **`401` (session expired):** already handled generically by the BFF proxy (Phase 1) — redirects
  to `/login`.
- **`403`/`404`/`5xx`/network failure:** generic toast ("Something went wrong — try again"),
  reusing Phase 1's existing error-normalization shape from the proxy route.

## Testing

**Vitest + RTL:**
- `lib/pos/cart.ts` — pure-function unit tests (add/increment, set/remove quantity, totals math,
  including edge cases like removing the last line and setting quantity to 0).
- `usePosCatalog` — join logic against mocked product/pricing/inventory responses (product with no
  current price row, product with no inventory row, barcode exact-match vs. name substring-match).
- `CartTable`/`CartCards` — render + interaction tests (add via scan, change qty, remove line,
  totals reflect state) for each layout independently.
- `Receipt` — renders sale data correctly; `Print receipt` triggers `window.print` (mocked).
- `ToastProvider`/`useToast` — show/auto-dismiss.

**Playwright e2e** (extends the existing login-smoke pattern): login as `sales_staff` → land on
`/checkout` → scan/search a known fixture product → complete a sale with a payment method → assert
the receipt shows correct line items and total → `New sale` returns to an empty cart. One test,
not a matrix over every payment method or role — proportional to what this phase adds, matching
this project's established testing discipline.

## Out of scope for this phase

- Purchasing (`2a`/`2b`/`2c`, `3a`/`3b`/`3c`) — deferred pending the backend rework decision made
  before this phase.
- Every other domain screen (catalog `1d`/`1e`, stock/equipment `1g`/`1h`, suppliers `1i`,
  customers `1j`, employees `1k`, notifications `1l`, dashboard `1m`) — each gets its own later
  spec → plan → implementation cycle, per the agreed phase order.
- Tablet POS receive-stock (`1o`) and equipment status (`1p`) — belong to Stock/Equipment and
  Purchasing respectively.
- The motion/animation spec (mockup section `4`) — later cross-cutting polish pass (Decision 2).
- Sale returns/cancellation, even though the backend API already exists (Decision 6).
- Real i18n/Kinyarwanda translation (Decision 4, consistent with Phase 1 Decision 5).
- New product creation from the "not in catalog" inline link — the link renders but doesn't yet
  navigate anywhere functional; belongs to the Catalog phase.
- Customer lookup/creation. The "Customer (optional — walk-in if blank)" field renders per the
  mockup but is inert in this phase: no search-by-name/phone, and the sale always submits
  `customer: null`. A real search-existing-customers component depends on the Customers phase
  (`1j`) and would otherwise block this phase on out-of-order work.
