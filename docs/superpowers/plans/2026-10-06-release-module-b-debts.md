# Release Module B — Debt management

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, "Module B". Builds on Phase 0 + Module A.

## Decisions taken while building

1. **One `finance.Payment` table, two directions.** `in` = money from a customer (sale set), `out` = money
   to a supplier (purchase set). A DB check makes exactly one of sale/purchase set. A refund (Module G) is
   `out` with a sale, so a sale's `amount_paid` = Σ in − Σ out and a purchase's = Σ out − Σ in.
2. **Reversals are rows, never edits.** `reverse_payment` writes a new row with a negative amount and
   `reversal_of` (a one-to-one, so a payment can be reversed once). A check constraint allows a negative
   amount only on a reversal row. Payments are append-only (save-on-existing / delete / queryset
   update+delete raise `AppendOnlyError`, the same as `StockMovement`).
3. **Cached balances.** `Sale.amount_paid` / `Purchase.amount_paid` are refreshed by
   `refresh_sale_payments` / `refresh_purchase_payments` inside the payment's transaction; the tests
   call `assert_cache_matches` after every payment change.
4. **Sale payment status:** `paid` (paid ≥ total), `partial`, `credit` (nothing paid).
   **Purchase payment status:** `paid` (total > 0 and paid ≥ total), `partial`, `unpaid`. It is
   read-only in the API, re-derived on every payment and whenever lines change the total.
5. **What a purchase owes is `total_paid`**, the agreed buying price per line ("profit uses paid").
   `total_invoiced` stays a reporting figure for billing differences.
6. **Checkout** takes `payments: [{method, amount, reference, tendered}]`.
   - The old `payment_method`-only request still works: one full payment in that method, cash when
     blank.
   - Non-cash lines may not exceed the total.
   - Cash above what is still due is trimmed and returned as `change_due`, together with any
     `tendered − amount`.
   - A sale not fully paid needs a customer with a phone number, and gets `due_date` = Kigali today
     + 30 days unless one is sent.
   - `Sale.payment_method` keeps the single method when there is exactly one, else null.
7. **Credit limit.** If a staff seller's sale takes a customer over `credit_limit`, it needs
   `approval: {approver_username, pin}`. This is checked by the shared
   `accounts.services.verify_approval`, which Module C also uses, under the login lockout rules.
   Admin and manager sellers are not asked.
8. **Customer payments** are allocated oldest due first (due date, then sale date). They can be
   restricted to chosen `sale_ids`. The amount may not exceed what is owed. One `receipt_group` UUID
   per customer payment.
9. **Open balance** counts completed sales only. Cancelled and returned sales drop out of debts and
   statements; Module G adds partially-returned sales.
10. **Aging** uses Kigali dates against `due_date`; a sale without one counts from its sale date and a
    purchase from its purchase date. Buckets: not due, 1–30, 31–60, 61–90, 90+.
    - Supplier payables are received purchases with a balance, or with the migration review flag.
11. **Permissions.**
    - Any role records a customer payment.
    - Supplier payments, reversals, the Debts endpoints and credit limits are admin/manager. Staff
      sending `credit_limit` get 403.
    - Staff see only sale-side payments in `/payments/`.
12. **Data migration** (`finance/0005_backfill_payments`, re-runnable):
    - Completed sales get one `in` payment of their total in the old method. Cash is used when the
      method was blank, and non-cash payments get reference "MIGRATED".
    - Cancelled and returned sales get no payment and stay "paid" with amount_paid 0.
    - Purchases marked Paid get one `out` cash payment of `total_paid` at noon on the purchase date.
    - Partial and Unpaid purchases get no payment, `payment_needs_review=True` and show
      "Migrated — confirm amount paid". The flag clears on the first supplier payment or through
      `POST /api/debts/suppliers/purchases/<id>/confirm-review/`.

## Endpoints
- `POST /api/sales/` — gains `payments`, `customer`, `approval`, `due_date`. The response adds
  `amount_paid`, `balance`, `payment_status`, `due_date`, `payments[]` and `change_due`.
- `POST /api/payments/customer/` `{customer, amount, method, reference, sale_ids?, note?}` →
  `{receipt_group, amount, balance_after, payments[]}`
- `POST /api/payments/supplier/` `{purchase, amount, method, reference, note?}` (admin/manager)
- `POST /api/payments/<id>/reverse/` `{reason}` (admin/manager)
- `GET /api/payments/?sale=&purchase=&customer=&receipt_group=`
- `GET /api/debts/customers/?as_of=` and `GET /api/debts/suppliers/?as_of=` (admin/manager) →
  `{as_of, totals{not_due,1_30,31_60,61_90,90_plus}, total, rows[]}`
- `GET /api/customers/<id>/statement/?from=&to=` → opening balance, entries with a running balance,
  closing balance
- `GET /api/customers/` rows gain `balance` and `credit_limit`; `GET /api/sales/?customer=&open=true&payment_status=`

## Tests
`finance/tests/test_payments.py`:
- checkout: split payment, MoMo without a reference, legacy single-method sale, underpaid walk-in,
  credit without a phone, full credit, partial, non-cash overpayment, cash change, credit limit with
  and without the PIN, manager sellers
- payments: oldest-first allocation over three sales, chosen sales, overpayment, reversal (restores
  the balance, can't be repeated or reversed again), append-only, the negative-amount constraint
- suppliers: status follows lines and payments, overpayment, the review flag
- aging buckets on fixed dates, the statement running balance
- API permissions, and the re-runnable backfill
