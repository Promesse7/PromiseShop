# Release Module E (part 1): E1 product search and E2 purchase line entry

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, Module E sections E1 and E2. Base: Phase 0
(`592144e`). E3 (opening-stock import) and E4 (merge duplicates) wait for the Module A ledger.

## Decisions

1. **Two maintained columns on Product.**
   - `normalized_name` (lowercase, collapsed whitespace) answers "exactly the same name?".
   - `search_text` (name + brand + model, normalised) carries the GIN `gin_trgm_ops` index.
   - Both are set in `Product.save()`, which also covers `update_fields` saves.
   - A data migration backfills them, and it is safe to re-run.
   - Writes that bypass `save()` (`QuerySet.update`, `bulk_create`) would skip them; nothing in the codebase does that to name, brand or model.
2. **Ranking is one SQL query.** A `Case` tier is ordered by tier, then score descending, then name.
   - Tier 1: barcode or alias, case-insensitive exact.
   - Tier 2: exact normalised name.
   - Tier 3: `search_text` or the name starts with the query.
   - Tier 4: `GREATEST(similarity, word_similarity) >= 0.3`, or the query appears inside `search_text`.
   - Word similarity was added so a short query like "flip" still finds "JBL Flip 6" in a long name. "Contains" sits in tier 4 for the same reason.
   - Tiers 1–2 report score 1.0.
3. **The response field is `model_number`**, not "model", to match the existing Product API and frontend types.
   - `in_stock` and `retail_price` are `null` for a product never received or never priced.
   - `last_paid_cost` is admin/manager only. It is the latest *received* purchase line; drafts don't count.
4. **`ProductBarcodeAlias`** (barcode unique → product, CASCADE) was added now so search matches aliases. E4 will populate it.
5. **Bulk rows are explicit:** `{"product": id, ...}` or `{"new_product": {...}, ...}`. Neither, or both, is a 400 for that row.
   - The paid/invoiced discrepancy note is checked at validation time.
   - The service adds each row through the existing `add_existing_product_item` / `add_new_product_item` (so the same-name dedupe is kept), each inside a savepoint, and collects every row's error.
   - Any error rolls the whole batch back, including products created by earlier rows. The response is 400 with `row_errors` keyed by row index (as strings).
   - At most 500 rows per request.
6. **Same-name dedupe now matches `normalized_name`.** It previously used `name__iexact`, so it now also ignores internal whitespace differences.
7. **`PATCH /purchases/<id>/items/<item_id>/`** shares the route with DELETE. `item_id` is now `[0-9]+` so `items/bulk/` can't collide. It validates the discrepancy note against the final values and re-totals.
8. **Recent products** exclude cancelled purchases but include drafts (what is being typed now). They return distinct products, newest purchase first, capped at 20. Costs are admin/manager only.
9. **Frontend:**
   - The bulk table is rebuilt around `ProductCombobox`. Single mode stays as it was, with its catalog-wide search.
   - The bulk save response carries `product_name`, `product_barcode` and `product_retail_price`, so the labels for new products print right after saving: one label per unit on rows created as new products.
   - Paste-from-Excel rows that don't auto-match land in the table unchosen, with an error, so they can't be saved until a product is picked or created.
   - Scanning a product already on the purchase offers "Add 1 (→ n)" (PATCH) instead of a second line, and Enter on the scan box takes the match.
10. Tests run against the local docker Postgres (`pg_trgm` from contrib), never Neon.

## Endpoints

- `GET /api/products/search/?q=&limit=8&include_inactive=true`. The limit defaults to 8 and is clamped to 1–50; a non-integer is a 400. Response: `{results: [{product_id, name, brand, model_number, barcode, category, category_name, is_active, in_stock, retail_price, match, score, last_paid_cost?}]}`.
- `POST /api/purchases/<id>/items/bulk/`, body `{items: [row…]}`. Success returns 201 `{items: [PurchaseItem + product_name, product_barcode, product_retail_price]}`; a refusal returns 400 `{detail, code: "row_errors", row_errors: {"<index>": errors}}`.
- `PATCH /api/purchases/<id>/items/<item_id>/` with `{quantity?, unit_cost_paid?, unit_cost_invoiced?, price_discrepancy_note?}` returns 200 with the PurchaseItem (staff don't get costs).
- `GET /api/suppliers/<id>/recent-products/` returns `{results: [{product_id, name, brand, model_number, barcode, last_purchase_date, last_quantity, last_unit_cost_paid?, last_unit_cost_invoiced?}]}`.
