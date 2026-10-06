# Release Module D — Internal use and shop assets

Spec: `docs/superpowers/specs/2026-10-06-release-dev-handoff.md`, Module D. Base: `release/2026-10` @ 8de683f
(Phase 0, A, B, C, E, F). Branch: `release/module-d`.

## Decisions

1. **New app `operations`** holds `InternalConsumption`, `ShopAsset`, `ShopAssetEvent`. Consumption rows are
   append-only (like `StockMovement` / `Payment`): mistakes are fixed by putting stock back with an adjustment,
   not by editing the record.
2. **Value = weighted average paid cost at that moment** (`stock.services.weighted_average_cost`, read before
   the movement). Unknown cost → `unit_cost` and `total_value` are null and the UI says "cost unknown".
   An asset taken from stock gets `acquisition_value` = that unit cost; a pre-owned asset takes an optional
   typed value.
3. **Not an expense, not COGS.** Nothing in `finance` or the dashboard reads these tables; tests pin that
   the financial snapshot's expenses and profitability COGS/revenue are unchanged by a consumption.
4. **Ledger:** consumption writes `internal_consumption` (in_stock −qty); take-from-stock writes
   `to_shop_asset` (in_stock −1); returning an asset writes a new movement type **`from_shop_asset`** (+1 into
   `in_stock` or `damaged`). All carry `source = ("consumption"|"shop_asset", id)`.
5. **Serialised units:** a unit taken as an asset moves to the new EquipmentUnit status **`shop_asset`** via
   `change_equipment_status` (so its own history has the step); returning moves it to `in_stock`/`damaged`.
   Bulk counts and units stay the separate systems they already are: the bulk `in_stock` count still drops by 1.
6. **Asset statuses:** `in_service`, `damaged`, `under_repair`, `retired`, plus **`returned_to_stock`**
   (deviation: an asset sold back into stock is no longer a shop asset, and "retired" would hide that the unit
   went back on the shelf). A returned or retired asset can't change status again.
7. **Spares:** `ShopAsset.is_spare` marks an in-service, unassigned asset kept as a spare. `replace_asset` can
   bring a spare into service instead of taking from stock.
8. **Replace links:** the broken asset's event has `replaced_by` = the new asset; the new asset stores
   `replaces` = the broken one, and its first event says so. One transaction — a failure taking the
   replacement (e.g. no stock) leaves the broken asset untouched.
9. **Approval:** admin/manager act directly. Sales staff and technicians may consume, take from stock and
   replace only with `approval: {approver_username, pin}` (`accounts.services.verify_approval`, shared PIN
   lockout); without it the API answers 400 `code: "approval_required"` (same code the till uses). The approver
   is stored in `approved_by`. Registering pre-owned assets and changing status are admin/manager; a technician
   may move an asset between `under_repair` and `in_service` with approval. Return-to-stock is admin only.
10. **Costs hidden from staff:** `unit_cost`, `total_value`, `acquisition_value` stripped for sales staff and
    technicians.
11. **Merge:** `operations` appends a `shop_use` step to `catalog.merge.MERGE_STEPS` (before `stock`) moving
    `ShopAsset.product` and `InternalConsumption.product` to the kept product. Product delete is refused when the
    product has consumptions or assets.
12. **Reports** (`operations/reports.py`) take Kigali dates and aggregate in SQL; Module H calls them.

## Tasks (TDD)

| # | Test first | Change |
|---|---|---|
| 1 | consume refused above stock; values at avg cost; ledger clean; staff without PIN refused | models, `consume_stock` |
| 2 | register / take-from-stock (bulk + serialised) / status / return; ledger clean | asset services |
| 3 | replace atomic (forced failure step two), spare path, links | `replace_asset` |
| 4 | API permissions, cost stripping, serial lookup, filters | serializers, views, urls |
| 5 | not in expenses / COGS; merge step moves rows; delete refused | merge step, delete guard |
| 6 | reports | `reports.py` |
| 7 | Vitest per hook/component | Shop use page, asset page + replace wizard, product "Use in shop", scan → asset |
