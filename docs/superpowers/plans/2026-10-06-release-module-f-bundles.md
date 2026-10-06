# Release Module F — Bundles, packs and labels at receive

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, "Module F". Base: `release/2026-10` @ b97b61b
(Phase 0, Module A ledger, Module E search/entry/import/merge).

## Decisions

1. **One line, three kinds.** `PurchaseItem.line_kind` is `single` (default), `pack` or `bundle`.
   - For every kind, `quantity` counts what the supplier sold: units, packs or bundles. `unit_cost_paid` and
     `unit_cost_invoiced` are the price of one of those, and `subtotal_* = quantity × unit_cost_*` as before.
     Purchase totals therefore need no change.
   - `units_per_pack` is 1 on single and bundle lines, and at least 2 on a pack line (the service forces this).
2. **A bundle line has no product.** It has a `bundle_name` and `PurchaseItemComponent` rows. Two DB check
   constraints hold this: only a bundle line may have a null product, and a bundle line must have one.
   `units_per_pack >= 1` is a third.
3. **Components** store `qty_per_bundle` and the per-bundle `allocated_paid_cost` /
   `allocated_invoiced_cost`. Units received = bundles × qty_per_bundle. A component's per-unit cost is
   allocated ÷ qty_per_bundle. The allocations must sum **exactly** to the line's per-bundle prices.
4. **Default split.** It is proportional to current retail price × qty. A component with no current price
   (for example a brand-new product without a selling price) is weighted at the average per-unit retail price
   of the priced components. If none are priced, the split is by quantity. Each share is rounded down to the
   cent, and the leftover cents go to the component with the largest share (the first such on a tie). Paid
   and invoiced are split independently.
   - The handoff only covers the "nothing priced" case. Without the averaging step, a single unpriced
     component would be allocated 0 and look free, so that gap is filled here.
5. **Allocation input.** Each of `allocated_paid_cost` / `allocated_invoiced_cost` is optional as a set.
   Omit it on every component to get the default split; give it on every component to override, and the sum
   is checked. Giving it on only some components is refused. A product may appear only once per bundle.
6. **Cost helper.** `purchasing.costing.received_cost_totals(product_ids=None)` returns
   `{product_id: {"units", "paid", "invoiced"}}` over received purchases. Single and pack lines contribute
   `quantity × units_per_pack` units at their subtotals; bundle components contribute
   `bundles × qty_per_bundle` units at `bundles × allocated cost`. `weighted_average_cost`, the dashboard
   profitability costs, product search `last_paid_cost` and supplier `recent-products` all use per-unit
   figures.
7. **Ledger.** Receiving writes one `purchase_receipt` movement per single or pack line (units, unit cost =
   paid ÷ units_per_pack) and one per bundle component (source `("purchase_item_component", id)`). Cancelling
   mirrors that with `purchase_cancel`, after the existing "stock already moved on" check, which now sums
   units per product across every kind.
8. **Templates.** `BundleTemplate` has a name, an optional supplier, created_by, created_at and its
   components (product, qty_per_bundle). Admin and manager have full CRUD; any role may list and read them
   (`?supplier=` filter). Saving a bundle line with `save_as_template: true` + `template_name` records the
   template from that line's components.
9. **Merge (Module E4).** A new `MERGE_STEPS` entry moves bundle components to the kept product. Product
   delete and "Set opening stock" also treat bundle components as purchase history.
10. **After Receive** the workspace opens a dialog: "Print labels — N labels for the units just received".
    N is per unit across every kind, and it uses `LabelSheet`. For products that already have EquipmentUnits
    it also offers "Scan serials now", which creates units through the existing endpoints (register, then
    change-status to in_stock). Both are optional.
11. Selling a bundle as one kit at the till stays out of scope.

## Frontend decisions

12. **Where the kind switch lives.** It's part of the workspace add-mode toggle: Single, Bulk, Pack, Bundle.
    The spreadsheet-style Bulk table and paste-from-Excel stay single-unit only; the API accepts pack and
    bundle rows in bulk, but the table doesn't offer them yet.
13. **Templates in the UI.** Templates are created with "Save as template" on a bundle line and picked from
    the supplier's list in the bundle form. There is no separate page for managing templates; the
    admin/manager CRUD API exists for that later.
14. **Scan to add.** "+1" only adds to a single-unit line of the scanned product, never to a pack or bundle.
