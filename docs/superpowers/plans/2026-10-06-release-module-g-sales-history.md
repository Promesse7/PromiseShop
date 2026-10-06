# Release Module G — Sales history, returns and end-of-day

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, Module G. Builds on Phase 0 and Modules
A (ledger), B (payments), C (bargaining), E. Branch `release/module-g`.

## Decisions

1. **Statuses.** `completed`, `partially_returned`, `returned`, `voided`. A data migration turns legacy
   `cancelled` into `voided`. Legacy `returned` sales (whole-sale reversals from before this module) get
   `returned_amount = total_amount`, so their balance stays 0 and statements still add up.
2. **The old `/cancel/` and `/return/` actions and `reverse_sale` are gone.** Replaced by
   `POST /api/sales/<id>/void/` and `POST /api/sales/<id>/returns/` (both admin/manager).
3. **What a sale is owed** is `total_amount − returned_amount − amount_paid`. `returned_amount` is a cached
   Σ of its return items' `refund_amount`, updated in the same transaction as the return.
   `payment_status` compares `amount_paid` against `total_amount − returned_amount`.
   `OPEN_SALE_STATUSES` = completed, partially_returned, **and returned**: a fully returned credit sale
   whose refund was lowered can still carry a balance, and the open filter
   (`amount_paid < total − returned`) keeps settled ones out anyway. Voided sales never count.
4. **Void:** whole sale, same Africa/Kigali calendar day, status `completed`, no returns on it. Writes a
   `sale_void` movement per line and reverses every payment that hasn't been reversed (Module B's
   `reverse_payment`, reason "Void: …"). Stores `void_reason`, `voided_by`, `voided_at`.
5. **Return:** `SaleReturn` + `SaleReturnItem`.
   - A line can't return more than sold minus already returned (summed across earlier returns, and across
     duplicate lines in one request).
   - `refund_amount` defaults to `unit_price × qty` (price actually paid) and may be lowered, never raised.
   - `resellable` → `sale_return` movement into `in_stock`; `damaged` → into `damaged`.
   - **Money:** `paid_out = clamp(amount_paid − (net_total − refund_total), 0, refund_total)`. A fully paid
     sale pays out the whole refund; a credit sale's refund first reduces what is owed, and only an excess
     is paid out. The payout is an `out` Payment on the sale with the chosen method (reference required for
     non-cash). `SaleReturn` stores `refund_total`, `paid_out` and `balance_reduced`; `refund_method` is
     only required when something is paid out.
   - Status becomes `partially_returned`, or `returned` once every unit is back.
   - **Serialised units are skipped:** `EquipmentUnit` isn't linked to sale lines (serial capture at the
     till is out of scope for this release).
6. **History visibility.** Staff (sales_staff/technician) see only their own sales from today (Kigali), in
   the queryset, so other sales 404. One exception: `?customer=<id>&open=true` returns that customer's
   open sales to any role, because staff may record a customer's debt payment from the customer page
   (Module B decision).
7. **End-of-day (`finance.DailyClose`).** Per cashier per Kigali business date, unique, never reopened.
   - Expected cash = opening float + the drawer effect of that day's **cash sale-side payments**: payments
     the cashier recorded (`in` adds, `out` refunds subtract), and reversals of payments the cashier
     recorded (a reversal undoes the drawer the money went into, whoever pressed the button). Supplier
     payments are not drawer money in this model and are left out.
   - Non-cash methods are listed per method with their references.
   - Z-report: sales count and total (excluding voided), voided count, totals by method, discounts given
     (Σ positive `discount_amount`), returns on the cashier's sales that day (count, refunded, paid out),
     debt collected (`in` payments on sales from earlier days), new credit given (current balance of that
     day's sales).
   - Closing needs a manager/admin PIN (`verify_approval`), even when a manager closes their own day;
     `closed_by` is the approver. Staff may only close their own day.
8. **Dashboards.** Revenue figures still filter `completed` only; Module H rebuilds them from returns and
   voids. Noted for H.

## Endpoints

- `GET /api/sales/?from=&to=&cashier=&customer=&payment_status=&payment_method=&has_discount=&has_return=&status=&open=`
- `GET /api/sales/<id>/` adds `returns[]`, `movements[]`, `returned_amount`, `void_*`, `can_void`.
- `POST /api/sales/<id>/void/` `{reason}`
- `POST /api/sales/<id>/returns/` `{reason, refund_method?, refund_reference?, items:[{sale_item, quantity, condition, refund_amount?}]}`
- `GET /api/daily-close/?cashier=&from=&to=`, `GET /api/daily-close/preview/?cashier=&date=&opening_float=`,
  `POST /api/daily-close/` `{cashier, business_date, opening_float, counted_cash, note, approval}`

## Tests

The handoff list: void refused for yesterday; partial-return limits; refund default = price paid; credit
refund reduces balance first; damaged return → damaged; expected cash with collections and refunds; staff
can't see other cashiers' sales; ledger clean after void and return; cached `amount_paid` /
`returned_amount` consistent.
