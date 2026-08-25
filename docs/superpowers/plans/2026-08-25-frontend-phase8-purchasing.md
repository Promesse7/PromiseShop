# Frontend Phase 8: Purchasing Implementation Plan

## Global Constraints

- No backend changes. `Purchase`/`PurchaseItem`/`Supplier` types already exist in `lib/types.ts`
  (added by the Dashboard and Directory phases) — reuse them, do not redeclare.
- Reuse `components/products/ProductFormDialog.tsx`, `components/products/SetPriceDialog.tsx`,
  `lib/suppliers/useSuppliers.ts`, `lib/api-client.ts`, `components/ui/*`,
  `components/layout/ToastProvider.tsx` directly — do not fork copies of them.
- Every create/edit dialog uses the keyed-inner-component pattern
  (`components/suppliers/SupplierFormDialog.tsx` is the reference), never a `useEffect` that
  calls `setState` to reset form state.
- Each task: write the test(s) → run to confirm they fail for the right reason → implement →
  run to confirm they pass → commit.

## Task 1: `purchaseForm` and `purchaseItemForm` helpers

Pure functions, no React. `purchaseForm.ts`: `emptyPurchaseFormValues()`,
`buildPurchasePayload(values)` (supplier as number, invoice_number trimmed-or-null, purchase_date,
payment_status), `validatePurchaseForm(values)` (supplier required, purchase_date required).
`purchaseItemForm.ts`: `emptyNewProductItemValues()`, `emptyExistingProductItemValues()`,
`buildAddItemPayload(values, mode)` (mode: "existing" | "new" — shapes the
`AddPurchaseItemSerializer` body accordingly), `validateAddItemForm(values, mode)` (quantity ≥ 1,
unit costs ≥ 0, discrepancy note required when paid ≠ invoiced — mirrors the backend's own
`_validate_discrepancy_note`, so the UI catches it before the round trip; new-product mode also
requires category/name/selling_price).

- Write tests covering: existing-product payload shape, new-product payload shape, the
  discrepancy-note-required-when-paid≠invoiced rule (both directions: required-and-missing fails,
  required-and-present passes, paid===invoiced never requires it), quantity/cost validation.
- Implement, verify tests pass, commit.

## Task 2: `usePurchases` (list) and `usePurchaseDetail` hooks

`usePurchases`: `useQuery(["purchases"], () => fetchAllPages<Purchase>("purchases/"))` joined with
`useSuppliers()` (shared `["suppliers"]` cache) for supplier name — same join-hook shape as
`useStockOverview`. `usePurchaseDetail(id)`: `useQuery(["purchases", id], () =>
apiFetch<Purchase>(\`purchases/${id}/\`))` — items are embedded in the response, no second query.

- Tests: mock `fetchAllPages`/`apiFetch`, assert the joined list shape and the detail shape
  (including `items`).
- Implement, verify, commit.

## Task 3: Mutation hooks

`useCreatePurchase`, `useAddPurchaseItem`, `useRemovePurchaseItem`, `useReceivePurchase` — one
file each, mirroring `lib/stock/useRegisterUnit.ts` / `useChangeEquipmentStatus.ts` in shape
(`useMutation` wrapping `apiFetch`, invalidating `["purchases"]` and `["purchases", id]` on
success; `useAddPurchaseItem`/`useReceivePurchase` also invalidate `["inventory"]` and
`["products"]` since receiving changes stock and new-product items change the catalog).

- Tests: assert each mutation POSTs/DELETEs the right path with the right body, and invalidates
  the right query keys.
- Implement, verify, commit.

## Task 4: `PurchaseTable` + `PurchasesPageClient` + list page

`PurchaseTable`: columns Supplier / Invoice # / Date / Payment status / Status tag / Total paid
(admin-only — omit the column entirely for non-admin, mirroring `ProductTable`'s Wholesale-column
precedent). `PurchasesPageClient`: renders the table, a "+ New purchase" button opening
`NewPurchaseDialog`. `app/(protected)/purchases/page.tsx`: server component, `getSession()` →
role prop, same shape as `products/page.tsx`.

- Tests: `PurchaseTable` renders rows with/without the totals column by role;
  `PurchasesPageClient` opens the dialog on button click.
- Implement, verify, commit.

## Task 5: `NewPurchaseDialog`

Supplier select (from `useSuppliers`), invoice number field, purchase date field (default today),
payment status segmented toggle (default "paid"). Submits via `useCreatePurchase`; on success,
`router.push(\`/purchases/${result.purchase_id}\`)`.

- Tests: submit payload shape, default payment status, navigation on success, field-level 400
  errors mapped (e.g. missing supplier).
- Implement, verify, commit.

## Task 6: `AddProductSingleForm`

Search box over cached `["products"]` (reuse the client-filter pattern from
`useCatalogProducts`/`usePosCatalog`) — a match selected collapses the form to Quantity + Buy
paid + Buy invoiced; no match with a typed name shows the full new-product form (name, brand,
model, category select from `["categories"]`, warranty, reorder level, specifications, usage
instructions, quantity, buy paid, buy invoiced, sell price, discrepancy note — shown/required only
when paid ≠ invoiced). Submits via `useAddPurchaseItem`.

- Tests: existing-product collapse behavior, new-product full-form payload, discrepancy-note
  conditional requirement, 400 field-error mapping.
- Implement, verify, commit.

## Task 7: `AddProductBulkTable`

Editable rows (name, category, qty, buy paid, buy invoiced, sell price), a trailing always-present
empty row that becomes a real row once a name is typed, "Print all new labels" (real
`window.print()` over the rows flagged new), and a submit that fires
`useAddPurchaseItem` once per row **sequentially** (not `Promise.all`), collecting per-row
success/failure and reporting a summary toast ("6 of 7 rows added — see below" style), leaving
failed rows in the table for correction rather than clearing them.

- Tests: row add/remove, sequential (not parallel) submission order, partial-failure reporting
  keeps failed rows and clears succeeded ones.
- Implement, verify, commit.

## Task 8: `PurchaseItemsList` + `PurchaseSummaryCard`

`PurchaseItemsList`: one row per item — product name, quantity, the real assigned barcode (from
`item.product`'s catalog record — join against the cached `["products"]` query), a disabled
"Regenerate" button (`title="Not available — barcodes are shop-assigned once, at entry."`), and an
"Edit product" button that opens the reused `ProductFormDialog` in edit mode for that item's
product. `PurchaseSummaryCard`: reads `purchase.total_paid`/`total_invoiced` directly (never
summed client-side) plus their difference, matching Decision 4's server-authoritative rule.

- Tests: barcode display via the products join, disabled Regenerate has the explanatory title,
  Edit product opens `ProductFormDialog` pre-filled, summary card renders the server totals
  verbatim (a deliberately "wrong" client-sum in the mock data should NOT appear — asserts no
  client-side re-summing happens).
- Implement, verify, commit.

## Task 9: `PurchaseWorkspaceClient` + `[id]/page.tsx`

Wires Tasks 4-8 together: header (read-only), Single/Bulk toggle gating which add-form renders,
items list + summary, Receive button (confirms, disabled with zero items, hidden once received),
Save-draft (navigates back to `/purchases`). Once `status === "received"`, add-product UI and
Receive button hide; page renders as a read-only receipt.

- Tests: toggle switches forms, Receive disabled with no items, Receive confirms then calls
  `useReceivePurchase`, received-state hides add/receive UI.
- Implement, verify, commit.

## Task 10: Tablet quick-add (`1o`) — `/purchases/[id]/scan`

`ScanPageClient` mirrors `/stock/scan`'s `ScanPageClient.tsx` structure: search-first, 44px+
touch targets, quantity/paid/invoiced/discrepancy-note fields, "Add to purchase #<id>" button,
a "Received so far" line reading the purchase's own server totals (not client-accumulated).

- Tests: search-then-add flow, server-totals display (not client sum), touch-target sizing
  smoke-checked via the same min-height classes `/stock/scan` uses.
- Implement, verify, commit.

## Task 11: e2e smoke test

`e2e/purchasing.spec.ts`, matching `e2e/products.spec.ts`'s style: admin logs in → creates a
purchase (supplier + invoice + date) → adds an existing fixture product via single mode → receives
the purchase → sees the stock increase reflected on `/products/<id>`. Documented fixture
requirements in a header comment, same convention as every other e2e spec. **Not run** by this
phase's own agent (shared dev server/DB with a parallel phase this round).

- Write the spec, do not execute it.
- Commit.

## Task 12: Final verification

`npm test`, `npm run lint`, `npx tsc --noEmit` — all clean. Fix anything red. Final commit if
needed.
