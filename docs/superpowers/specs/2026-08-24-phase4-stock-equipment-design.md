# Phase 4: Stock & Equipment Tracking — Design

## Context

Phases 1-3 (backend foundation; purchasing; sales/POS) are complete and merged, 126 tests
passing. `Inventory`, `EquipmentUnit`, and `EquipmentStatusHistory` exist as schema-only models
from Phase 1 (Task 12) with no API. Phase 2's design explicitly deferred `Inventory.
storage_location` editing to this phase (mockup 2c's product-review drawer). This phase builds
the stock/equipment API: reading and lightly editing aggregate stock (`Inventory`), and full
CRUD plus an audited status-change workflow for individually serialized equipment
(`EquipmentUnit`/`EquipmentStatusHistory`) — mockups 1g (stock & equipment list), 1h (equipment
unit history + change-status dialog), 1p (tablet quick status change). Backend only — no
Next.js frontend, matching the established pattern.

## Decisions made (with the user)

1. **`Inventory` and `EquipmentUnit` are intentionally independent systems.** `Inventory`'s
   aggregate counts (`quantity_in_stock`/`in_use`/`damaged`) remain purely derived from
   purchasing (increment, Phase 2) and sales (decrement, Phase 3) — no automatic sync with
   `EquipmentUnit` status changes. This matches the docx's own framing ("fast aggregate counts
   for reporting... equipment_units only needed where individual unit tracking matters — not
   every product needs a row per unit") and avoids two unresolved ambiguities: how `UNDER_REPAIR`
   would map onto Inventory's three-bucket model, and wiring a specific serial number into the
   sales flow (which currently tracks product+quantity only, not individual units).
2. **`Inventory.storage_location` is the only directly-editable `Inventory` field.** Quantities
   stay read-only via the API, always derived from purchase/sale transactions — preserving the
   guarantee that every stock-count change traces back to a transaction. Matches Phase 2's
   original deferral scope exactly.
3. **`EquipmentUnit.status` is only ever changed via one dedicated, audited action** — never a
   generic `PATCH`. `serial_number` is immutable once set (same principle as `Product.barcode`).
   `storage_location`, `condition_notes`, and `assigned_to` remain regular `PATCH`-able fields,
   since reassigning or relocating a unit doesn't inherently require an audit trail the way a
   status transition does.
4. **A status change always requires a reason** (mapped to `EquipmentStatusHistory.notes`),
   matching the mockups' required-reason field on both the desktop dialog (1h) and the tablet
   quick-change flow (1p).
5. **RBAC**: `IsAuthenticated` only, no admin gate, matching every prior phase — equipment
   handling is a staff activity.
6. **History nests from the start.** `EquipmentUnit`'s detail response includes its
   `status_history` nested and read-only — no separate history endpoint, applying the lesson
   every prior phase's final review had to catch after the fact (Phase 2's purchase items,
   Phase 3's sale items).

## API design

### Inventory

- `GET /api/inventory/` — list, each row including a computed, read-only `is_low_stock` field
  (`quantity_in_stock <= product.reorder_level`). Filterable by `?low_stock=true` (matching
  mockup 1g's "Low-out" filter) — `?serialized=true` is a stretch goal for this phase, see Out
  of scope.
- `GET /api/inventory/{id}/` — retrieve.
- `PATCH /api/inventory/{id}/` — `storage_location` only; any other field in the payload is
  ignored (mirrors how `Product.barcode`/`Purchase.total_paid` etc. are `read_only_fields`
  elsewhere, not validated-and-rejected — a client can send extra keys, they're just not
  applied).
- No `POST`/`DELETE` — `Inventory` rows are created implicitly by purchasing (Phase 2's
  `receive_purchase` already does `get_or_create`), never directly via this API.

### EquipmentUnit

- `POST /api/equipment-units/` — register a new unit: `product`, `serial_number`, `status`
  (initial — typically `in_stock`), `storage_location`, `condition_notes` (optional). No
  `EquipmentStatusHistory` row is written for the initial registration (there's no "previous
  status" to record) — history starts recording from the first actual status change.
- `GET /api/equipment-units/`, `GET /api/equipment-units/{id}/` — list (filterable by
  `?product=<id>`, matching mockup 1g's per-product unit list) and retrieve, with `status_history`
  nested (ordered newest-first, matching the mockup's timeline) in the retrieve response.
- `PATCH /api/equipment-units/{id}/` — `storage_location`, `condition_notes`, `assigned_to`
  only; `status` and `serial_number` are read-only on this endpoint.
- `POST /api/equipment-units/{id}/change-status/` — body: `new_status`, `reason` (required),
  `assigned_to` (optional). Atomically: captures `previous_status` from the unit's current
  state, creates an `EquipmentStatusHistory` row (`previous_status`, `new_status`, `changed_by`
  = `request.user`, `notes` = `reason`), updates the unit's `status`, `status_changed_at`, and
  `assigned_to` if given. Rejects (400) an unrecognized `new_status` or a missing `reason`.

## Data flow example

A technician registers a new serialized product (`POST /api/equipment-units/`, status
`in_stock`) → later marks it `under_repair` (`POST .../change-status/` with a reason) → the
change writes an audit row and updates the unit in one transaction → `GET
/api/equipment-units/{id}/` shows the current status plus the full history timeline, including
this transition. Throughout, the product's `Inventory.quantity_in_stock` is untouched — it only
moves via purchase/sale transactions, per Decision 1.

## Error handling

400 for validation (missing/invalid `new_status`, missing `reason`, attempting to `PATCH`
`status`/`serial_number` directly), 401/403 from existing auth middleware, 404 for unknown
inventory/unit IDs.

## Testing

Service-level: a status change writes a correctly-populated `EquipmentStatusHistory` row
(previous/new status, actor, reason) and updates the unit atomically; an invalid `new_status` is
rejected before any write; a missing `reason` is rejected; `Inventory` is never touched by any
equipment-unit operation (an explicit assertion, given Decision 1 is easy to accidentally
violate later). API-level: register a unit; change its status via the API and confirm the
retrieve response's nested `status_history` includes the new entry; `is_low_stock` computes
correctly against `reorder_level`; `PATCH` on `storage_location` succeeds while a `PATCH`
attempting to set `status` directly is silently ignored (matches the read-only-field pattern);
`change-status` on a product with no existing `Inventory` row still works (independence from
Decision 1 holds even when there's nothing to *not* touch).

## Out of scope for this phase

- Any automatic sync between `EquipmentUnit` status and `Inventory` aggregate counts
  (Decision 1).
- Manual `Inventory` quantity adjustment / stock-take correction workflow (Decision 2).
- Wiring a specific serial number into the sales flow (`SaleItem` still references `product`
  only, not an individual `EquipmentUnit`).
- The `?serialized=true` Inventory filter (distinguishing products that have any `EquipmentUnit`
  rows from those tracked purely by aggregate) — a nice-to-have from mockup 1g's filter, added
  only if it falls out naturally during implementation; not a hard requirement.
- Admin dashboard, notifications' own direct API — Phase 5.
- Any Next.js frontend work.
