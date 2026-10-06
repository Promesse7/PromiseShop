# Release Module E (part 2) — E3 opening stock import, E4 merge duplicates

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, Module E sections E3 and E4, as adapted by the
coordinator for the append-only stock ledger (Module A). Base: `release/2026-10` at `b547927`.

## Decisions

1. **Opening stock has a cost.** `weighted_average_cost(product)` now averages received purchase lines
   (qty × paid) together with `opening` movements entered by a person (qty × unit_cost).
   - The Module A backfill's "Ledger start" rows are excluded by `created_by IS NULL`, not only by a null
     `unit_cost`. Many of those rows carry a cost copied from the product's purchases, so counting them would
     double-count those purchases.
   - Opening rows with a null cost, or with a non-positive delta, are ignored too.
   - Products merged into a product count as the same product (see 7).
2. **The CSV is parsed in the backend.** The endpoint is `POST /setup/import-products/ {csv, commit}`, with the
   CSV sent as JSON text because the frontend proxy only relays JSON.
   - The frontend reads the file with FileReader and stays thin.
   - The template is available as CSV (`GET …/template/`) or as JSON (`?as=json`) for the proxy.
   - The page and endpoints are admin only (strict `IsAdmin`). The page is `/setup/import`, under a new admin-only
     Setup nav entry.
3. **Columns** follow the handoff:
   `category_code, name, brand, model, barcode, retail_price, cost_price, opening_qty, reorder_level, vat, warranty_months, unit`.
   - Required: category_code, name, retail_price (> 0) and cost_price (≥ 0).
   - Defaults: qty 0, reorder 5, VAT B, warranty 0, unit pcs.
   - A BOM, blank lines, extra columns and thousands commas in numbers are tolerated.
   - At most 2,000 rows and 2 MB.
4. **Matching existing products.** A row whose barcode equals an existing barcode or alias, or whose normalised
   name equals an existing product's, is **skipped** and flagged with the match. It is never an error.
   - A barcode or name repeated *within the file* is an error.
   - A commit with any error row imports nothing (400 with the row list). Skipped rows don't block it.
5. **Commit** re-checks inside one transaction with the category rows locked, then creates:
   - missing categories (name = code, or "`code` (imported)" if that name is taken),
   - products,
   - a current price (wholesale = cost_price, effective today),
   - inventory,
   - one `opening` movement per row with qty > 0, at `unit_cost = cost_price`, source `("product_import", product_id)`.
   Rows that bring their own barcode are created first, so a generated `PES-<code>-NNNNN` can't take a number a
   later row asked for.
6. **Set opening stock** (`GET/POST /products/<id>/opening-stock/`, admin) is allowed only when the product has no
   received purchase line and no movement other than the system "Ledger start" rows.
   - The quantity is the **opening count**. Only the difference over the current in-stock balance is added
     (positive only; lowering is a count correction).
   - It can be used once: after it, the product has a real movement.
7. **Merge is adapted to the append-only ledger.**
   - The duplicate's StockMovement and InventoryAdjustment rows stay on it as history.
   - Moved to the kept product: SaleItems, PurchaseItems, EquipmentUnits, price history (as non-current rows) and
     the duplicate's barcode aliases.
   - The duplicate's barcode becomes a `ProductBarcodeAlias` of the kept product.
   - Every non-empty bucket transfers with paired `merge_out` (duplicate) / `merge_in` (keep) movements at the
     duplicate's own average cost (taken before its purchase lines move), source `("product_merge", merge_id)`.
   - The duplicate is deactivated and renamed `[merged into <name>]`.
   - A `ProductMerge` row records keep, duplicate (one-to-one, so a product merges once), user, reason, the counts
     moved, and created_at.
   - `merged_product_ids()` follows merge chains. It feeds `weighted_average_cost` and the movements endpoint
     (`?product=` includes merged products). The product Movements card names the product on such rows.
8. **Extensibility.** `catalog.merge.MERGE_STEPS` is a list of `(name, fn(keep, duplicate, context) -> count)`.
   Module D (shop assets) should **append a step** that reassigns `ShopAsset.product` (keeping "stock" last, or
   inserting before it). It must not edit `merge_products`. Each step's count is logged under its name.
9. **Refusals:** the same product, a duplicate already merged, keeping a product that was itself merged away, and
   an empty reason. The merge is all or nothing.
10. **Find duplicates** (`GET /products/duplicates/`, admin) lists pairs of *active* products whose `search_text`
    trigram similarity is ≥ 0.6. It uses a self-join with pg_trgm's `%` operator, capped at 100 pairs, best
    first.
11. **POS barcode lookup** loads `GET /product-barcode-aliases/` (read-only, any signed-in role) and maps each
    alias to its active product. A product's own barcode wins over an alias of the same text. If aliases fail to
    load, the till still works without them. Product search (E1) already ranks aliases as barcode matches.
12. All merge and import UI is strict admin (`role === "admin"`), matching the backend. Managers don't see Find
    duplicates, Setup or Set opening stock.

## Endpoints

- `POST /api/setup/import-products/`, body `{csv: string, commit: bool}`.
  - Dry run: 200 `{dry_run: true, summary: {rows, valid, errors, skipped, new_categories[]}, rows: [{line, status: valid|error|skip, name, category_code, barcode, opening_qty, errors{field: msg}, match{product_id,name}|null}]}`.
  - Commit: 201, with the same shape plus `summary.created` and `rows[].product_id`. With error rows it returns 400 `{detail, code: "row_errors", ...the dry-run result}`.
  - A file-level problem returns 400 `{detail}`.
- `GET /api/setup/import-products/template/` returns the CSV. With `?as=json` it returns `{filename, columns[], csv}`.
- `GET /api/products/<id>/opening-stock/` returns `{eligible, reason, in_stock}`. `POST {quantity, unit_cost, reason?}` returns 201 `{movement_id, in_stock, eligible, reason}`.
- `GET /api/products/duplicates/` returns `{results: [{a: summary, b: summary, score}]}`, where summary is `{product_id, name, barcode, category_name, is_active, in_stock}`.
- `GET /api/products/<keep>/merge/?duplicate=<id>` returns `{keep, duplicate, counts: {sale_items, purchase_items, equipment_units, price_rows, barcode_aliases, in_stock, in_use, damaged}}`.
- `POST /api/products/<keep>/merge/` with `{duplicate, reason}` returns 201 `{merge_id, keep, duplicate, counts}`.
- `GET /api/product-barcode-aliases/` returns a paginated `{alias_id, barcode, product, created_at}`.
- `GET /api/stock/movements/?product=<id>` now includes the movements of products merged into `<id>`.

## Migrations

- `catalog/0007_productmerge.py` creates ProductMerge. This number may clash with a parallel catalog migration and
  may need renumbering at merge.
