# Phase 2: Purchasing — Design

## Context

Phase 1 (backend foundation) shipped the full 15-table schema, JWT auth/RBAC, and CRUD APIs
for employees, categories, suppliers, customers, products, and product pricing. Purchasing was
deliberately left schema-only: `Purchase` and `PurchaseItem` models exist (Task 10 of the
Phase 1 plan) but have no API and no business logic.

This phase builds the purchasing workflow: recording a purchase order from a supplier, adding
line items (either existing catalog products or brand-new products created on the spot), and
"receiving" the purchase — which is what actually increases stock on hand. This is the
shop-assigned-barcode flow from the mockups (screens 2a/2b/2c), which explicitly replaces the
original scan-manufacturer-barcode flow, per the decision already made before Phase 1.

Backend only — no Next.js frontend work in this phase, matching Phase 1's pattern. The
frontend comes as its own later phase once all backend domains exist.

## Decisions made (with the user)

1. **Purchase state.** `Purchase` gains a `status` field (`draft` / `received`), separate from
   the existing `payment_status` (paid/partial/unpaid). A draft can be freely edited (items
   added/removed); only the `/receive/` action — which triggers the stock increment — moves it
   to `received`, after which it's locked against further item changes.
2. **Mockup screen 2c** (admin product-review drawer) is *not* built in this phase beyond what
   Phase 1 already supports. Editing a product's specs/reorder level (`/api/products/`) and
   selling price (`/api/product-pricing/`) already work. Editing `Inventory.storage_location`
   is deferred to the stock/equipment phase, which owns the `Inventory` API.
3. **Discrepancy notes are enforced server-side**: a `PurchaseItem` where
   `unit_cost_paid != unit_cost_invoiced` is rejected (400) unless `price_discrepancy_note` is
   provided.
4. **RBAC**: purchasing endpoints are open to any authenticated employee (consistent with
   products/suppliers/customers in Phase 1) — purchasing is a staff activity per the docx, not
   Admin-gated.
5. **API shape**: header-plus-actions (not a single atomic nested write, not fully separate
   resources — see "Approaches considered" below).

## Approaches considered

- **Single atomic nested write** — `POST /api/purchases/` accepts the whole purchase (header +
  all items, new-product fields inline) in one request. Rejected: DRF nested writable
  serializers get unwieldy once a line item can either reference an existing product or
  describe a brand-new one inline, and partial-failure error reporting gets awkward.
- **Fully separate resources** — independent `Purchase`/`PurchaseItem` ViewSets; building a
  purchase takes several separate requests, with new-product creation as an explicit prior
  call to `/api/products/`. Rejected: pushes the "new vs. existing product" orchestration onto
  every caller instead of handling it once, and doesn't match the mockups' single-step
  "type or pick from catalog" UX.
- **Header + actions (chosen)** — `PurchaseViewSet` for the header (create as draft, list,
  retrieve, edit header fields while draft) plus two custom actions, `/items/` and `/receive/`,
  that do the real work. Matches the mockups' actual workflow directly, and keeps the
  new-vs-existing-product branching in one well-tested place.

## API design

All endpoints under `/api/purchases/`, `IsAuthenticated` only (no admin gate).

- `POST /api/purchases/` — create a draft. Body: `supplier`, `invoice_number`, `purchase_date`,
  `payment_status`. `total_paid`/`total_invoiced` default to `0` and are not client-settable at
  creation.
- `GET /api/purchases/`, `GET /api/purchases/{id}/` — list/retrieve.
- `PATCH /api/purchases/{id}/` — edit header fields, only while `status=draft`.
- `POST /api/purchases/{id}/items/` — add one line item to a draft purchase. Two payload
  shapes:
  - **Existing product**: `{"product": <id>, "quantity", "unit_cost_paid", "unit_cost_invoiced",
    "price_discrepancy_note"?}` — creates the `PurchaseItem` directly.
  - **New product**: `{"category": <id>, "name", "brand"?, "model_number"?, "specifications"?,
    "usage_instructions"?, "warranty_months"?, "reorder_level"?, "quantity",
    "unit_cost_paid", "unit_cost_invoiced", "selling_price", "price_discrepancy_note"?}` —
    creates the `Product` (via `catalog.services.generate_barcode`, same as the existing
    catalog flow — barcode is assigned immediately, matching the mockup's "Shop barcode —
    assigned now"), an initial `ProductPricing` row (`wholesale_price` = `unit_cost_paid`,
    `retail_price` = `selling_price`, `is_current=True`), then the `PurchaseItem`. All three
    creates happen in one transaction.
  - Either shape: `subtotal_paid`/`subtotal_invoiced` are computed server-side
    (`quantity × unit_cost`), never accepted from the client. If `unit_cost_paid !=
    unit_cost_invoiced` and `price_discrepancy_note` is blank, reject with 400. After a
    successful add, `Purchase.total_paid`/`total_invoiced` are recomputed as the sum of all
    line items' subtotals. Rejects (400) if the purchase is not `draft`.
- `DELETE /api/purchases/{id}/items/{item_id}/` — remove a line from a still-draft purchase;
  recomputes the header totals. Rejects if the purchase is not `draft`.
- `POST /api/purchases/{id}/receive/` — the stock-increment transition. In one transaction:
  rejects (400) if the purchase has zero items or is already `received`; for each line item,
  locks the product's `Inventory` row (`select_for_update`) — creating it with
  `quantity_in_stock=0` first if the product has never been stocked — and increments
  `quantity_in_stock` by the line's `quantity`; then flips `Purchase.status` to `received`.
  Applies the same per-row locking discipline as `catalog.services.generate_barcode`, so two
  purchases for the same product received concurrently can't race on the stock count (a gap
  the Phase 1 final review flagged as inconsistently applied — this phase applies it
  consistently from the start).

## Data flow example

Staff creates a draft purchase (`POST /api/purchases/`) → adds three line items via
`POST .../items/` (two reference existing products by ID after a catalog search; one supplies
new-product fields and gets a barcode + initial price created on the spot) → the running header
totals update after each add → staff calls `POST .../receive/` → all three lines' stock
increments happen atomically, the purchase locks.

## Error handling

Consistent with Phase 1: 400 for validation (missing discrepancy note, empty receive, mutating
a non-draft purchase, adding an item to a non-draft purchase), 401/403 from existing auth
middleware, 404 for unknown purchase/product/supplier IDs.

## Testing

- Model-level: `Purchase.status` default and transition, `PurchaseItem` subtotal computation.
- API-level: add-existing-product happy path; add-new-product-inline (asserts the created
  `Product` has a generated barcode and an initial `is_current=True` `ProductPricing` row with
  the right wholesale/retail values); discrepancy-note enforcement (rejected when blank and
  costs differ, accepted when equal or when provided); header totals recompute correctly after
  add/delete; receive increments `Inventory.quantity_in_stock` correctly (including the
  never-stocked-before case); receiving an empty purchase is rejected; mutating a received
  purchase (further adds, deletes, header edits) is rejected; a concurrency-safety test for the
  receive-time stock lock, following the same pattern as the existing barcode-generation test.

## Out of scope for this phase

- Mockup 2c's `Inventory.storage_location` editing (stock/equipment phase).
- Barcode label printing/rendering (frontend concern — the API already returns the barcode
  string).
- Any Next.js frontend work.
- Batch intake with overhead allocation / VAT / margin targets (mockup "turn 3" — already
  deferred past Phase 1, still deferred here).
