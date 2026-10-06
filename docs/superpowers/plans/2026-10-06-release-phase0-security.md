# Release Phase 0 — Security and permission fixes

Spec: `PromiseShop — Release Dev Handoff.md` (repo root), section "Phase 0". Baseline: `0028f38`.

## Decisions taken while planning

1. **Login lockout uses the Django cache, not a DRF throttle class.** The handoff asks for "5 failed attempts
   per username per 15 minutes, then a 15-minute lockout". DRF throttles count *every* request and key by
   IP/user, not by failed attempts per username. A small helper (`accounts/lockout.py`) keeps a failure
   counter and a lock key per lowercased username in the cache (Redis locally, Upstash in production — shared
   by every container). The 6th attempt inside the window gets 429, even with the right password. A
   successful login clears the counter. Module C will reuse the same helper for manager-PIN attempts.
2. **Tests run on an in-memory cache.** An autouse fixture in `backend/conftest.py` swaps `CACHES` to
   LocMem and clears it per test, so lockout counters never leak between tests or into the dev Redis.
3. **Notification status `logged`.** New choice `logged` becomes the default; a data migration turns
   existing `sent` rows into `logged` (no email was ever sent). `sent` stays as a valid choice for when
   real delivery exists. The frontend shows `logged` as "In app".
4. **Supplier delete** is admin/manager and refused with a clean 400 when the supplier has purchases
   (Purchase.supplier is PROTECT, so it would otherwise 500).
5. **Pricing delete** falls under the same admin/manager rule as create/update.
6. Out of Phase 0, noted for the owner: **change the live admin password** (a production action, done by
   the owner, not in code). Staff can still set the selling price of a *brand-new* product while adding it
   to a purchase (service path, not the pricing endpoint); left as is, revisit in Module E.

## Tasks (TDD: failing test → implement → green → commit)

| # | Test first | Change |
|---|---|---|
| 0.1 | staff POST `/sales/<id>/cancel/` and `/return/` → 403; manager → 200 | `IsAdminOrManager` on both actions |
| 0.2 | staff POST/PATCH/DELETE `/product-pricing/` → 403; staff GET → 200; manager create → 201 | `IsAdminOrManagerOrReadOnly` on pricing |
| 0.3 | staff list/create/edit customers OK; staff delete → 403; admin delete with sales → 400; without → 204; manager delete → 403 | delete = `IsAdmin` + history guard |
| 0.4 | staff GET suppliers 200, POST/PATCH → 403; manager POST → 201; delete with purchases → 400 | `IsAdminOrManagerOrReadOnly` + delete guard |
| 0.5 | 5 wrong passwords → 401 each, 6th (even correct) → 429; other usernames unaffected; success clears counter; lock expires | `accounts/lockout.py` + login view |
| 0.6 | new sale's notifications have status `logged` | model default + data migration; receipt banner text; notifications table label |
| 0.7 | manager GET every dashboard endpoint → 200; staff → 403 | `IsAdminOrManager` on dashboard views |
| FE | Set new price hidden for staff; supplier create/edit hidden for staff; receipt banner text; "In app" status | Vitest per component |
