# PromiseShop — Release Dev Handoff

Oct 6, 2026 · @Peter

## Scope

This release closes the cash leaks found in review and adds the five things testers asked for: debt tracking, bargaining at the till, internal use of stock, faster purchase entry with bundles, and dashboards that explain the money.

The work is split into a Phase 0 (security fixes) and eight modules, A to H. Module A (stock movement ledger) comes first because Modules C, D, E, F and G write into it. Each module lists its data model, backend services and endpoints, permissions, frontend screens, and the tests that prove it works.

The codebase is `Promesse7/PromiseShop` (Django REST + Next.js + Neon Postgres). Commit `f4ab3b0` on `main` is the baseline this handoff was written against.

## Decisions already made

The owner delegated these choices. Build to them; raise a change only if one turns out to be wrong in practice.

| Topic | Decision |
| --- | --- |
| Money | `DecimalField(max_digits=14, decimal_places=2)`, currency RWF. UI shows whole francs. Never use floats. |
| Day boundaries | All "today", end-of-day and aging calculations use `Africa/Kigali`. |
| Stock truth | New append-only `StockMovement` ledger. `Inventory` stays as the cached balance, updated in the same transaction as each movement. |
| Corrections | Nothing financial or stock-related is edited or deleted. Mistakes are fixed with a reversing entry that points to the original. |
| Debt balance | Computed from payment records. A cached `amount_paid` on the sale/purchase is updated inside the same transaction and verified by a test. |
| Credit sales | Any sale not fully paid needs a customer. Walk-in sales must be fully paid. |
| Supplier debt | Uses the same payment model as customer debt (one `Payment` table, two directions). |
| Bargaining limit | Cashiers may go up to 10% below catalog on their own. Below that, or below cost, needs a manager/admin PIN. The 10% lives in `ShopProfile` and admin can change it. Markups have no limit. |
| Cost used for floors and valuations | Weighted average paid cost, as today. |
| Internal use | Not an expense and not COGS. Reported as "Materials used internally", valued at weighted average cost at the time. |
| Shop assets | New `ShopAsset` register. An asset can come from stock or be registered directly (things the shop already owned). |
| Opening stock | New movement type `opening`, admin only, used for first setup instead of fake purchases. |
| Bundles | Broken down at receive. Cost is split by amounts the user enters; the default split is proportional to each component's retail price. |
| Packs | Purchase lines get `units_per_pack` (default 1). Stock is always counted in single units. |
| Product delete | Rule stays (no delete with history). Add admin-only "Merge duplicates". |
| Returns | Partial returns allowed, admin/manager only, reason required. "Void" is only for same-day sales; after that it's a return. |
| Dashboard | Opened to managers too (fixes gap 10). Staff still never see cost or profit. |
| Language | English only this release. Hide the EN/RW toggle until translations exist. |

## Ground rules

First, push any unpushed local work. The recap describes a till price override and "Discount vs catalog" on the receipt, but on `main` `complete_sale` always charges the catalog price and `SaleItem` has no list-price field. Module C assumes that work is either merged or rebuilt here.

Follow the patterns the codebase already uses:

- **Business logic lives in `<app>/services.py`.** Views validate input, call one service function, and return a serializer. No stock or money logic in views or serializers.
- **Every stock or money change runs in `transaction.atomic()`** and locks the rows it touches with `select_for_update()`, sorted by primary key to avoid deadlocks (as `complete_sale` already does).
- **Permissions are enforced in the backend.** Use `IsAdmin` / `IsAdminOrManager` from `accounts/permissions.py`, plus the new `IsAdminOrManagerOrReadOnly` where staff need read access. Hiding a button in the frontend is never the protection.
- **Cost fields are stripped for staff** in serializers, the same way products already hide `wholesale_price`.
- **Every audit row records** who, when, what, why (reason text), and before/after where a quantity changes.
- **Tests:** pytest for every service function, including the refusal paths (insufficient stock, wrong role, over-limit discount). Vitest for new components. Keep the existing suite green.
- **One migration per module,** plus a data migration where existing rows need back-filling (called out per module).

## Phase 0 — Security and permission fixes

These are small changes that close real theft routes; ship them before any module.

| # | Problem today | Fix | Where |
| --- | --- | --- | --- |
| 0.1 | Any logged-in user can `POST /sales/<id>/cancel/` or `/return/`. A cashier can sell, keep the cash, and cancel. | Both actions require `IsAdminOrManager`. Module G later replaces them with proper void/return flows. | `sales/views.py` |
| 0.2 | Staff can create new prices through `ProductPricingViewSet` (gap 7). | Creating or updating pricing requires `IsAdminOrManager`. Staff keep read access to retail prices. | `catalog/views.py` |
| 0.3 | `CustomerViewSet` allows delete and edit by any role. | Staff can list, create and edit. Delete is admin only, and refused if the customer has any sale or open debt. | `sales/views.py` |
| 0.4 | Suppliers are unrestricted in the backend. | Staff read only. Create/edit admin and manager. | `purchasing/views.py` |
| 0.5 | No login throttling; admin password has been shared publicly. | Add DRF throttling on the token endpoint: 5 failed attempts per username per 15 minutes, then 15-minute lockout. Change the live admin password. | `accounts`, `config/settings.py` |
| 0.6 | Receipt banner says "admin notified by email" but no email is sent. | Change the text to "Admin notified in the app". Notification rows keep status `logged`, not `sent`. | frontend receipt, `sales/services.py` |
| 0.7 | Dashboard refuses managers (gap 10). | Dashboard endpoints allow `IsAdminOrManager`. | `dashboard/views.py` |

**Acceptance:** each row has a test showing a sales\_staff token gets 403 (or 429 for 0.5) and an allowed role succeeds.

## Module A — Stock movement ledger

Every change to any stock bucket writes one `StockMovement` row; this answers "show every movement of product X" and feeds Modules D, G and H.

**Model** (`stock/models.py`):

| Field | Type | Notes |
| --- | --- | --- |
| `product` | FK Product | indexed with `created_at` |
| `movement_type` | choice | `purchase_receipt`, `purchase_cancel`, `sale`, `sale_return`, `sale_void`, `adjust_count`, `to_damaged`, `from_damaged`, `to_in_use`, `from_in_use`, `internal_consumption`, `to_shop_asset`, `opening`, `merge_in`, `merge_out`, `bundle_breakdown` |
| `bucket` | choice | `in_stock`, `in_use`, `damaged` |
| `quantity_delta` | int | signed; a move between buckets writes two rows |
| `balance_after` | int | value of that bucket after the move |
| `unit_cost` | decimal | weighted average cost at that moment; used for valuations |
| `source_type` / `source_id` | str / int | what caused it: `sale`, `sale_item`, `purchase`, `adjustment`, `consumption`, `merge`, `bundle` |
| `reason` | text | required for manual types |
| `created_by` | FK Employee |  |
| `created_at` | datetime |  |

**Service** (`stock/services.py`): one function, `record_movement(inventory, bucket, delta, movement_type, source, user, reason="")`. It must be called inside the caller's transaction with the inventory row already locked. It updates the `Inventory` bucket, refuses to go below zero, and writes the row. All existing code paths (receive, cancel purchase, complete sale, reverse sale, adjustments) are changed to go through it.

**Backfill migration:** create one `opening` row per existing `Inventory` with `balance_after` equal to the current numbers, dated at migration time, reason "Ledger start". Historic movements before that are not reconstructed.

**Endpoint:** `GET /stock/movements/?product=&type=&from=&to=` (admin/manager). Staff get it without `unit_cost`.

**Frontend:** a "Movements" tab on the product page (replaces "last 5 adjustments"), and a filterable Stock → Movements page with CSV export.

**Tests:** a nightly-style test that sums movements per product per bucket and checks it equals `Inventory`; one test per existing flow confirming it now writes movements.

## Module B — Debt management

The shop must always be able to answer "who owes us, how much, since when" and "who do we owe"; a debt is cleared only by recorded payments, never by ticking a box.

**Model changes:**

- New `finance.Payment`: `direction` (`in` from customer / `out` to supplier), `sale` FK nullable, `purchase` FK nullable (DB check: exactly one is set), `amount` (> 0), `method` (cash, mobile money, card, bank transfer), `reference` (MoMo/bank transaction ID, required for non-cash), `paid_at`, `recorded_by`, `note`, `receipt_group` (UUID shared by rows from one customer payment), `reversal_of` FK self nullable.
- `Sale` gains `amount_paid` (cached), `payment_status` (`paid`, `partial`, `credit`), `due_date` nullable. The existing `payment_method` field stays for old sales; new sales read methods from their payments.
- `Purchase` gains `amount_paid` (cached) and `due_date`. Its `payment_status` becomes computed from payments.
- `Customer` gains `credit_limit` (nullable = no limit). Phone becomes required for any customer with a credit sale.

**Checkout changes** (`complete_sale`): the request carries `payments: [{method, amount, reference, tendered}]` instead of one method. This gives split payment for free. `tendered` is only for cash and returns `change_due`.

- Sum of payments equal to total → `paid`.
- Sum below total → needs a `customer`, and `due_date` defaults to sale date + 30 days. Status `partial` or `credit`.
- Sum above total (non-cash) → refused. Cash overpayment is change, not a payment.
- Customer's open balance + this new debt above `credit_limit` → needs manager PIN (same mechanism as Module C).

**Services** (`finance/services.py`):

- `record_customer_payment(customer, amount, method, reference, user, sale_ids=None)` — allocates to the chosen sales, or oldest unpaid first. Refuses if amount exceeds the customer's total balance. One `receipt_group` for the whole payment.
- `record_supplier_payment(purchase, amount, method, reference, user)`.
- `reverse_payment(payment, user, reason)` — writes a negative-effect row with `reversal_of`, restores the balance. Admin/manager only.
- `customer_aging(as_of)` and `supplier_aging(as_of)` — balances in buckets: not due, 1–30, 31–60, 61–90, 90+ days overdue.

**Endpoints:** `POST /payments/customer/`, `POST /payments/supplier/`, `POST /payments/<id>/reverse/`, `GET /debts/customers/`, `GET /debts/suppliers/`, `GET /customers/<id>/statement/?from=&to=`.

**Permissions:** any role can record a customer payment (cash collected at the counter). Supplier payments, reversals and credit-limit changes are admin/manager.

**Frontend:**

- Checkout: enable the customer field (search, or quick-create with name + phone). Payment panel with one or more payment lines, a cash "tendered" box showing change, and a "Remaining on credit" line when underpaid.
- New **Debts** page with two tabs, "Customers owe us" and "We owe suppliers": aging buckets as totals at the top, a row per customer/supplier with balance and oldest due date, overdue rows highlighted, and "Record payment" on each row.
- Customer page: balance, open sales, payment history, printable statement.
- Receipt: shows paid, balance remaining and due date for credit sales; a separate printable payment receipt for later payments.

**Data migration:** existing sales → `paid`, `amount_paid = total_amount`, one `Payment` each using the old `payment_method`. Existing purchases marked Paid → one payment for `total_paid` on the purchase date. Purchases marked Partial or Unpaid → no payment created; they appear in payables with a "Migrated — confirm amount paid" flag for the owner to fix.

**Tests:** split payment; underpaid walk-in refused; credit limit needs PIN; oldest-first allocation across three sales; overpayment refused; reversal restores balance; aging buckets on fixed dates; cached `amount_paid` always equals the sum of payments.

## Module C — Bargaining at the till

The cashier can change any line's price to the agreed bargain; small discounts go through freely, large ones and below-cost ones need a manager's PIN, and every line records both prices.

**Model changes:**

- `SaleItem` gains `list_price` (catalog retail price at the time), `cost_at_sale` (weighted average cost at the time, never sent to staff), `discount_amount` = (list − unit) × quantity (negative for a markup), `approved_by` FK Employee nullable, `price_note` text optional.
- `Product` gains `min_price` nullable, set by admin/manager. The **floor** is `min_price` if set, otherwise `cost_at_sale`.
- `ShopProfile` gains `max_staff_discount_pct`, default 10.
- `Employee` gains `approval_pin` (hashed with Django's `make_password`, 4–6 digits), set by admin on the Employees page for managers and admins.

**Rules in `complete_sale`,** checked per line inside the transaction:

| Line price vs list | Sales staff / technician | Manager / admin |
| --- | --- | --- |
| At or above list (markup) | Allowed | Allowed |
| Below list, within the max %, and at or above the floor | Allowed | Allowed |
| More than the max % below list, still at or above floor | Needs approval | Allowed |
| Below the floor | Needs approval + note | Allowed, note required |
| Zero or negative | Refused | Refused |

Approval travels in the sale request as `approval: {approver_username, pin}`. The service checks the approver is an active manager or admin and the PIN matches, then stores them in `approved_by` on the affected lines. Wrong PIN attempts count toward the same throttle as login (Phase 0.5).

**Frontend:** the price cell on each cart line is editable and shows the catalog price, the difference in RWF and %, green for markup, amber for discount, red when approval is needed. When the cart needs approval, "Complete sale" opens a manager PIN dialog on the same till. Staff never see cost; the message just says "Needs manager approval". The receipt shows the catalog price struck through where a bargain was made.

**Reporting hooks** (used in Module H): discount and markup totals per cashier, per product and per day; count of approved below-floor sales per approver.

**Tests:** each row of the rules table for each role; wrong PIN refused and throttled; a non-manager approver refused; `discount_amount` sign for markup; staff serializer never contains `cost_at_sale`.

## Module D — Internal use and shop assets

Stock the shop takes for itself leaves sellable stock with a reason, a person and a value, and equipment the shop runs on (like its own printer) lives in an asset register whose breakdowns and replacements are recorded as one action.

There are two different cases, and the dev should keep them apart:

- **Consumed:** the item is used up or installed and won't come back (a cable, toner, a part fitted to the shop's own equipment).
- **Shop asset:** the item keeps being used by the shop and can break, be repaired or be retired (a printer, a laptop, a display TV).

The existing "In use (demo)" bucket stays as it is, for demo units that go back on sale.

**Models** (new app `operations`, or inside `stock`):

- `InternalConsumption`: `product`, `quantity`, `unit_cost` (weighted average at the time), `total_value`, `purpose` (replacement, repair, shop setup, other), `reason` (required), `taken_by` (employee who physically took it), `recorded_by`, `approved_by` nullable, `shop_asset` FK nullable (the asset it was used to fix), `created_at`.
- `ShopAsset`: `name`, `product` FK nullable, `equipment_unit` FK nullable (for serialised items), `serial` nullable, `status` (`in_service`, `damaged`, `under_repair`, `retired`), `location`, `assigned_to` nullable, `source` (`from_stock`, `pre_owned`), `acquired_at`, `acquisition_value`, `notes`.
- `ShopAssetEvent`: `asset`, `from_status`, `to_status`, `reason`, `user`, `created_at`, `replaced_by` FK ShopAsset nullable, `consumption` FK nullable.
- `EquipmentUnit.status` gains `shop_asset`.

**Services:**

1. `consume_stock(product, qty, purpose, reason, taken_by, user, asset=None, approval=None)` — writes `internal_consumption` movement (Module A) and the record.
2. `register_asset(...)` — for things the shop already owned; no stock movement.
3. `take_from_stock_as_asset(product, unit=None, ...)` — writes `to_shop_asset` movement (in\_stock −1) and creates the asset at average cost. A serialised unit moves to status `shop_asset`.
4. `change_asset_status(asset, to_status, reason, user)` — writes an event.
5. `replace_asset(broken_asset, new_status, replacement_product or spare_asset, reason, user)` — **one transaction:** marks the broken asset damaged/under repair/retired, takes the replacement from stock (or a spare asset), creates/activates the new asset, and links both events with `replaced_by`. This is the "our printer broke, we took one from stock" flow.
6. `return_asset_to_stock(asset, bucket, reason, user)` — admin only, for a repaired asset the owner decides to sell; movement back into `in_stock` or `damaged`.

**Permissions:** admin and manager do all of these directly. Sales staff and technicians can record consumption, take-from-stock and replacement only with a manager PIN (same mechanism as Module C). Returning an asset to stock is admin only.

**Frontend:**

- New **Shop use** page with two tabs: **Assets** (cards by status, filter by location/assignee) and **Consumption log** (table, filter by date/product/person/purpose, CSV).
- Product page: "Use in shop" button with two choices, "Consume" or "Make shop asset".
- Asset page: details, status timeline, and a prominent **Report broken / Replace** button that walks through: what happened → new status → replace from stock? (pick product, or scan serial) → confirm.
- Scan page (`/stock/scan`): scanning a serial that belongs to a shop asset opens that asset.

**Reporting hooks:** value consumed per month and per purpose; number and value of assets damaged per period; replacements per asset (to spot equipment that keeps failing); consumption per employee.

**Tests:** consumption refused above in-stock; replace flow is atomic (failure in step two leaves the broken asset unchanged); values use average cost at the moment; consumption never appears in expenses or COGS; staff without PIN refused.

## Module E — Fast purchase entry, opening stock, merge duplicates

Entering stock must default to picking an existing product; creating a new one is a deliberate last step, and first-time setup is a spreadsheet import rather than hundreds of purchase lines.

### E1. Product search that finds things

- Enable Postgres `pg_trgm` (available on Neon) and add a trigram index on a normalised name (lowercase, collapsed spaces, plus brand and model).
- `GET /products/search/?q=&limit=8` ranks: exact barcode or alias → exact normalised name → starts-with → trigram similarity ≥ 0.3. Each result returns name, brand, model, barcode, in-stock count, retail price, and last paid price for admin/manager.

### E2. Purchase line entry

- Each row's product cell is a combobox using E1. It auto-selects only on an exact barcode or exact normalised name match; otherwise it lists matches with **"+ Create new 'X'"** always last.
- A row with no product chosen cannot be saved. No silent creation.
- Choosing "Create new" when a match scores ≥ 0.6 shows "Did you mean…?" with the match first.
- Keyboard flow: Enter accepts and moves to quantity, then paid price, then invoiced price, then a new row.
- **Scan to add:** link the existing `/purchases/<id>/scan` page from the purchase workspace (gap 8). Scanning adds a line or adds 1 to an existing one.
- **Recent from this supplier:** `GET /suppliers/<id>/recent-products/` shows the last 20 products bought from them as one-tap chips.
- **Paste from Excel:** paste columns (name or barcode, qty, paid, invoiced); rows are matched with E1 and shown for review before saving.
- **Atomic save:** `POST /purchases/<id>/items/bulk/` validates all rows first. If any row fails, nothing is saved and each failed row returns its own error. This replaces the one-by-one posting.
- **Fix gap 9:** "Print all new labels" prints a label sheet, one label per received unit.

### E3. Opening stock import (first setup)

- Admin → Setup → **Import products**. Download a CSV template with columns: `category_code, name, brand, model, barcode (optional), retail_price, cost_price, opening_qty, reorder_level, vat (A/B), warranty_months, unit`.
- Upload → **dry run** preview: valid rows, errors per row, and rows that match existing products (flagged and skipped).
- Commit creates categories if missing, products, a current price row, inventory, and an `opening` movement (Module A) per row, in one transaction. Admin only.
- Also add a single-product "Set opening stock" action for a product that has never been received.

### E4. Merge duplicates

- New `ProductBarcodeAlias` (barcode → product) so old labels keep scanning after a merge.
- Admin → Products → **Find duplicates** lists pairs with similarity ≥ 0.6. "Merge" asks which one to keep.
- `merge_products(keep, duplicate, user, reason)` in one transaction moves sale items, purchase items, adjustments, movements, equipment units, shop assets and price history (as non-current history) to `keep`; adds the duplicate's stock buckets into `keep` with `merge_out`/`merge_in` movements; adds the duplicate's barcode as an alias; deactivates the duplicate and renames it "\[merged into …\]"; writes a `ProductMerge` log row. Irreversible, so the confirm dialog says so and shows counts.

**Tests:** search ranking order; no product created without explicit choice; bulk save is all-or-nothing; import dry run writes nothing; merge preserves the total of every bucket and alias scanning finds the kept product.

## Module F — Bundles, packs and labels at receive

What the supplier sells as one line (a carton of 24, or a Canalbox package with a TV and 20 decoders) is entered as one purchase line and lands in stock as individual sellable units with a fair cost each.

**Model changes** (`purchasing`):

- `PurchaseItem` gains `line_kind` (`single`, `pack`, `bundle`) and `units_per_pack` (default 1).
- New `PurchaseItemComponent`: `purchase_item`, `product`, `qty_per_bundle`, `allocated_paid_cost` and `allocated_invoiced_cost` (per bundle).
- New `BundleTemplate` + `BundleTemplateComponent`: a saved recipe (e.g. "Canalbox TV kit" = 1 TV + 20 decoders) so the second time it's one click. Optional supplier link.

**Rules:**

- **Pack:** stock in = packs × `units_per_pack`; cost per unit = paid per pack ÷ `units_per_pack`. Example: 3 cartons × 24 = 72 units.
- **Bundle:** stock in = bundles × `qty_per_bundle` for each component. The allocated costs must add up exactly to the line's paid (and invoiced) price per bundle; rounding leftovers go to the most expensive component. The default split is proportional to each component's retail price × quantity, and the user can edit it before saving.
- Weighted average cost and margin calculations use the allocated cost per unit.
- Receiving writes one `purchase_receipt` movement per component product (Module A). Cancelling a received purchase reverses per component, with the existing "stock already moved on" check.

**Frontend:**

- Purchase line has a kind switch: Single / Pack / Bundle.
- Bundle opens a component editor: pick from a template or add components with E1 search, quantities, and a cost split table showing the default split, editable, with a live "remaining to allocate" figure. "Save as template" checkbox.
- After **Receive**, a dialog offers: "Print labels — N labels for the units just received" (correct per-unit count), and for serialised products "Scan serials now" (creates `EquipmentUnit`s, optional, can be skipped and done later).

**Out of this module:** selling a bundle back as one kit at the till; that's listed as later.

**Tests:** pack quantities and unit cost; bundle allocation must sum exactly; default proportional split; rounding remainder; receive and cancel per component; template creates identical components.

## Module G — Sales history, returns and end-of-day

Every sale can be found, reprinted, voided the same day or partly returned later by a manager, and each cashier's day closes with counted cash compared to what the system expects.

### G1. Sales history

- Page **Sales** with filters: date range, cashier, customer, payment status, payment method, "has discount", "has return". Staff see only their own sales from today; admin/manager see all.
- Sale detail: lines (with list vs sold price for admin/manager), payments, returns, movements, and "Reprint receipt".

### G2. Void and return (replaces Phase 0's restricted endpoints)

- `Sale.status` values: `completed`, `partially_returned`, `returned`, `voided`.
- **Void:** whole sale, same Kigali calendar day only, admin/manager, reason required. Stock goes back with `sale_void` movements; all its payments get reversing entries (Module B).
- **Return:** new `SaleReturn` (sale, reason, refund method, created\_by, approved\_by) and `SaleReturnItem` (sale\_item, quantity, refund\_amount, condition). Admin/manager only.
  - Returned quantity can't exceed sold minus already returned for that line.
  - `refund_amount` defaults to the price actually paid for that unit (not catalog price).
  - Condition `resellable` puts units back in `in_stock`; `damaged` puts them in `damaged`. Both write `sale_return` movements.
  - Refund for a fully paid sale = an outgoing payment (direction `out` with `sale` set). For a credit sale, the refund first reduces the open balance; only any excess is paid out.
  - Serialised units sold on that line go back to `in_stock` or `damaged` status to match.

### G3. End-of-day close

- New `DailyClose`: `cashier`, `business_date`, `opening_float`, `expected` per method (computed), `counted_cash`, `variance`, `note`, `closed_by` (manager/admin), `closed_at`.
- Expected cash = opening float + cash payments recorded by that cashier that day (sales and debt collections) − cash refunds. Non-cash methods are listed with their references for checking against MoMo/bank statements.
- Screen **Close day**: the cashier enters counted cash; a manager confirms with PIN. A printable Z-report shows sales count, totals by method, discounts given, returns, debt collected and new credit given.
- One close per cashier per day; a closed day can't be reopened (corrections go into the next day's note).
- Admin sees a history of variances per cashier.

**Tests:** void refused on a sale from yesterday; partial return limits; refund default equals price paid; credit-sale refund reduces balance first; damaged return goes to `damaged`; expected cash formula with collections and refunds; staff can't see other cashiers' sales.

## Module H — Dashboards that explain the money

For any period the owner sees one chain from catalog value to net profit, every leak broken out, and plain-language alerts; all numbers are computed from the records Modules A–G write, with no estimates except the VAT position.

### H1. The money chain (period view, waterfall chart)

| Step | Source |
| --- | --- |
| Sales at catalog price | Σ `list_price` × qty |
| − Discounts / + markups | Σ `discount_amount` |
| = Net sales (VAT included) | Σ line subtotals |
| − Returns and voids | Module G refunds |
| − Output VAT | Σ `tax_amount` on kept lines |
| = Net sales excluding VAT |  |
| − Cost of goods sold | Σ `cost_at_sale` × qty kept |
| = Gross profit |  |
| − Expenses | finance expenses |
| = Operating profit |  |

Shown beside the chain, not inside it: materials used internally (Module D), damaged write-offs (`to_damaged` movements × unit cost), supplier billing differences (invoiced − paid), new credit given, debt collected, and debt outstanding by aging bucket.

### H2. Product drill-down

Per product and period: invoiced cost per unit, paid cost per unit, catalog price, average sold price, VAT per unit, actual margin and projected margin, units sold, units consumed internally, units damaged, current stock value at average cost.

### H3. People

Per cashier: sales count and value, average discount %, below-floor approvals received, returns on their sales, end-of-day variances. Per approver: approvals given.

### H4. Input VAT and VAT position

- `Purchase` gains `has_vat_invoice` (bool, default true). `PurchaseItem` stores the product's `tax_category` at the time.
- Input VAT per line = invoiced amount × 18/118 for category B lines on purchases with a VAT invoice.
- Dashboard shows output VAT − input VAT for the period, labelled **"Estimate — not a tax filing"** until EBM integration exists.

### H5. Alerts

Rule-based, thresholds stored in `ShopProfile`, shown as a list at the top of the dashboard:

- A cashier's average discount this week is more than double their 8-week average.
- Customer debt overdue more than 60 days (total and count).
- A day closed with cash variance beyond ±5,000 RWF.
- A product sold below cost more than 3 times in 7 days.
- A shop asset replaced more than twice in 90 days.
- Supplier billing differences above 2% of purchases this month.
- Low stock on a top-20 seller.

**Endpoints:** `GET /dashboard/summary/`, `/dashboard/chain/`, `/dashboard/leakage/`, `/dashboard/products/<id>/`, `/dashboard/people/`, `/dashboard/alerts/`, all with `from` and `to`. Admin and manager only. All aggregation in SQL (`annotate`/`aggregate`), not by loading every page into the browser. Add indexes on `Sale.sale_date`, `SaleItem.sale`, `StockMovement(product, created_at)`, `Payment.paid_at`.

**Frontend:** a period picker (today, this week, this month, last month, custom); the chain as a waterfall chart; leakage cards that click through to filtered lists (Sales, Movements, Debts, Shop use); CSV export per view.

**Tests:** a fixed fixture shop with known sales, returns, discounts, consumption and expenses, asserting every line of the chain to the franc.

## Build order and rollout

Build in this order; each step is mergeable and deployable on its own, so the shop gets value before the whole release is done.

1. **Phase 0** — permission fixes, throttling, banner text. No migrations except throttle settings.
2. **Module A** — ledger, refactor all existing stock paths through `record_movement`, backfill migration.
3. **Module B** — payments and debt, checkout payment panel, data migration for existing sales and purchases.
4. **Module C** — bargaining, PIN, floor. Shares the checkout screen with B, so do it right after.
5. **Module G** — sales history, void/return, end-of-day. Needs A, B and C.
6. **Module D** — internal use and shop assets. Needs A and the PIN from C.
7. **Module E** — search, purchase entry, import, merge. Needs A.
8. **Module F** — bundles and packs. Needs E's search and A.
9. **Module H** — dashboards. Needs everything above to have data.

**For every deploy to production:**

- Create a Neon branch of production first (instant snapshot) and run the new migrations against it. Only migrate production after that passes.
- Migrations run with `DATABASE_URL_UNPOOLED`, as `entrypoint.sh` already does.
- Data migrations must be re-runnable safely (skip rows already migrated).
- Deploy outside shop hours (Vercel containers restart during deploy).
- After deploy, run the ledger consistency check from Module A against production.

**Release notes for the shop:** one short page per deploy saying what changed on the screen and who can do what (Phase 0 removes abilities staff had, so tell them before it ships).

## Release acceptance checklist

The release ships when every box below is ticked on the staging deployment with a copy of production data.

- [ ] A sales\_staff account cannot cancel, return or void a sale, set a price, delete a customer, or see any cost figure.
- [ ] Six wrong logins lock the username for 15 minutes.
- [ ] For 20 random products, the sum of ledger movements equals the inventory buckets.
- [ ] A sale paid 50% cash + 50% MoMo prints both payments; MoMo without a reference is refused.
- [ ] A credit sale without a customer is refused; with a customer it appears on the Debts page with its due date.
- [ ] Paying a customer's debt across three sales clears the oldest first and prints a payment receipt.
- [ ] Reversing a payment puts the balance back.
- [ ] A cashier can give 10% off alone; 15% off asks for a manager PIN; a below-cost price needs PIN and a note.
- [ ] The receipt shows catalog price struck through and the bargained price.
- [ ] "Our printer broke, take one from stock" takes one action and shows on the asset timeline, the movements log and the internal-use report — and not in expenses.
- [ ] Consuming a cable reduces stock and shows its value in "Materials used internally".
- [ ] Typing an existing product name in a purchase row selects it; creating a near-duplicate warns first.
- [ ] Pasting 30 rows from Excel saves all or nothing.
- [ ] Importing a 200-row opening stock CSV previews, then creates products with stock and prices.
- [ ] Merging two duplicates keeps all history and the old barcode still scans.
- [ ] One Canalbox package (1 TV + 20 decoders) received gives 1 TV and 20 decoders in stock, costs adding up to the package price, and 21 labels.
- [ ] Returning 1 of 3 units from last week refunds the paid price; marking it damaged sends it to the damaged bucket.
- [ ] Closing the day shows expected cash including debt collected; a variance appears on the admin's report.
- [ ] The dashboard chain for the test fixture matches hand-calculated figures to the franc, and the manager can open it.
- [ ] Full backend and frontend test suites pass in CI.

## Out of scope for this release

These were discussed and are deliberately left for the next release so this one can ship.

| Item | Why it waits |
| --- | --- |
| EBM / VSDC fiscal receipts | Needs RRA certification as a software provider; start that conversation now, since it decides who can use the product as their only till. |
| Serial/IMEI capture at checkout and warranty lookup by serial | Builds on Modules A and G; next after this release. |
| Repair / service tickets for the technician role | New workflow; depends on serial tracking. |
| Selling a bundle as one kit at the till | Module F handles buying bundles only. |
| SMS or WhatsApp debt reminders and receipts | Needs a messaging provider; due dates and the overdue list come first. |
| Kinyarwanda interface | Needs full translation; the toggle is hidden until then. |
| Offline till | Hard to combine with stock locking; revisit after measuring real downtime. |
| Multiple branches | Single shop only for now. |
| Email notifications | Replaced by honest in-app notifications this release. |
