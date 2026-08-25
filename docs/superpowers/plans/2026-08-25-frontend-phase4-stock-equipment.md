# Frontend Phase 4: Stock & Equipment Implementation Plan

See the design doc: `docs/superpowers/specs/2026-08-25-frontend-phase4-stock-equipment-design.md`.

## Global Constraints

- Every hook/component gets a Vitest + RTL test written first, run to confirm it fails for the
  right reason, then the minimal implementation to pass it, matching Phase 3 Catalog's TDD
  discipline.
- Only additive edits to `lib/types.ts` (new interfaces appended at the end) — no reordering or
  editing of existing types, since parallel sibling phases touch the same file.
- No edits to `Nav.tsx`, `backend/`, or any Catalog/POS file — see the design doc's boundaries.
- All API calls go through `apiFetch`/`fetchAllPages` from `lib/api-client.ts`, never direct fetch
  to Django.

## Task 1: `useStockOverview` hook

- [x] Write `lib/stock/useStockOverview.test.tsx`: joins `Inventory` + `Product` + `EquipmentUnit`
      counts into `StockOverviewRow[]`; asserts the three `flag` derivations (ok/low_stock/
      out_of_stock, same rule as Catalog); asserts `unit_count` is 0 for a product with no units
      and >0 for one with units; asserts products with no `Inventory` row are excluded (Decision 4).
- [x] Run, confirm it fails (module doesn't exist).
- [x] Implement `lib/stock/useStockOverview.ts` using `["inventory"]`, `["products"]`, and a new
      `["equipment-units"]` query key (all three via `fetchAllPages`).
- [x] Run, confirm it passes.
- [x] Commit.

## Task 2: `useEquipmentUnits` / `useEquipmentUnitDetail` hooks

- [x] Write tests: `useEquipmentUnits(productId)` calls `equipment-units/?product=<id>` and is
      disabled when `productId` is null; `useEquipmentUnitDetail(unitId)` calls
      `equipment-units/<id>/` and exposes `status_history` newest-first as returned by the API
      (no client-side re-sort needed — the backend already orders it).
- [x] Run, confirm fail.
- [x] Implement `lib/stock/useEquipmentUnits.ts`, `lib/stock/useEquipmentUnitDetail.ts`.
- [x] Run, confirm pass.
- [x] Commit.

## Task 3: `useRegisterUnit` / `useChangeEquipmentStatus` mutation hooks

- [x] Write tests: `useRegisterUnit` issues `POST /equipment-units/` then, on success,
      `POST /equipment-units/<new_id>/change-status/` with `new_status: "in_stock"`,
      `reason: "Unit registered"` (Decision 1) — assert both calls happen in order with the right
      bodies, and that `["equipment-units"]`-prefixed queries are invalidated after. Same
      invalidation assertion for `useChangeEquipmentStatus`.
- [x] Run, confirm fail.
- [x] Implement both hooks in `lib/stock/useRegisterUnit.ts` and
      `lib/stock/useChangeEquipmentStatus.ts` (TanStack `useMutation`, `useQueryClient` for
      `invalidateQueries({ queryKey: ["equipment-units"] })` — a prefix match invalidates every
      equipment-units query, list and detail alike).
- [x] Run, confirm pass.
- [x] Commit.

## Task 4: `StockOverviewTable` component

- [x] Write `components/stock/StockOverviewTable.test.tsx`: renders rows, flag tag variants,
      "aggregate only" text for `unit_count === 0`, a clickable "`N` units" link/button calling
      `onSelectProduct` for `unit_count > 0`.
- [x] Run, confirm fail.
- [x] Implement `components/stock/StockOverviewTable.tsx` (uses shared `Table`/`Tag`).
- [x] Run, confirm pass.
- [x] Commit.

## Task 5: `SerializedUnitsTable` + `RegisterUnitDialog`

- [x] Write tests: `SerializedUnitsTable` renders unit rows with status tag + "History" link to
      `/stock/units/<id>`; empty state when no units. `RegisterUnitDialog` submit calls
      `useRegisterUnit`'s mutate with `{ product, serial_number, storage_location,
      condition_notes }`, validates `serial_number` required client-side.
- [x] Run, confirm fail.
- [x] Implement both components.
- [x] Run, confirm pass.
- [x] Commit.

## Task 6: `ChangeStatusDialog` + `StatusHistoryTimeline`

- [x] Write tests: `ChangeStatusDialog` renders a status selector excluding no statuses (full set,
      per Decision — used generically), requires `reason`, calls
      `useChangeEquipmentStatus().mutate({ unitId, new_status, reason })` on submit.
      `StatusHistoryTimeline` renders entries in the order given, each showing
      `previous → new`, formatted date, `Employee #<id>` (Decision 2), and notes.
- [x] Run, confirm fail.
- [x] Implement both components.
- [x] Run, confirm pass.
- [x] Commit.

## Task 7: Stock overview page (`1g`)

- [x] Wire `app/(protected)/stock/page.tsx` (server) + `StockPageClient.tsx` (client): segmented
      All/Low-or-out/Serialized-only filter, `StockOverviewTable`, selected-product state driving
      `SerializedUnitsTable` + `RegisterUnitDialog`, loading/error guards, link to `/stock/scan`.
- [x] Add an RTL test for `StockPageClient`'s filter behavior and product-selection wiring.
- [x] Run, confirm pass. Commit.

## Task 8: Unit detail page (`1h`)

- [x] Wire `app/(protected)/stock/units/[id]/page.tsx` + `UnitDetailPageClient.tsx`: header (serial
      + status tag + back link), `StatusHistoryTimeline`, "Change status" action opening
      `ChangeStatusDialog`, loading/error guards.
- [x] Add an RTL test for the page client's dialog-open/close and post-change refresh.
- [x] Run, confirm pass. Commit.

## Task 9: Tablet quick status change page (`1p`)

- [x] Write `components/stock/QuickStatusChangeCard.test.tsx`: given a unit, renders every status
      except the current one as a button; clicking one + entering a reason + Save calls
      `useChangeEquipmentStatus`.
- [x] Run, confirm fail.
- [x] Implement `QuickStatusChangeCard.tsx`, then wire `app/(protected)/stock/scan/page.tsx` +
      `ScanPageClient.tsx` (44px+ scan input, client-side substring match over all units, renders
      the card for the first match, clears on save).
- [x] Run, confirm pass. Commit.

## Task 10: e2e smoke test

- [x] Write `e2e/stock.spec.ts`: admin logs in, opens `/stock`, opens a product's serialized
      units, opens a unit's history at `/stock/units/<id>`, changes its status, sees the new
      history row. Doc-comment any required fixture data. **Do not run** — Playwright is deferred
      to post-merge verification (see design doc / dispatch prompt: four parallel worktrees share
      port 3000 and the dev DB).
- [x] Commit.

## Final pass

- [x] `npm run lint` clean.
- [x] `npm test` full run green.
- [x] Report worktree branch, files changed, decisions, gaps.
