# Release Module H — Dashboards that explain the money

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, Module H. Base: `release/2026-10` at 25a13ca
(Phase 0 + Modules A–G).

## Decisions

1. **The chain is a cohort of the period's sales.** Returns and voids are subtracted from the sales they were made
   on, whenever they happened, so every step reconciles: catalog − discounts/markups = net sales; net sales −
   returns/voids = kept sales; − output VAT = net excl. VAT; − COGS = gross profit; − expenses = operating
   profit. VAT and COGS are taken on *kept* units only (sold − returned, voided sales excluded).
2. **Voids** are shown inside "Returns and voids" (the voided sales' subtotals), not silently dropped, so the leak
   is visible. **Returns** use the refunded amount (`SaleReturnItem.refund_amount`), which may be below the price.
3. **Output VAT on kept lines** = `tax_amount × kept_qty / qty`, summed in SQL and rounded once.
4. **COGS** = Σ kept_qty × `cost_at_sale`. Lines sold before Module C recorded a cost fall back to today's weighted
   average cost and are counted as "estimated"; lines with no cost at all add nothing and are counted as unknown.
5. **Input VAT** = invoiced × 18/118 for category-B goods on received purchases with `has_vat_invoice`.
   `PurchaseItem.tax_category` and `PurchaseItemComponent.tax_category` snapshot the product's category on save
   (back-filled by migration). Bundle lines use each component's own category and allocated invoiced cost.
   Shown as output − input, labelled **"Estimate — not a tax filing"**.
6. **Beside the chain** (leakage cards, each linking to a filtered list): discounts given, materials used internally
   (Module D `materials_used_internally`, consumed + taken as assets), damaged write-offs (movements into the
   damaged bucket of type `to_damaged` or `sale_return`, × recorded unit cost), supplier billing differences
   (invoiced − paid on received purchases by purchase date), new credit given and debt collected (same rules as
   the Module G Z-report), customer debt outstanding and owed to suppliers (Module B aging as of the end date).
7. **Below-floor approvals** in the people view use the product's *current* `min_price` (or the line's
   `cost_at_sale` when none): the floor at the time of sale is not stored.
8. **Alerts** use `ShopProfile` thresholds (defaults = handoff values), editable on `/settings`, evaluated as of the
   period's end date: discount spike (last 7 days vs the 8 weeks before), customer debt overdue (due date or sale
   day), day closes in the last 7 days with |variance| above the limit, product sold below cost more than N times
   in M days, asset replacement chains (Module D `frequent_replacements`), supplier billing differences this month
   as % of paid, low stock on the top-N sellers of the last 30 days.
9. **Older endpoints made consistent** (from Module G's note): sales-summary, financial-snapshot and profitability
   now count every non-voided sale and net off returns (units and refunds), so their revenue equals the chain's
   kept sales. The frontend overview trend and top sellers do the same.
10. **Indexes:** `Sale.sale_date` and `Payment.paid_at` already existed (Modules G and B), `SaleItem.sale` is an
    FK index, `StockMovement(product, created_at)` exists (Module A). No new index needed.
11. **Bulk average cost:** `dashboard.money.bulk_average_costs` computes weighted average costs for many products in
    a fixed number of queries (same definition as `weighted_average_cost`), for COGS fallbacks and stock value.

## Endpoints (admin/manager; `?from=YYYY-MM-DD&to=YYYY-MM-DD`, default this month)

- `GET /api/dashboard/summary/` → sales_count, net_sales, kept_sales, average_sale, gross_profit, gross_margin_pct,
  expenses, operating_profit, customer_debt, owed_to_suppliers, stock_value, vat{output_vat,input_vat,net_vat,label}
- `GET /api/dashboard/chain/` → steps[{key,label,amount,kind: total|delta}], figures{…}, cogs_estimate{…}, vat{…}
- `GET /api/dashboard/leakage/` → cards[{key,label,value,link,detail?}]
- `GET /api/dashboard/products/<id>/` → per-product drill-down (costs, prices, VAT/unit, margins, units sold,
  consumed, damaged, stock value)
- `GET /api/dashboard/people/` → cashiers[…], approvers[…]
- `GET /api/dashboard/alerts/` → as_of, alerts[{code,severity,message,link}]

## Frontend

`/dashboard`: Overview / Money chain / People tabs, alerts above every tab, a period picker (today, this week, this
month, last month, custom), the chain as an SVG waterfall (theme-aware via `fill-current`), leakage cards that open
`/sales?has_discount=true`, `/stock/movements?type=to_damaged`, `/debts`, `/shop-use`, `/purchases`; VAT estimate
card; CSV export per view. `/dashboard/products/[id]` drill-down linked from the product page's cost card. New
purchase dialog: "Supplier gave a VAT invoice". Settings: dashboard alert thresholds. The sales and stock movements
pages now read their filters from the URL.

## Tests

`dashboard/tests/test_money_chain.py` — a fixture shop (discount, markup, partial return, void, credit sale,
consumption, damage, expense, supplier billing difference) asserted to the franc for every chain line, the VAT
estimate, leakage, product drill-down, people, the older endpoints' consistency, and staff 403s.
`dashboard/tests/test_money_alerts.py` — every alert rule fires and stays quiet, thresholds from the profile, API
editing. Vitest for the period helper, waterfall layout, money views, product drill-down, settings thresholds,
purchase VAT flag, and the dashboard tabs.
