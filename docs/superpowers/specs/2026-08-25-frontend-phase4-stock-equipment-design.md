# Frontend Phase 4: Stock & Equipment — Design

## Context

Frontend Phases 1-3 (Foundation, Sales/Checkout, Catalog) are complete and merged to `main`.
`/products` and `/checkout` are real screens; `Nav.tsx` already links to `/stock` for both staff
and admin roles, but the route 404s. This phase builds the Stock & Equipment screens: the
aggregate + serialized-unit stock overview (mockup `1g`), the per-unit audit-trail history with a
status-change dialog (mockup `1h`), and a tablet-optimized quick equipment-status-change screen
(mockup `1p`). This phase is being built in parallel with three sibling frontend phases
(Suppliers/Customers/Employees, Notifications, Dashboard) in isolated git worktrees — it touches
only `/stock*` routes, `components/stock/`, and `lib/stock/`, plus additive-only edits to
`lib/types.ts`. It does not touch `Nav.tsx` (the `/stock` link already exists for both roles).

The backend API for all of this already exists in full (`stock` app: `Inventory`,
`EquipmentUnit`, `EquipmentStatusHistory`) — no backend changes are needed for this phase.

## Decisions made

This phase was built autonomously (no live user available mid-build); ambiguities are resolved
the same way Phase 3 (Catalog) resolved its own — prefer real, verified backend behavior over the
mockup's literal assumptions, and document every deviation here.

1. **"+ Register unit" is a two-step API flow, not a single POST.** `EquipmentUnitSerializer` (the
   serializer `EquipmentUnitViewSet` uses for `create`) marks `status` as read-only, and this was
   confirmed live against the running dev backend: `POST /equipment-units/` with
   `{"status": "in_stock", ...}` returns a unit with `"status": ""` — the field is silently
   dropped. So registering a new unit is: `POST /equipment-units/` (serial_number, product,
   storage_location, condition_notes — no status), immediately followed by
   `POST /equipment-units/<id>/change-status/` with `new_status: "in_stock"`,
   `reason: "Unit registered"`. This also seeds the unit's first `EquipmentStatusHistory` row
   (`"" → in_stock`), which matches the mockup `1h` timeline's own bottom-most entry shape
   (`"— → in stock ... Received on purchase #P-0109"`).
2. **Employee names in the status-history timeline are not resolved — shown as `Employee #<id>`.**
   `EquipmentStatusHistorySerializer` returns `changed_by` as a raw employee id, not a name or
   nested object. Resolving it to a full name requires `GET /employees/`, which is `IsAdmin`-only
   (strictly `role === "admin"`, confirmed in `backend/accounts/permissions.py` — not manager, not
   any other role). Rather than couple this phase to the parallel Employees-directory phase's
   `lib/types.ts` `Employee` type, or fire a request that 403s for every non-admin viewer, this
   phase displays `Employee #<id>` for every role. Resolving real names is a natural follow-up once
   the Employees phase lands, not built speculatively here.
3. **Status tag color mapping compresses 5 statuses onto the shared `Tag` component's 3
   variants** (`accent`/`outline`/`neutral`) — there is no dedicated component for a 4th/5th color,
   and the existing codebase (Catalog's 3-way stock-status tag) already establishes that pattern.
   Mapping: `in_stock` → accent, `in_use` → outline, `under_repair` → outline, `damaged` → neutral,
   `sold` → neutral.
4. **The stock overview (`1g`) only lists products that already have an `Inventory` row.** Mirrors
   Catalog's Decision 8 precedent exactly: a product with no `Inventory` row has never been
   received, so there's nothing to show on a stock screen (it already reads "not yet received" on
   the product detail page). No new empty-state invented here — those products simply don't appear.
5. **The serialized-units table is scoped to one selected product at a time**, matching the
   mockup's own framing (`"Serialized units — JBL Flip 6 Speaker"`, a single product's units, not
   all units system-wide). The stock overview table's last column links `"N units"` for any product
   that has equipment units; clicking it selects that product and renders its serialized-units
   table (with "+ Register unit" scoped to that product) below. Products with no equipment units
   show `"aggregate only"` text, matching the mockup exactly. Before any product is selected, the
   section shows a prompt ("Select a product above to view its serialized units") rather than
   defaulting to an arbitrary product.
6. **Mockup `1p`'s tablet quick-status-change screen is its own route, `/stock/scan`,** reached via
   a link from the `/stock` overview page (not a Nav.tsx entry — Nav is out of scope for this
   phase, and the mockup itself doesn't show `1p` in a top nav either, since its whole framing is a
   tablet-optimized floor tool). It fetches the full equipment-unit list once (`fetchAllPages`,
   same "small dataset, fits in memory" reasoning Catalog's client-side search already
   established) and does client-side substring matching on `serial_number` as the user types into
   the scan/search field, since the backend has no `?search=` param on `equipment-units/` (only
   `?product=`). The "Move to" grid shows all statuses except the unit's current one (the mockup
   shows exactly this: the unit is `damaged`, and the 4 buttons shown are the other 4 statuses).
7. **`assigned_to` is not exposed as a form field anywhere in this phase.** Neither mockup `1h`'s
   nor `1p`'s status-change dialog show an "assigned to" input (only new status + reason), even
   though `ChangeStatusSerializer` accepts an optional `assigned_to`. Not building an unused field.
8. **`Inventory.storage_location` editing stays out of this phase's stock overview.** It's already
   owned by Catalog's `ProductFormDialog` (edits `Inventory` via `PATCH /inventory/:id/` when a
   product is being edited) — the stock overview displays it read-only to avoid two screens
   editing the same field through two different forms.

## Architecture

```
frontend/
  app/(protected)/stock/
    page.tsx                        — server: session → StockPageClient (mockup 1g)
    StockPageClient.tsx
    units/[id]/
      page.tsx                      — server: session → UnitDetailPageClient (mockup 1h)
      UnitDetailPageClient.tsx
    scan/
      page.tsx                      — server: session → ScanPageClient (mockup 1p)
      ScanPageClient.tsx
  components/stock/
    StockOverviewTable.tsx          — aggregate rows: product, in stock/in use/damaged, location,
                                       flag tag, unit-count link or "aggregate only"
    SerializedUnitsTable.tsx        — one product's EquipmentUnit rows + "+ Register unit"
    RegisterUnitDialog.tsx          — create unit (two-step flow, Decision 1)
    ChangeStatusDialog.tsx          — shared by 1h's page and reusable elsewhere; status + reason
    StatusHistoryTimeline.tsx       — renders EquipmentStatusHistoryEntry[] newest-first
    QuickStatusChangeCard.tsx       — mockup 1p's scan → status-grid → save card
  lib/stock/
    useStockOverview.ts             — Inventory ⋈ Product ⋈ (EquipmentUnit count), list-shaped
    useEquipmentUnits.ts            — units for one product (?product=<id>)
    useEquipmentUnitDetail.ts       — one unit + its embedded status_history
    useRegisterUnit.ts              — create + seed-status mutation (Decision 1)
    useChangeEquipmentStatus.ts     — POST change-status mutation, shared by 1h and 1p
```

Query keys: `["inventory"]` and `["products"]` are reused verbatim from Phase 3's
`useCatalogProducts`/`useProductDetail` (TanStack Query dedupes by key, not call site — navigating
between `/products` and `/stock` shares one cache). New keys this phase introduces:
`["equipment-units"]` (all units, used by `/stock/scan`), `["equipment-units", "list", productId]`
(one product's units), `["equipment-units", unitId]` (one unit + history).

## Stock overview (`1g`)

`app/(protected)/stock/page.tsx` reads `getSession()` and renders `StockPageClient`, which calls
`useStockOverview()`:

```typescript
interface StockOverviewRow {
  product_id: number;
  name: string;
  quantity_in_stock: number;
  quantity_in_use: number;
  quantity_damaged: number;
  storage_location: string | null;
  flag: "ok" | "low_stock" | "out_of_stock";
  unit_count: number;
}
```

`flag` reuses the exact same derivation Catalog's `deriveStatus` uses (`0` → out_of_stock, `<=
reorder_level` → low_stock, else ok) — same rule, same three-way tag styling, applied to
`Inventory` rows joined against `Product.reorder_level` instead of `CatalogProduct`.

A `SegmentedToggle` above the table (`All` / `Low or out` / `Serialized only`) filters the rows
client-side, matching the mockup's own three options — `Low or out` keeps `low_stock`/`out_of_stock`
rows, `Serialized only` keeps rows with `unit_count > 0`.

Below the table, the serialized-units section (Decision 5) shows the selected product's units via
`useEquipmentUnits(selectedProductId)`, with a "+ Register unit" button opening
`RegisterUnitDialog`. Each unit row's "History" link goes to `/stock/units/<unit_id>`.

A small link near the page header ("Quick status change →") goes to `/stock/scan`.

## Equipment unit history (`1h`)

`app/(protected)/stock/units/[id]/page.tsx` → `UnitDetailPageClient` calls
`useEquipmentUnitDetail(unitId)`, which is `GET /equipment-units/<id>/` — the detail serializer
already embeds `status_history`, so no separate fetch. Layout: unit serial + current status tag +
back link to `/stock`; `StatusHistoryTimeline` (newest-first, matching the mockup's own ordering);
`ChangeStatusDialog` (open via a "Change status" action) posts to
`useChangeEquipmentStatus()` → `POST /equipment-units/<id>/change-status/`, invalidates
`["equipment-units", unitId]` and `["equipment-units", "list", product]` and the all-units key on
success, then closes.

## Tablet quick status change (`1p`)

`/stock/scan` → `ScanPageClient`: a `min-h-11` (44px+) scan/search input, client-side substring
match over `useQuery(["equipment-units"], () => fetchAllPages<EquipmentUnit>("equipment-units/"))`
against `serial_number`. The first match renders `QuickStatusChangeCard`: serial + current status
tag, a 2-column grid of large buttons for every status except the current one, a required reason
input, and "Save — writes audit row" which calls the same `useChangeEquipmentStatus()` mutation as
`1h`, then clears the search field for the next scan (matching the mockup's floor-tool framing —
one unit at a time, in and out quickly).

## Error handling

Reuses the established pattern (Phase 2/3), no new mechanism:
- `400` (e.g. missing `reason` on change-status) → field-level message on the dialog/card form.
- `403`/`404`/`5xx`/network failure → toast via `useToast()`, dialog/card stays open with input
  intact.
- Each page's data fetching uses the same `isLoading`/`isError` two-branch guard Phase 3 used.

## Testing

**Vitest + RTL:** `useStockOverview`'s join/flag-derivation logic (mirroring
`useCatalogProducts.test.tsx`'s structure), `useEquipmentUnits`/`useEquipmentUnitDetail`,
`useRegisterUnit`'s two-step create-then-change-status sequencing, `useChangeEquipmentStatus`;
`StockOverviewTable` render + segmented filter behavior; `SerializedUnitsTable` render +
"aggregate only" vs "N units" cell logic; `RegisterUnitDialog` and `ChangeStatusDialog` submit
payloads; `StatusHistoryTimeline` ordering/rendering; `QuickStatusChangeCard`'s status-grid
excluding the current status and its save flow.

**Playwright e2e:** one smoke test in `e2e/stock.spec.ts` extending the established pattern — log
in as admin, open `/stock`, open a product's serialized units, open a unit's history, change its
status via the dialog, see the new history row.

## Out of scope for this phase

- `Inventory.storage_location` editing (owned by Catalog's `ProductFormDialog`, Decision 8).
- Resolving `changed_by` to an employee name (Decision 2) — a follow-up once the Employees
  directory phase lands.
- `assigned_to` as a UI field anywhere (Decision 7).
- A Nav.tsx entry for `/stock/scan` (Decision 6) — reachable via an in-page link only.
- Deleting equipment units — the backend doesn't expose `DELETE` on `EquipmentUnitViewSet`
  (`http_method_names = ["get", "post", "patch", "head", "options"]`).
- Real i18n, motion-spec animations — same standing deferral as every prior phase.
