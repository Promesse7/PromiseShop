
How PromiseShop works today

PromiseShop is a Django REST backend with a Next.js frontend, and its data lives in Neon Postgres. Each part of the shop has its own backend module (catalog, stock, purchasing, sales, finance, dashboard, notifications, accounts).

Every stock-changing operation runs inside one database transaction. It locks the inventory rows it touches, so two tills can't sell the same last unit.

Below is what is actually implemented now, from the backend code plus a full pass over the frontend screens.

---

1. Who can do what

There are four roles: admin, manager, sales_staff and technician.

┌────────────────────────────────────────────┬───────────────┬────────────────────────┬───────────────────────────────┐
│                    Area                    │     Admin     │        Manager         │      Staff / Technician       │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Checkout (sell)                            │ ✅            │ ✅                     │ ✅                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Products: view                             │ ✅            │ ✅                     │ ✅ (no cost prices)           │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Products: create, edit, deactivate, delete │ ✅            │ ✅                     │ ❌                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Set cost (wholesale) price                 │ ✅ only admin │ ❌                     │ ❌                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Set retail price                           │ ✅            │ ✅                     │ ⚠️ yes (see gaps)             │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Stock adjustments                          │ ✅            │ ✅                     │ ❌                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Purchases: create, add items, receive      │ ✅            │ ✅                     │ ✅                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Purchases: cancel                          │ ✅            │ ✅                     │ ❌                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Suppliers, customers                       │ ✅            │ ✅                     │ ✅ (backend doesn't restrict) │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Dashboard                                  │ ✅            │ ❌ (gets "admin only") │ ❌                            │
├────────────────────────────────────────────┼───────────────┼────────────────────────┼───────────────────────────────┤
│ Expenses, employees, notifications         │ ✅            │ ❌                     │ ❌                            │
└────────────────────────────────────────────┴───────────────┴────────────────────────┴───────────────────────────────┘

After login, admin and manager land on the Dashboard and everyone else lands on Checkout.

The frontend mostly hides buttons. The real enforcement is in the backend, which refuses with a 403.

---

2. Catalog: the foundation of everything

Categories have a name and a short code, for example AUD. The code is the barcode prefix.

Products carry:
- name, brand, model and descriptions (specs, "how it works")
- warranty in months
- a reorder level (default 5) and a unit (default "pcs")
- a VAT category: B = Standard 18% (default) or A = Exempt 0%
- an active/inactive flag

Barcodes are assigned by the shop, automatically. Each one is PES-<category code>-<5-digit number>, for example PES-AUD-00012.
- The number is the highest existing number in that category + 1.
- The category row is locked while the number is computed, so two people creating products at the same moment can't get the same barcode.
- A barcode can't be edited. The "Regenerate" button in the UI is permanently disabled.

Pricing is a history, not a single field. Each ProductPricing row holds:
- retail_price: the selling price. It includes VAT.
- wholesale_price: effectively the cost price. Only admin and manager can see it, and only admin can set it.
- an effective date.

Exactly one row per product is marked "current"; the database itself enforces this. Setting a new price creates a new row, and the old ones stay as price history.
- If a non-admin sets a price, the current cost price is carried forward.
- The very first price on a product must be set by an admin.

A product without a price cannot be sold. Checkout blocks it, and the backend also refuses.

Deleting vs deactivating:
- A product that has any purchase or sale history can't be deleted; the system tells you to deactivate it instead.
- Deactivated products disappear from checkout but keep all their history.
- A category can't be deleted while it still has products.

Product page: stock card, pricing and margin, cost-vs-margin analysis, last 5 stock adjustments, price history, specs, a printable info sheet, and a Reorder button.

Products list: grid or list view, filters (category; in stock / low / out; inactive), sorting, bulk label printing and bulk deactivate. Labels are 63.5×33.9 mm with name, price and barcode.

---

3. Stock control

3.1 The inventory record

Each product has one Inventory row with three buckets and a location:

┌───────────────────┬──────────────────────────────────────────────────────────────────────────┐
│      Bucket       │                                 Meaning                                  │
├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ quantity_in_stock │ Sellable units on the shelf. This is the only bucket sales draw from.    │
├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ quantity_in_use   │ Taken out of sellable stock for use, labelled "In use (demo)" in the UI. │
├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ quantity_damaged  │ Broken or unsellable.                                                    │
├───────────────────┼──────────────────────────────────────────────────────────────────────────┤
│ storage_location  │ Free text, editable from the product page.                               │
└───────────────────┴──────────────────────────────────────────────────────────────────────────┘

You can't create an inventory row by hand. It appears automatically the first time a purchase for that product is received (or at the first sale attempt). Until then the product shows "Not yet received".

Low stock means in_stock ≤ reorder_level, and Out of stock means in_stock = 0. The flags appear as tags on the Products and Stock pages, as the "Needs reorder" number on the Dashboard, and in its Low stock table.

3.2 What moves stock

┌────────────────────────────┬─────────────────────────────────────────────┬─────────────────────────────┐
│           Event            │               Effect on stock               │         Audit trail         │
├────────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────┤
│ Receive purchase           │ in_stock + qty for every line               │ The purchase record itself  │
├────────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────┤
│ Cancel a received purchase │ in_stock − qty (reversed)                   │ Purchase status → cancelled │
├────────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────┤
│ Complete sale              │ in_stock − qty                              │ The sale record             │
├────────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────┤
│ Return / cancel sale       │ in_stock + qty (backend only, see gaps)     │ Sale status                 │
├────────────────────────────┼─────────────────────────────────────────────┼─────────────────────────────┤
│ Manual adjustment          │ Moves stock between buckets, or recounts it │ InventoryAdjustment row     │
└────────────────────────────┴─────────────────────────────────────────────┴─────────────────────────────┘

Safety checks built in:
- Overselling is impossible. A sale fails with "Insufficient stock… requested X, available Y" if the shelf count is too low. All affected rows are locked first, in a fixed order, so concurrent sales can't deadlock or slip through.
- A received purchase can't be cancelled once its stock has moved on. If you've already sold some of what it brought in, cancelling is refused and it names the products, for example "only 2 left, 5 would need to be reversed". This prevents the stock count going negative.

3.3 Manual stock adjustments (admin and manager)

You reach this from the Stock page or the product page. There are five types:

1. Count correction: you type the real count after a stock take, and in_stock is set to that number.
2. To damaged: in stock → damaged.
3. From damaged: damaged → in stock, for example after a repair.
4. To in use: in stock → in use.
5. From in use: in use → in stock.

For every adjustment:
- A reason is mandatory.
- You can never move more than the source bucket holds, for example "Cannot move 30 to damaged: only 12 in stock".
- An audit row records who did it, when, the type, the quantity, the reason, and all three buckets before and after.

The product page shows the last 5 of these rows.

3.4 Serialised equipment (individual units)

For items you track one by one, each EquipmentUnit has:
- a unique serial number
- a status: in_stock, in_use, damaged, under_repair or sold
- a location, condition notes, and an optional "assigned to" employee

How you work with units:
- Register unit (Stock page): enter the serial, location and notes, and the unit is created as in stock. You can print its label straight away.
- Quick status change (/stock/scan): scan or type a serial, choose "Move to…", give a reason, and save.
- Unit page (/stock/units/<id>): the full status-history timeline, showing previous → new status, date, who and notes.

Every status change requires a reason and writes a history row, just like bulk adjustments.

Units are a separate system from the bulk counts. Changing a unit's status (even to "sold") does not change the product's in_stock number, and selling at checkout doesn't mark any unit as sold.

---

4. Purchasing (bringing stock in)

4.1 Suppliers

A supplier has a name, contact person, phone, email and address. There is a searchable card grid with create and edit. There is no delete and no per-supplier history.

4.2 Purchase lifecycle

DRAFT ──(Receive)──► RECEIVED ──(Cancel*)──► CANCELLED
  └────────(Cancel)──────────────────────────┘
* only if the received stock hasn't moved on

1. New purchase: pick a supplier (required), add an invoice number, date (default today), and payment status: Paid, Partial or Unpaid. This creates a draft.
2. Add items (draft only), in one of two modes:
   - Single: search the catalog and pick a product, or "+ Add 'X' as a new product".
   - Bulk: a spreadsheet-style table that matches typed names against the catalog. "Add all rows" posts them one by one, and rows that fail keep their error so you can fix them.

   For every line you enter:
   - Quantity.
   - Buying price paid per unit: what you actually paid.
   - Buying price on the invoice per unit: what the supplier's invoice says.
   - Discrepancy note: mandatory whenever paid ≠ invoiced. This is how the shop records supplier billing differences.

   New product created during a purchase: you also give the category and selling price, and optionally brand, model, warranty, reorder level, specs and usage.
   - A barcode is generated automatically.
   - A price row is created with retail = your selling price and cost = the paid price.
   - Duplicate protection: if a product with the same name already exists (ignoring case and spacing), the line links to the existing product instead of creating a duplicate. The existing product keeps its own price.
3. Check totals: the purchase keeps Total paid and Total invoiced, and the UI shows the difference ("profit uses paid"). They are recalculated whenever a line is added or removed.
4. Receive purchase → stock increases: this adds every line's quantity to in_stock in one transaction and locks the purchase. After that you can't add, remove or edit lines, and the header can't be edited either.
5. Cancel (admin and manager): a draft can always be cancelled. A received one can be cancelled only if its stock is still there, and then the stock is reversed.

Purchases can never be deleted; this is deliberate, so stock and history can't drift apart.

Cost prices are visible to admin and manager only. Staff can record purchases but don't see the cost columns.

4.3 Reorder flow

From a low-stock row on the Dashboard, or the product page, Reorder opens a new purchase with the product name prefilled. It doesn't pick a supplier or suggest a quantity, and there are no automatic purchase orders.

---

5. Retail / checkout (selling)

Who and how: every role can use Checkout. It is built for scanners and tablets: an auto-focused "Ready to scan…" field, and large ± buttons on smaller screens.

The flow:
1. Scan or search. An exact barcode match is tried first, then a name, brand or model match, with up to 8 suggestions shown. Scanning the same item again adds 1 to its quantity. Inactive products are hidden.
2. Cart lines show the name, "N in stock", an editable unit price (VAT included), an editable quantity and the subtotal.
3. Price override = the discount mechanism. There's no discount field: you change the line price. The original catalog price is still stored with the sale line, so the totals show "Discount vs catalog" or "Markup vs catalog", and every discount stays auditable afterwards.
4. Payment method: Cash, Mobile Money, Card or Bank transfer. There is no cash-tendered or change calculation and no split payment.
5. Complete sale. In one transaction the backend:
   - checks stock for every product and refuses if it isn't enough;
   - prices each line at the override or the current retail price;
   - computes VAT per line. Prices include VAT, so for an 18% item the VAT is subtotal − subtotal/1.18, and an exempt item has 0;
   - saves the sale and its lines (unit price, list price, subtotal, VAT category, VAT amount);
   - takes the quantities out of in_stock;
   - creates a notification record for each active admin.
6. Receipt, which can be printed:
   - the shop header (name, TIN, P.O. box, contacts)
   - receipt number, date, cashier and payment method
   - the lines, with the list price where it was overridden
   - VAT grouped A/B, total VAT and the total
   - "Murakoze!"
   - It is clearly marked "SAMPLE RECEIPT — pending EBM/SDC certification". It is not yet a fiscally valid RRA receipt.

Customers: a separate page where you can create, edit and search customers. However, the customer field at checkout is disabled, so every sale is currently a walk-in sale.

Retail vs wholesale selling: there is no wholesale price mode at the till; it always starts from the retail price. The "wholesale price" in the system is really the cost price.

---

6. Money, reports and the rest

Dashboard (admin only):
- Stat cards: this month's sales revenue, purchase cost, gross profit and "Needs reorder", each with a sparkline and the change from last month.
- A 6-month revenue/cost chart.
- The low-stock table with Reorder links.
- Top sellers, with margin.
- Slow movers: no sale in 30+ days.
- CSV export.

Profitability (admin and manager, shown per product on the product page):
- Cost per unit is a weighted average over all received purchases. Stock isn't tracked by batch, so this is the honest per-unit cost.
- Actual margin = what the till charged − the paid cost.
- Projected margin = the catalog price − the invoiced cost.
- The gap between the two is what till discounts and supplier billing differences cost you.

Expenses (admin only): Rent, Utilities, Salaries, Repairs or Other, with amount, date and description. You can create, edit and filter them; there is no delete.

Employees (admin only): create and edit staff, set role and status (active, inactive or terminated), and reset passwords.

Notifications (admin only): a log of "sale" and "sale reversed" events.

Guidance bar (every page): a setup checklist until the first purchase is received (category → product → price → purchase → receive). After that it shows to-dos such as "N products need a price", "N draft purchases" and "N products never received".

---

7. Gaps and rough edges worth knowing

Stock control
1. No single stock-movement log. Adjustments get detailed before/after audit rows, but sales and purchase receipts change the count directly. Their history lives only in the sale and purchase records. You can't ask "show every movement of product X over time" in one place.
2. No "used by the shop" (internal consumption) type. This is exactly your new Todo.md item. The closest thing today is "To in use", but that treats the units as still owned and returnable, not consumed. It also isn't an expense, which matches your note.
3. Serialised units and bulk counts aren't linked, as explained in 3.4.

Sales

4. No sales history screen, no returns and no voids in the UI. The backend can return or cancel a whole sale and put the stock back, but there are no partial returns. Any logged-in user can call it, and no screen uses it.
5. The customer can't be attached to a sale, and there's no wholesale or trade pricing mode.
6. The receipt banner says "admin notified by email", but no email is ever sent. The backend only writes a log row marked as sent, and the Retry button is disabled.
7. Any role can change a product's retail price, because the "Set new price" button isn't restricted for staff.

Purchasing

8. The /purchases/<id>/scan "receive by scanning" page exists but nothing links to it.
9. Bulk "Print all new labels" prints the whole page instead of a label sheet.

Other

10. The dashboard is admin-only, so managers get an "admin only" notice.
11. The EN/RW language toggle on the login page does nothing. All text is English.
12. There's no offline mode, so the till needs internet.

