# Phase 3: Sales / POS Checkout — Design

## Context

Phases 1-2 (backend foundation; purchasing) are complete and merged. `Sale`, `SaleItem`, and
`NotificationLog` exist as schema-only models from Phase 1 (Task 11/14) with no API. This phase
builds the sales/checkout workflow: completing a sale (which decrements stock and notifies
admins), and reversing one (return or cancel, which restores stock). Backend only — no Next.js
frontend, matching the established pattern.

## Decisions made (with the user)

1. **No draft/held sale state.** Unlike purchasing, checkout is a single atomic
   `POST /api/sales/` — the client submits the whole cart (customer, payment method, line
   items) in one request; stock decrements and the sale completes atomically. A cart lives
   client-side until submission.
2. **Admin notification is log-only this phase.** Every completed sale writes one
   `NotificationLog` row per Admin-role employee (`type='sale_alert'`, `status='sent'`) — no
   real email is sent. Standing up Celery/async email is explicitly deferred to a later,
   smaller phase once there's a real email backend to configure.
3. **Returns/cancellations restore stock.** A `return` or `cancel` action on a completed sale
   increments `Inventory.quantity_in_stock` back by each line item's quantity and flips
   `Sale.status`. Both actions share one underlying reversal — they have the same mechanical
   effect (undo the stock decrement), differing only in the resulting status label.
4. **Insufficient stock blocks the sale.** If any line item's quantity would take
   `Inventory.quantity_in_stock` below zero, the whole sale is rejected (400) — all-or-nothing,
   no partial sales and no negative stock.
5. **Prices are server-resolved.** The client sends `product` + `quantity` per line; the
   server looks up each product's current (`is_current=True`) `ProductPricing.retail_price` at
   sale time and computes subtotals/total server-side. Same principle as barcode generation
   (Phase 1) and cost handling (Phase 2): never trust client-submitted authoritative values.
6. **RBAC**: `IsAuthenticated` only, no admin gate, on every sales endpoint including
   return/cancel — matches the purchasing pattern. No price-masking needed (retail prices are
   customer-facing, not secret, unlike Phase 2's wholesale costs).
7. **`Sale` is immutable once created** — no `PATCH`/`PUT`/`DELETE`. `SaleViewSet` restricts
   `http_method_names` to `get`/`post`/`head`/`options` from the start (applying the lesson
   from Phase 2's final review, which had to retrofit this after an unguarded `DELETE` was
   found post-implementation).
8. **Discount is out of scope.** The mockups show a discount line in the checkout sidebar, but
   neither `Sale` nor `SaleItem` has a discount field in the existing schema, and it wasn't
   part of the original written requirements. Not added this phase.

## Locking discipline

`complete_sale` locks every distinct product's `Inventory` row via `select_for_update()`,
**in a consistent order (ascending by `product_id`)** across all line items in one sale, before
checking sufficiency or writing any decrement. This avoids a cross-sale deadlock: two concurrent
sales touching an overlapping set of products in different orders would otherwise be able to
each hold one lock and wait on the other. Purchasing's `receive_purchase` didn't need this
refinement (it only ever increments, one row at a time, with no sufficiency check that could
fail mid-loop and leave things inconsistent) — sales checkout's block-on-insufficient-stock
requirement makes consistent lock ordering the right precaution here.

`reverse_sale` applies the same per-product locked-increment pattern `receive_purchase`
established, plus locks the `Sale` row itself before checking/mutating `status` (the exact
discipline Phase 2's final review had to add after the fact) — applied from the start here.

## API design

All endpoints under `/api/sales/`, `IsAuthenticated` only.

- `POST /api/sales/` — complete a sale in one request. Body:
  `{"customer": <id>|null, "payment_method": "cash"|"card"|"mobile_money"|"bank_transfer",
  "items": [{"product": <id>, "quantity": <int>}, ...]}`. Server: resolves each product's
  current retail price, locks and checks stock sufficiency for every line (consistent
  product-ID order), rejects (400) if any line is insufficient, creates `Sale` + `SaleItem`
  rows with server-computed `unit_price`/`subtotal`/`total_amount`, decrements `Inventory`,
  fans out one `NotificationLog` row per Admin employee, all in one transaction. Response
  includes nested `items` (learning Phase 2's lesson: nested read support ships from the
  start, not bolted on after a review catches its absence).
- `GET /api/sales/`, `GET /api/sales/{id}/` — list/retrieve, `items` nested in the response.
- `POST /api/sales/{id}/return/` — reverses a `completed` sale: restores stock for every line,
  sets `status=returned`. Rejects (400) if the sale isn't currently `completed`.
- `POST /api/sales/{id}/cancel/` — identical mechanics to `return`, sets `status=cancelled`
  instead. (Kept as a separate endpoint rather than a single "reverse with a status param" to
  match the docx's distinct status vocabulary and keep the API self-documenting; both call the
  same `reverse_sale(sale, new_status)` service function.)
- No `PATCH`/`PUT`/`DELETE` on `/api/sales/{id}/`.

## Data flow example

Cashier scans two products, enters quantities → client builds the cart locally → submits
`POST /api/sales/` with customer=null (walk-in), payment_method="cash", two line items → server
resolves both retail prices, locks both products' Inventory rows in `product_id` order, confirms
sufficient stock, creates the Sale+SaleItems, decrements stock, writes one NotificationLog per
Admin → returns the completed sale with nested items and computed total. Later, a customer
returns one item: `POST /api/sales/{id}/return/` restores that sale's full stock and marks it
`returned` (whole-sale reversal, not partial-line returns — matching the docx's per-sale status
model, which has no per-line status).

## Error handling

400 for validation (insufficient stock, empty item list, reversing a non-completed sale,
unknown product/customer references), 401/403 from existing auth middleware, 404 for unknown
sale IDs.

## Testing

Service-level: retail price resolution at sale time; stock-sufficiency blocking (single line,
and a multi-line sale where only one line is insufficient still blocks the whole sale); lock
ordering is exercised implicitly by testing a multi-product sale completes correctly; walk-in
sale (`customer=None`); notification fan-out creates one row per Admin employee (and zero rows
if there are no Admins, without erroring); `reverse_sale` restores stock correctly for both
`return` and `cancel`; reversing a non-completed sale is rejected; reversing twice is rejected.
API-level: full checkout happy path with nested items in the response; insufficient-stock 400;
return/cancel via API with stock restoration confirmed via a direct DB query (not just trusting
the response); `PATCH`/`PUT`/`DELETE` on `/api/sales/{id}/` all rejected (405).

## Out of scope for this phase

- Real email sending / Celery infrastructure (Decision 2).
- Discount handling (Decision 8).
- Partial-line returns (only whole-sale return/cancel, matching the existing status model).
- Any Next.js frontend work.
- Stock/equipment endpoints, admin dashboard, batch/VAT system — unrelated later phases.
