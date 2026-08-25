# Frontend Phase 8: Purchasing — Design

## Context

Every prior frontend phase spec (Foundation, Sales/Checkout, Catalog) noted that Purchasing was
"deferred pending backend rework." That rework is done: `backend/purchasing/services.py` and
`backend/catalog/services.py::generate_barcode` already implement the reworked flow the mockup
describes — the shop assigns the barcode at purchase-entry time (`PES-{CAT}-{00001}`), not by
scanning an existing manufacturer barcode. The mockup's own "try next" note on its old scan-in
screen (`1f`) says to "retire 1f" once the reworked screens exist — this phase builds only the
rework (`2a`/`2b`/`2c`, plus the tablet variant `1o`), not `1f`.

This phase builds: `2a` (new purchase — PO header + single-product add), `2b` (bulk entry — one
row per product), `2c` (admin "edit on the go" over the product catalog), and `1o` (tablet —
receive stock: scan → qty/cost → add to purchase). The backend API for all of this already exists
in full (`purchasing` app) — no backend changes are needed for this phase.

## Decisions made

1. **A purchase list page is built even though no mockup screen shows one.** `2a` is a
   single-purchase workspace (`Purchase #P-2026-0114`) — reaching it implies a prior "which
   purchase" step. `/purchases` (already linked in `Nav.tsx` for every role) needs a landing
   page. Built as a table (supplier, date, status, totals-when-admin) with a "+ New purchase"
   action that creates a draft header and navigates into the `2a` workspace. Same kind of
   structural gap-filling Catalog's own list page and Stock's overview page already established
   as normal for this codebase.
2. **Creating a purchase is a two-step flow, matching the backend exactly**: `POST /purchases/`
   creates a draft header (supplier, invoice number, purchase date, payment status) with zero
   items; the workspace page then lets the user add items to that draft one at a time (or in bulk
   rows). This is not a UI simplification — the backend has no "create purchase with items in one
   call" endpoint, so the two-step shape is the only shape that exists.
3. **`2c`'s "edit on the go" drawer reuses Catalog's existing dialogs, not a new implementation.**
   `components/products/ProductFormDialog.tsx` (specs/price/storage) and
   `components/products/SetPriceDialog.tsx` (new price row) already do exactly what `2c`
   describes ("selling price... specifications... storage location... price edits create a new
   price-history row"). Every item row in the purchase workspace gets an "Edit product" action
   that opens `ProductFormDialog` in edit mode directly — no parallel save logic, no new
   persistence path. This keeps `2c` "wired" without a second implementation of what Catalog
   already owns.
4. **No live barcode preview before submission.** `2a`'s mockup shows a barcode
   ("PES-AUD-00147") displayed *before* the item is added, implying a live preview. The real
   `generate_barcode()` locks the category row and computes the next suffix transactionally —
   duplicating that logic client-side to "guess" a preview would be racy and could show a barcode
   that doesn't match what the server actually assigns moments later. Instead, the barcode is
   shown *after* the item is successfully added (using the server's real, authoritative value),
   in the "on this purchase" list. This mirrors this codebase's existing "server-authoritative"
   precedent (Checkout's totals are computed server-side, not previewed client-side).
5. **"Regenerate" (barcode) is a disabled placeholder.** No backend endpoint exists to
   regenerate a product's barcode after creation — same treatment as Catalog's "Reorder" button
   (Decision 1 there): pixel-accurate, non-functional, not pretending to work.
6. **"Print N labels" / "Print all new labels" use real `window.print()`**, the exact pattern
   already established by Catalog's `InfoSheetCard` — no PDF generation, no new printing
   infrastructure. A print-scoped view lists barcode + product name per newly-added item.
7. **Bulk mode (`2b`) is a client-side convenience over the same single-item endpoint** — the
   backend has no bulk-create endpoint for purchase items. Submitting a bulk table fires one
   `POST /purchases/<id>/items/` per row sequentially (not `Promise.all` in parallel — the
   backend recomputes `Purchase.total_paid`/`total_invoiced` under a row lock on every add, so
   sequential submission avoids surprising totals from interleaved requests) and reports how many
   rows succeeded/failed rather than failing the whole batch on one bad row.
8. **The tablet variant (`1o`) lives at `/purchases/[id]/scan`**, not `/purchases/[id]/receive` —
   "receive" is reserved for the backend's finalize-and-increment-stock action
   (`POST /purchases/<id>/receive/`), and `1o` is really a tablet-friendly way to *add items* to
   a draft purchase before that finalization step. Naming it "scan" avoids confusing the two,
   and matches Stock & Equipment's own tablet-route precedent (`/stock/scan` for `1p`).
9. **Existing-vs-new-product search reuses the `["products"]`/`["categories"]` query keys** that
   Catalog's `useCatalogProducts` and Checkout's `usePosCatalog` already populate — searching in
   `2a`'s "Add product" field doesn't trigger a new fetch shape, it's a client-side substring
   match over already-cached data, consistent with every other search box in this codebase.
10. **Purchase header fields are not editable after items exist**, even though the backend's
    `PATCH /purchases/<id>/` technically allows it while `status === "draft"`. The mockup never
    shows a "resave header" affordance once you're inside the item-adding workflow — only
    creation-time header entry. Editing the header after the fact is left out to avoid inventing
    UI the mockup doesn't show (same discipline as every other phase's "don't build what isn't
    asked for" decisions).

## Architecture

```
frontend/
  app/(protected)/purchases/
    page.tsx                       — purchase list (server: role → client)
    PurchasesPageClient.tsx
    [id]/
      page.tsx                     — workspace (2a/2b)
      PurchaseWorkspaceClient.tsx
      scan/
        page.tsx                   — tablet quick-add (1o)
        ScanPageClient.tsx
  components/purchasing/
    PurchaseTable.tsx               — list table
    NewPurchaseDialog.tsx           — create-draft header form
    PurchaseSummaryCard.tsx         — running totals sidebar ("on this purchase")
    AddProductSingleForm.tsx        — 2a's single-add form (existing-or-new)
    AddProductBulkTable.tsx         — 2b's editable row table
    PurchaseItemsList.tsx           — "on this purchase" line list + Edit-product + print
    PrintLabelsView.tsx             — print-scoped barcode label list
  lib/purchasing/
    usePurchases.ts                 — list hook, joins Purchase + Supplier name
    usePurchaseDetail.ts            — single purchase (items embedded in the GET response)
    useCreatePurchase.ts            — POST /purchases/ mutation
    useAddPurchaseItem.ts           — POST /purchases/<id>/items/ mutation
    useRemovePurchaseItem.ts        — DELETE .../items/<id>/ mutation
    useReceivePurchase.ts           — POST /purchases/<id>/receive/ mutation
    purchaseForm.ts                 — header create payload/validation
    purchaseItemForm.ts             — add-item payload/validation (existing vs new product,
                                       paid≠invoiced discrepancy-note requirement)
```

Reused, not duplicated: `lib/suppliers/useSuppliers.ts` (supplier picker),
`components/products/ProductFormDialog.tsx` / `SetPriceDialog.tsx` (2c), `lib/api-client.ts`,
`components/ui/*`, `components/layout/ToastProvider.tsx`.

## Purchase list (no mockup screen — Decision 1)

`GET /purchases/` joined with `GET /suppliers/` (existing `useSuppliers` hook, shared query key)
for supplier name. Columns: Supplier, Invoice #, Date, Payment status, Status
(draft/received tag), Total paid (admin only — the API itself omits `total_paid`/`total_invoiced`
for non-admin, so the column doesn't render at all for non-admin, mirroring Catalog's Wholesale
column precedent). "+ New purchase" opens `NewPurchaseDialog`.

## New purchase (`NewPurchaseDialog`)

Fields: Supplier (select, from `useSuppliers`), Invoice number (optional text), Purchase date
(date, defaults to today), Payment status (segmented: Paid/Partial/Unpaid, defaults Paid — matches
`2a`'s mockup default and the backend's own default). Submits `POST /purchases/`. On success,
navigates to `/purchases/<new_id>`.

## Purchase workspace (`2a`/`2b`)

`app/(protected)/purchases/[id]/page.tsx` reads the purchase via `usePurchaseDetail(id)` (a single
`GET /purchases/<id>/` — items are embedded, no second fetch).

- **Header:** supplier name, invoice number, date, status tag (`draft`/`received`), read-only
  (Decision 10).
- **Add product** (draft only): a `Single`/`Bulk (2b)` segmented toggle, matching `2a`'s own
  toggle copy exactly.
  - **Single** (`AddProductSingleForm`): a search box over cached products (Decision 9) — if a
    result is selected, the form collapses to Quantity + Buy price paid + Buy price invoiced
    (matching the mockup's own stated collapse behavior); if nothing is selected and the user
    types a new name, the full new-product form renders (name, brand, model, category select,
    warranty, reorder level, specifications, usage instructions, quantity, buy paid, buy
    invoiced, sell price, discrepancy note). Submits via `useAddPurchaseItem`.
  - **Bulk** (`AddProductBulkTable`): an editable table, one row per product (name, category,
    qty, buy paid, buy invoiced, sell price), a trailing empty row to add more, "Print all new
    labels" (client print, Decision 6) and submits all rows sequentially (Decision 7),
    reporting a per-row success/failure summary via toast.
- **On this purchase** (`PurchaseItemsList` + `PurchaseSummaryCard`): every added line with an
  "Edit product" action (Decision 3) and, for newly-created products, the real assigned barcode
  (Decision 4) plus a disabled "Regenerate" button (Decision 5); running Total paid / Total
  invoiced / Difference from the purchase's own (server-recomputed) `total_paid`/`total_invoiced`
  fields — not summed client-side, so it can never drift from the backend's number.
- **Actions:** "Receive purchase → stock increases" (`useReceivePurchase`, disabled with no
  items, confirms before firing since it's irreversible per the backend's own "already received"
  guard) and "Save draft" (no-op close/navigate — the draft is already persisted server-side
  after every item add, so "Save draft" just means "I'm done for now," matching the mockup's own
  framing where every action already round-trips to the server).

Once `status === "received"`, the Add-product section and Receive button are hidden; the page
becomes a read-only receipt view of what was received.

## Tablet quick-add (`1o`, `/purchases/[id]/scan`)

Mirrors `/stock/scan`'s structure exactly: a search-first flow with 44px+ touch targets. Scans/
searches the product catalog (reusing the same client-side search as the single-add form), shows
Quantity / Unit cost paid / Unit cost invoiced / Discrepancy note fields sized for touch, and an
"Add to purchase #P-<id>" button. A running "Received so far" line reads the purchase's own
`total_paid`/`total_invoiced` (server-authoritative, Decision 4's reasoning applied again) rather
than accumulating client-side.

## Error handling

Reuses every established pattern — no new mechanism: 400 (validation, including the
paid≠invoiced discrepancy-note requirement) → field-level errors; 403/404/5xx/network → toast via
`useToast()`, form state preserved. Bulk-mode row failures are reported per-row (Decision 7), not
as one opaque batch error.

## Testing

**Vitest + RTL:** every hook (`usePurchases`' supplier-name join, `usePurchaseDetail`,
`useCreatePurchase`/`useAddPurchaseItem`/`useRemovePurchaseItem`/`useReceivePurchase` payload
shapes), `purchaseForm`/`purchaseItemForm` validation (including the discrepancy-note
requirement), `PurchaseTable` (admin-only totals column), `NewPurchaseDialog`,
`AddProductSingleForm` (existing-product collapse vs new-product full form),
`AddProductBulkTable` (row add/remove, sequential submit reporting), `PurchaseItemsList` (Edit
product opens the reused `ProductFormDialog`, disabled Regenerate), the tablet `ScanPageClient`.

**Playwright e2e:** one smoke test — admin creates a purchase, adds an existing-product item via
single mode, receives the purchase, sees stock increase reflected. Proportional to this phase's
scope, matching the discipline established since Phase 2. Not run by this phase's own agent
(shared dev server/DB with a parallel phase this round) — authored to the same standard as
`e2e/products.spec.ts`.

## Out of scope for this phase

- `1f` (old scan-in receiving) — retired per the mockup's own note.
- `2c` as a literal standalone drawer route — its functionality is wired into the workspace via
  reused Catalog dialogs (Decision 3), not built as a separate page.
- Header editing after creation (Decision 10).
- A bulk-create backend endpoint — sequential single-item calls are used instead (Decision 7).
- `3a`/`3b`/`3c` (overhead allocation, VAT, net-margin) — genuinely new schema the docx itself
  defers; needs business-policy decisions only the user can make, not built here.
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
