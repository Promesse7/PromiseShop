# Frontend Phase 6: Notifications — Design

## Context

Frontend Phase 1's foundation and Phase 3's Catalog are in place and already exercised by real code.
This phase builds the notification log screen (mockup `1l`): the admin-facing inbox of every
sale-completion and low-stock alert the backend has recorded, with delivery status ("delivered"/
"failed") and a manual "Failed" filter. The backend API for this already exists in full
(`notifications` app) — no backend changes are needed for this phase.

This phase runs autonomously (no live user available to brainstorm with mid-task), so every deviation
from the mockup's literal assumptions below is resolved the same way Phase 3's Catalog resolved its own
(Decisions 2/7/8 there): prefer real backend behavior over the mockup's placeholder copy, and document
the deviation rather than fabricate data to match the mockup pixel-for-pixel.

## Decisions made

1. **The page and its nav link are gated to `role === "admin"` strictly, not the broader
   `ADMIN_ROLES = ["admin", "manager"]` used elsewhere in `Nav.tsx`.** Confirmed from
   `backend/sales/services.py::_notify_admins`: every `NotificationLog` row's `recipient` is drawn from
   `Employee.objects.filter(role=Employee.Role.ADMIN, ...)` — strictly the admin role. A manager's
   inbox (`GET /notifications/` is filtered server-side to `recipient=request.user`) is always empty by
   construction, so showing the link/page to managers would just be a confusing empty state. This
   mirrors the mockup's own "Admin only" tag. Implemented as a standalone `role === "admin"` check in
   `Nav.tsx` (not an addition to the `ADMIN_LINKS` array, which is shared with manager-visible links) and
   an equivalent gate in `NotificationsPageClient` for direct navigation.
2. **The mockup's "Retry" button on failed rows is a disabled placeholder**, matching Catalog's
   "Reorder" button precedent (Decision 1 there) exactly — `notifications/views.py` has no resend/retry
   endpoint, only `mark-read`.
3. **The "All / Failed" segmented toggle is a client-side filter**, not a backend query param — the API
   only supports `?unread=true`, not a status filter. `useNotifications` fetches the full list via
   `fetchAllPages` and the page filters `status === "failed"` in memory for the Failed tab, consistent
   with Catalog's own client-side search/status-derivation pattern.
4. **"Recipient" and the literal "admin@[shop-email]" column are dropped.** The mockup's own markup uses
   a bracketed placeholder for every row (`admin@[shop-email]`) rather than real per-row data — even the
   mockup isn't asserting this is real. Since `GET /notifications/` is always scoped server-side to the
   viewing admin, the recipient is always "you"; rendering a redundant column with a non-real value would
   be a step backward from the "join what's real, don't fabricate" convention this codebase already
   follows. Dropped rather than replaced with a placeholder string.
5. **"Trigger" and "Subject" are derived from `type` + `related_sale`, not the mockup's fuller composed
   text ("New sale — RWF 590,000 by E. Mugisha").** `NotificationLog` stores only a free-text `type`
   field and an optional `related_sale` FK (an id) — it does not store a rendered subject line, a sale
   amount, or an employee name. Reconstructing the mockup's exact copy would require joining the full
   `/sales/` and `/employees/` history for every row in an ever-growing notification log, which is out of
   proportion for this phase (unlike Catalog's product/inventory join, which operates over a bounded
   catalog size). Trigger renders as `sale #S-<id>` (mono, matching the receipt's own `#S-<id>` format
   used elsewhere) when `related_sale` is present, else the humanized `type` (e.g. `low_stock` →
   `low stock`). Subject renders `New sale — Sale #S-<id>` or `<Humanized type> alert`. This is real,
   traceable data (which sale, what kind of alert), just not the fuller prose the mockup shows.
6. **`status` value `"sent"` displays as "Delivered"**, matching the mockup's own tag wording, while the
   underlying API/model value stays `"sent"` (its actual enum value) — a display-label mapping only, not
   a data change.
7. **No mark-read UI in this pass.** The backend's `mark-read` action exists but the mockup doesn't show
   a read/unread affordance on this screen at all (no unread badge, no "mark all read" button) — adding
   one would be inventing UI the mockup doesn't specify. `read_at` is fetched and available on
   `NotificationRow` for a future phase to use; not surfaced here.

## Architecture

```
frontend/
  app/(protected)/
    notifications/
      page.tsx                      — server page, reads getSession(), passes role
      NotificationsPageClient.tsx   — admin-only gate, All/Failed filter, renders the table
  components/notifications/
    NotificationsTable.tsx          — list table (reuses ui/Table.tsx), disabled Retry on failed rows
  lib/notifications/
    useNotifications.ts             — fetches /notifications/, derives trigger/subject/status label
```

## Notification log (`1l`)

`app/(protected)/notifications/page.tsx` reads the session server-side (`getSession()`, same pattern as
`/products`) and passes `role` down. `NotificationsPageClient` renders an "only available to Admin
accounts" message for any non-admin role instead of fetching (Decision 1) — a manager or staff member
who navigates here directly (no nav link visible, but the route itself isn't blocked at the routing
layer) sees a clear message, not a raw 403 or a blank table.

For admin, `useNotifications()` returns each row as:

```typescript
interface NotificationRow extends NotificationLogEntry {
  trigger: string;   // "sale #S-841" | "low stock"
  subject: string;   // "New sale — Sale #S-841" | "Low Stock alert"
}
```

Columns: **Sent** (`sent_at`, formatted `23 Aug 14:14` matching the `Receipt`/`PriceHistoryCard`
`toLocaleString("en-GB", ...)` precedent already used elsewhere), **Trigger** (mono), **Subject**,
**Status** (`Delivered`/`Failed` tag, accent/neutral variants matching `ProductTable`'s tag styling),
**Actions** (disabled `Retry` button, failed rows only — Decision 2).

The "All / Failed" `SegmentedToggle` filters the already-fetched list client-side (Decision 3).

## Error handling

Reuses the established pattern (Catalog's `isLoading`/`isError` inline guard) — no new mechanism:
- `404`/`5xx`/network failure on `GET /notifications/` → inline "Couldn't load notifications" retry
  state, matching `ProductsPageClient`'s own error branch verbatim.
- A manager/staff reaching `/notifications` directly → the admin-only message (Decision 1), not an error
  state, since it's an expected role boundary rather than a failure.

## Testing

**Vitest + RTL:** `useNotifications`'s trigger/subject derivation and field pass-through (mirroring
`useCatalogProducts.test.tsx`'s structure — mocked `fetch`, asserting the derived shape); `NotificationsTable`
render (subject/trigger/status per row, disabled Retry only on failed rows, empty state); `Nav.test.tsx`
extended with cases for the new admin-only Notifications link across all four roles;
`NotificationsPageClient` (admin-only gate renders without fetching, full list renders for admin, Failed
filter narrows the list).

**Playwright e2e:** one smoke test in `e2e/notifications.spec.ts` extending the existing pattern — log in
as admin → open Notifications via the nav link → filter to Failed → every visible row says Failed; plus a
second test confirming sales staff never see the nav link. Proportional to this phase's scope, matching
the discipline established in Phase 3.

## Out of scope for this phase

- Retry/resend of failed notifications (Decision 2) — no backend endpoint.
- Mark-read / unread-badge UI (Decision 7) — the mockup doesn't specify one; `read_at` is fetched but
  unused for now.
- The mockup's full "RWF amount by employee" subject text (Decision 5) — would require an unbounded
  cross-resource join disproportionate to this phase.
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
