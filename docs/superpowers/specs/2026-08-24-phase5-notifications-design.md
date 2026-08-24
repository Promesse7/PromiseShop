# Phase 5a: Notifications — Design

## Context

Phases 1-4 (backend foundation, purchasing, sales, stock/equipment) are complete and merged,
152 tests passing. `NotificationLog` has existed as a schema-only model since Phase 1, and
Phase 3's `sales/services.py` already writes rows to it (`_notify_admins`, fanning out one row
per Admin employee on `sale_alert`/`sale_reversed`) — but there is no API for an employee to
read their own notifications. This phase builds that read/mark-as-read API. It runs as an
independent track alongside Phase 5b (Finance/Expense) — the two share no files, models, or
apps, and are implemented in parallel.

## Decisions made (with the user)

1. **`NotificationLog` gets one schema addition: `read_at`.** A nullable
   `DateTimeField(null=True, blank=True)`, defaulting to unset. This is the smallest change that
   supports read/unread state without introducing a separate join table — `recipient` is already
   a single FK per row (not many-to-many), so a direct field is the natural fit, not a join table
   modeling a relationship that doesn't exist here.
2. **Notifications are a personal inbox, scoped by `recipient`, not by role.** `GET
   /api/notifications/` always filters to `recipient=request.user` — no employee, including
   Admins, can read another employee's notifications through this endpoint. RBAC is
   `IsAuthenticated` only; the recipient filter is what actually restricts access, not a role
   check. This matches the project's default staff-activity RBAC posture (Phases 1-4), and
   notifications are inherently personal regardless of who currently happens to receive them.
3. **No new notification-producing triggers in this phase.** Only `sales/services.py`'s existing
   `_notify_admins` writes `NotificationLog` rows today. Wiring new triggers (e.g. low-stock
   alerts from Phase 4's `Inventory.is_low_stock`) touches other apps' `services.py` files and is
   explicitly deferred to a later phase — this phase is scoped to exposing/managing whatever
   notifications already exist, not creating new ones.
4. **Notifications are never client-created.** No `POST /api/notifications/` to create an
   arbitrary notification — they are always server-created by a domain service (as
   `sales/services.py` already does). The only client-initiated write is marking one's own
   notification read, via a dedicated action — same precedent as Phase 4's `change-status`
   action being the only way to mutate `EquipmentUnit.status`.
5. **`NotificationLog` stays otherwise immutable.** No `PUT`/`DELETE` on `/api/notifications/`.
   The only mutable field (`read_at`) changes only through the dedicated `mark-read` action, never
   generic `PATCH`.

## API design

All endpoints under `/api/notifications/`, `IsAuthenticated` only.

- `GET /api/notifications/` — list, filtered to `recipient=request.user`. Filterable
  `?unread=true` (`read_at__isnull=True`). Ordered newest-first (`-sent_at`).
- `GET /api/notifications/{id}/` — retrieve. Returns 404 (not 403) if the notification belongs
  to a different employee — the endpoint doesn't reveal whether a given ID exists at all to a
  non-owner.
- `POST /api/notifications/{id}/mark-read/` — sets `read_at = now()` if currently unset; if
  already read, leaves `read_at` unchanged and still returns 200 (idempotent, not an error).
  Same 404-not-403 rule applies for a non-owner's notification.
- No `POST` on the collection, no `PUT`/`PATCH`/`DELETE` anywhere under `/api/notifications/`.
  `http_method_names` restricted to `["get", "post", "head", "options"]` at the ViewSet level —
  the only reachable `POST` is the `mark-read` action, since the collection itself has no
  `create()` exposed (mirrors Phase 3's `SaleViewSet` pattern: restrict method names, and only
  actions that explicitly declare `methods=["post"]` are reachable via POST).

## Data flow example

A sale completes → `sales/services.py`'s `_notify_admins` (unchanged, from Phase 3) creates one
`NotificationLog` row per Admin employee, `read_at` unset. An admin logs in, calls `GET
/api/notifications/?unread=true`, sees the new row. They open it and call `POST
/api/notifications/{id}/mark-read/` — `read_at` is stamped, and it no longer appears in the
`?unread=true` filter on their next fetch.

## Error handling

400 for validation (none expected in practice — `mark-read` takes no body), 401 from existing
auth middleware, 404 for an unknown notification ID or one belonging to another employee
(identical response either way, to avoid leaking existence).

## Testing

Service-level: none needed — no `services.py` in this phase; the mark-read logic is simple
enough to test directly at the API/serializer level without a separate business-logic layer.
API-level: list only returns the authenticated employee's own notifications (not another
employee's, even when both have rows); `?unread=true` filters correctly; retrieving another
employee's notification returns 404; `mark-read` sets `read_at` and is idempotent on a second
call (no error, `read_at` doesn't change to a later timestamp); marking another employee's
notification read returns 404 and does not mutate it; `POST /api/notifications/` (collection,
not the action) returns 405; `PATCH`/`PUT`/`DELETE` on `/api/notifications/{id}/` return 405.

## Out of scope for this phase

- New notification-producing triggers (low-stock, equipment status changes, purchasing events) —
  Decision 3.
- Bulk "mark all as read" — not requested; can be added later as another dedicated action if
  needed without any schema change.
- Admin dashboard (Phase 6) and Finance/Expense API (Phase 5b, parallel track, separate spec).
- Any Next.js frontend work.
