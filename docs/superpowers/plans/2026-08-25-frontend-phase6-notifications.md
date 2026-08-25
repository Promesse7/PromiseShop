# Frontend Phase 6: Notifications Implementation Plan

See `2026-08-25-frontend-phase6-notifications-design.md` for the decisions this plan implements.

## Global Constraints

- No backend changes. `GET /notifications/` (optionally `?unread=true`) and
  `POST /notifications/<id>/mark-read/` are the only endpoints; both `IsAuthenticated`,
  server-scoped to `recipient=request.user`.
- Reuse `frontend/lib/api-client.ts` (`fetchAllPages`), `frontend/components/ui/{Table,Tag,Button,SegmentedToggle}.tsx`
  as-is — no new UI primitives.
- Additive-only edits to `frontend/lib/types.ts` and `frontend/components/layout/Nav.tsx` (both shared
  with parallel in-flight phases).

## Task 1: `useNotifications` hook

- [x] **Step 1: Write the failing tests** — `frontend/lib/notifications/useNotifications.test.tsx`:
  mocked `fetch` returning three notifications (one sale-linked/delivered, one sale-linked/failed, one
  type-only/read); assertions on `trigger`/`subject` derivation for both the sale-linked and type-only
  cases, on `status`/`read_at` pass-through, and on ordering matching the API's own `-sent_at` order.
- [x] **Step 2: Run test to verify it fails** — ran before `useNotifications.ts` existed; module-not-found
  failure confirmed the test exercises real code, not a tautology.
- [x] **Step 3: Write minimal implementation** — `frontend/lib/notifications/useNotifications.ts`: a
  `useQuery(["notifications"], () => fetchAllPages<NotificationLogEntry>("notifications/"))` plus
  `deriveTrigger`/`deriveSubject` pure functions (sale-linked → `sale #S-<id>` / `New sale — Sale #S-<id>`;
  else → humanized `type`). Added `NotificationLogEntry`/`NotificationStatus` types to `lib/types.ts`.
- [x] **Step 4: Run test to verify it passes** — `npx vitest run lib/notifications` — 4/4 passed.
- [x] **Step 5: Commit** — `lib/types.ts` (additive), `lib/notifications/useNotifications.ts`,
  `lib/notifications/useNotifications.test.tsx`.

## Task 2: `NotificationsTable` component

- [x] **Step 1: Write the failing test** — `frontend/components/notifications/NotificationsTable.test.tsx`:
  renders a delivered row (subject/trigger/Delivered tag visible), a failed row (Failed tag + disabled
  Retry button), asserts no Retry button on delivered rows, asserts the empty-state message.
- [x] **Step 2: Run test to verify it fails** — module-not-found before implementation existed.
- [x] **Step 3: Write minimal implementation** — `frontend/components/notifications/NotificationsTable.tsx`:
  a `Table` column config (Sent formatted `en-GB` day/month/hour/minute, Trigger mono, Subject, Status tag,
  disabled ghost Retry button gated on `status === "failed"`).
- [x] **Step 4: Run test to verify it passes** — `npx vitest run components/notifications` — 4/4 passed.
- [x] **Step 5: Commit** — `components/notifications/NotificationsTable.tsx` + test.

## Task 3: Nav admin-only Notifications link

- [x] **Step 1: Write the failing tests** — extended `frontend/components/layout/Nav.test.tsx`: admin sees
  the Notifications link; manager, sales_staff, and technician do not.
- [x] **Step 2: Run test to verify it fails** — confirmed against the pre-edit `Nav.tsx` (link absent for
  every role, so the "admin sees it" case failed as expected).
- [x] **Step 3: Write minimal implementation** — added a standalone `{role === "admin" && <Link .../>}`
  in `Nav.tsx`, deliberately outside the `ADMIN_LINKS` array (which is shared with `manager` and is
  edited by a parallel in-flight phase) — see design Decision 1 for why this can't just join
  `ADMIN_LINKS`.
- [x] **Step 4: Run test to verify it passes** — `npx vitest run components/layout/Nav.test.tsx` — 9/9
  passed (5 pre-existing + 4 new... actually 3 new cases were added, one merged into an existing block —
  final count 9 tests, all green).
- [x] **Step 5: Commit** — `components/layout/Nav.tsx`, `components/layout/Nav.test.tsx`.

## Task 4: `NotificationsPageClient` + route

- [x] **Step 1: Write the failing tests** — `frontend/app/(protected)/notifications/NotificationsPageClient.test.tsx`:
  non-admin role renders the admin-only message and never calls `fetch`; admin role renders the full list;
  clicking the Failed radio narrows the list to failed-only rows.
- [x] **Step 2: Run test to verify it fails** — module-not-found before the client component existed;
  after a first pass the Failed-filter case hit a 5000ms timeout because `getByText("Failed")` collided
  with both the toggle label and a status tag — fixed by targeting `getByRole("radio", { name: "Failed" })`.
- [x] **Step 3: Write minimal implementation** — `app/(protected)/notifications/page.tsx` (server,
  `getSession()` → role) and `NotificationsPageClient.tsx` (admin gate → loading/error guards, matching
  `ProductsPageClient`'s branch order exactly → `SegmentedToggle` All/Failed → `NotificationsTable`).
- [x] **Step 4: Run test to verify it passes** — `npx vitest run "app/(protected)/notifications"` — 3/3
  passed after the selector fix.
- [x] **Step 5: Commit** — `app/(protected)/notifications/page.tsx`,
  `app/(protected)/notifications/NotificationsPageClient.tsx` + test.

## Task 5: e2e smoke test

- [x] Wrote `frontend/e2e/notifications.spec.ts`: admin logs in → opens Notifications via the nav link →
  filters to Failed → every visible row says Failed; a second test confirms sales staff never see the nav
  link. Not executed in this worktree (see the phase's Testing note — shared port/dev-database across four
  parallel worktrees; run once by the orchestrating session after merge).

## Final verification

- [x] `npm test` (full suite, not just this phase's files) — see report for pass count.
- [x] `npm run lint` — see report for result.
