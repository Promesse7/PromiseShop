# Release Module A — Stock movement ledger

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, "Module A". Built on Phase 0 (`592144e`).

## Decisions

1. **`record_movement(inventory, bucket, delta, movement_type, source, user, reason="", unit_cost=None)`**
   - `source` is a `(source_type, source_id)` tuple, or `None`.
   - `unit_cost=None` means "use the weighted average paid cost now". A caller may pass an explicit cost; purchase receipts and cancels pass the line's own paid unit cost, because that is what those units cost.
   - A zero delta is refused, except for `adjust_count`: a stock take that confirms the count is still worth a row.
2. **Manual types need a reason:** `adjust_count`, the four bucket moves, `internal_consumption`, `to_shop_asset`, `opening`, `merge_in` and `merge_out`. Movements caused by a document (purchase, sale, return, void, bundle) take their reason from that document.
3. **Receipts and cancels write one movement per purchase line** (`source_type="purchase_item"`), so each row carries that line's cost. **Sales, returns and voids also write one per sale line** (`"sale_item"`). Cancelling a sale writes `sale_void`; returning a whole sale writes `sale_return`. Module G replaces both flows.
4. **Service signatures gain an optional `user`.** It is keyword-only with default `None`, so existing callers and tests keep working, and the views pass `request.user`. `complete_sale` uses its `employee`, and `adjust_inventory` uses `changed_by`.
5. **A count correction** writes `adjust_count` with delta = new − old. A bucket move writes two rows, one per bucket. Both link to the `InventoryAdjustment` through `("adjustment", id)`.
6. **`unit_cost` is null** when the product has never had a received purchase. **`created_by` is null** only for system rows (the backfill).
7. **Append-only:** `save()` on an existing row and `delete()` raise. The QuerySet's `update()` and `delete()` raise too, and the admin is read-only. Product deletion still cascades through Django's collector. That only happens for products with no trade history, per the existing rule.
8. **Backfill:** one `opening` row per non-zero bucket of every Inventory, reason "Ledger start", with no user. Inventories that already have movements are skipped, so the migration can be re-run.
9. **Endpoint `GET /api/stock/movements/`** takes the filters `product`, `type`, `bucket`, `from` and `to`. The dates are calendar days in Africa/Kigali (the project time zone). Results are newest first and paginated. Every authenticated role can read it; `unit_cost` is removed for sales_staff and technician.
10. **`check_stock_ledger`** is a management command over `stock.ledger.ledger_mismatches()`. It exits with status 1 and lists each mismatch.
