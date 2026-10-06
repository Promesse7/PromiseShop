# Release Module C — Bargaining at the till

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, "Module C". Built in the same branch as
Module B, because both rewrite `complete_sale` and the checkout screen.

## Decisions taken while building

1. **The rules table lives in `sales/pricing.py`** (`evaluate_line`), shared by `complete_sale` and the
   `POST /api/sales/price-check/` endpoint, so the till's colours and the server's verdict can never
   disagree.
2. **The floor** is `Product.min_price` when it is set, otherwise the weighted average paid cost
   (`stock.services.weighted_average_cost`, the same figure stored as `SaleItem.cost_at_sale`).
   When neither is known there is no floor and only the % rule applies.
3. **Privilege comes from the seller's role.** Managers and admins pass the % rule. A below-floor
   line still needs a `price_note` from every role, but only staff also need a PIN.
4. **One approval per sale.** `approval: {approver_username, pin}` is verified once by
   `accounts.services.verify_approval`, which Module B's credit-limit check shares.
   - The approver lands in `approved_by` only on the lines that needed it.
   - An approval sent for a cart that doesn't need one is ignored, not checked.
5. **PIN lockout.** Wrong PINs count toward the same lockout as login, on a key `pin:<approver>`:
   5 wrong attempts in 15 minutes lock that approver's PIN for 15 minutes (429).
   - The refusal never says which part was wrong.
   - A technician, a staff member, an inactive manager or a manager without a PIN can't approve.
6. **Error codes the till can act on:** `approval_required` (open the PIN dialog) and
   `price_note_required` (ask for a note). Neither message contains a cost or floor figure.
7. **`discount_amount` = (list − unit) × qty**, negative for a markup.
   - The migration backfills it for existing lines.
   - `cost_at_sale` stays null on old lines, because the cost at that moment was never recorded.
8. **`ShopProfile.max_staff_discount_pct`** defaults to 10. Every role can read the shop profile
   (receipts) and only admin can PATCH it, from the new admin-only **Settings** page.
9. **Approval PINs** are hashed with `make_password`, 4–6 digits, and only admin and manager accounts
   can have one. Admin sets them with `POST /api/employees/<id>/set-pin/` from the Employees page.
   The serializer only exposes `has_approval_pin`.
10. **Cost stays hidden from staff.** `cost_at_sale` is stripped from sale lines and `min_price` from
    products for staff. Staff sending `min_price` get 403.

## Tests
`sales/tests/test_bargaining.py`:
- every row of the rules table for staff and for managers
- the min_price floor, and the shop-profile limit
- wrong PIN refused and locked after five attempts, a non-manager approver and an inactive manager
  refused, a zero price refused
- staff responses never contain `cost_at_sale` / `min_price`
- the price-check endpoint, the set-pin endpoint and the shop-profile permissions
