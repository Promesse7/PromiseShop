# Frontend Phase 1: Foundation — Design

## Context

The Django REST backend (Phases 1-6: foundation, purchasing, sales/POS, stock/equipment,
notifications, finance, admin dashboard) is complete and merged to `main`, 214 tests passing.
This is the first frontend phase — no frontend code exists yet in this repository. The frontend
is built against the Claude Design mockup handoff bundle at
`C:\Users\HP\Downloads\Promise Electronic Shop Inventory-handoff\promise-electronic-shop-inventory`
(the "Nocturne" design system, ~20 screens across every backend domain).

A full frontend is too large for one spec, mirroring why the backend was split into 6 phases.
This phase — Foundation — builds everything every later screen depends on: the project scaffold,
the ported design system, the core reusable components, the auth flow, and the role-gated layout
shell. Later phases (catalog/inventory, purchasing, sales/POS, finance/notifications, admin
dashboard) each get their own spec → plan → implementation cycle, mounting into this shell.

## Decisions made (with the user)

1. **Next.js 15 (App Router) + TypeScript**, in a new top-level `frontend/` directory alongside
   `backend/`. No frontend code exists yet — this is a from-scratch scaffold, not an extension of
   existing code.
2. **Tailwind, themed with the mockup's exact Nocturne tokens** — colors, spacing scale, the
   signature 8px-family radii, ring-based shadows — defined as Tailwind theme values, rather than
   porting the mockup's hand-authored CSS custom properties near-verbatim. Chosen for Tailwind's
   DX/ecosystem while still copying every token *value* verbatim from the mockup's stylesheet, per
   the mockup bundle's own instruction ("never hard-code a hex, a font name, or a px value the
   tokens already carry"). A small set of reusable components (`Button`, `Card`, `Field`, `Tag`,
   `Table`, `Dialog`) are built once, mirroring the mockup's own `.btn`/`.card`/`.field` component
   layer, rather than scattering Tailwind utility classes ad hoc across every screen.
3. **TanStack Query for all server state.** The app is CRUD-heavy across many domains (products,
   purchases, sales, inventory, equipment, expenses, notifications) — Query's caching,
   invalidation, and background-refetch fit this far better than ad-hoc `fetch` + `useState`
   scattered per component.
4. **Auth via a Next.js BFF (backend-for-frontend) pattern, not direct client-to-Django calls.**
   Next.js route handlers hold the JWT access/refresh tokens in httpOnly cookies and proxy every
   API call to Django, attaching the `Authorization` header server-side. The browser's JS never
   sees a raw JWT — more resistant to XSS than an in-memory or localStorage token, at the cost of
   a thin proxy layer every domain phase's endpoints route through.
5. **EN/RW toggle is visual-only for now, not real i18n.** The mockup shows a language toggle in
   every screen's header (one of the "assumptions baked into all 20 screens," per the mockup's own
   framing) — it is built and rendered pixel-for-pixel, but doesn't translate anything yet. Real
   Kinyarwanda translation is out of scope for this phase and every phase after it until
   explicitly requested — avoids a full-app translation pass blocking screens that don't work yet.
6. **Desktop-first, no invented breakpoints.** The mockup's own tokens specify no responsive
   breakpoints — its framing is "desktop + tablet POS." This phase (and the domain phases after
   it) build to match the mockups exactly; tablet/mobile-specific responsive layout is an explicit
   follow-up pass, not guessed at now.
7. **"Sale triggers admin email" (a mockup assumption) maps to what the backend already built —
   a toast + `NotificationLog`, not real email.** The backend's Phase 3 explicitly deferred real
   email sending pending a real email backend to configure; the frontend generalizes this into a
   toast-notification pattern for action feedback broadly (successful mutations, errors), and a
   later phase reads the existing `GET /api/notifications/` API for the inbox itself. No new
   backend work is implied by this mockup assumption.

## Architecture

```
frontend/
  app/
    login/page.tsx              — login screen (mockup 1a)
    (protected)/layout.tsx      — session check, role-gated nav shell
    api/
      auth/login/route.ts       — BFF: calls Django /api/auth/login/, sets httpOnly cookies
      auth/logout/route.ts      — BFF: clears cookies
      auth/session/route.ts     — BFF: session-check, returns current employee/role or 401
      proxy/[...path]/route.ts  — BFF: generic authenticated proxy to Django, attaches JWT,
                                   handles 401→refresh→retry transparently
  components/
    ui/                         — Button, Card, Field, Tag, Table, Dialog (Nocturne-themed)
    layout/                     — Nav, RoleGate
  lib/
    api-client.ts               — thin fetch wrapper used by TanStack Query hooks, always calls
                                   through the BFF proxy route, never Django directly
    query-client.ts             — TanStack Query client setup
  tailwind.config.ts            — Nocturne tokens as Tailwind theme values
```

**Why a generic proxy route, not one route handler per Django endpoint:** the backend surface is
large (7 apps, dozens of endpoints across 6 phases) and growing with every domain phase. A single
`app/api/proxy/[...path]/route.ts` that forwards method/body/query-string to the matching Django
path, attaching the cookie-derived JWT, avoids hand-writing a parallel route file per backend
endpoint — each domain phase adds frontend *pages and components* that call the proxy with the
right path, not new BFF plumbing. Auth-specific routes (login/logout/session) stay separate
because their semantics (setting/clearing cookies) differ from a pure pass-through.

## Layout & navigation

Top nav bar (`.mnav` in the mockup), not a sidebar: brand name, page links, EN/RW toggle
(visual-only, Decision 5), role tag + employee name. **Nav links are role-gated**, confirmed
directly from mockup screens 1b (staff) and 1m (admin):
- Sales Staff / Technician: `Checkout · Products · Purchases · Stock`
- Admin / Manager: `Dashboard · Products · Sales · Purchases · Stock · Employees`

The layout shell reads the current employee's role (from the BFF's session-check route) and
renders the matching link set. Later domain phases add the actual pages these links point to;
this phase builds the shell and the role-gating logic, with placeholder/stub destinations where a
later phase's page doesn't exist yet (a `Coming soon` state, not a broken link).

## Auth flow

Login screen (mockup 1a): two-column card, 900px wide. Left panel: branded gradient, shop name,
product description, shop identity placeholders. Right panel (380px): EN/RW toggle, "Sign in"
heading, username field, password field, full-width submit button, and a caption stating the
redirect rule verbatim from the mockup: *"Sales Staff & Technicians land on Checkout. Admins land
on the Dashboard."*

On submit: `app/api/auth/login/route.ts` calls Django's `POST /api/auth/login/`, receives
access+refresh tokens, sets them as httpOnly cookies (`Secure`, `SameSite=Lax`), and returns the
employee's role to the client. The client redirects: `sales_staff`/`technician` → `/checkout`
(stub in this phase), `admin`/`manager` → `/dashboard` (stub in this phase) — this exact mapping
is the mockup's own stated rule, not an inference.

Session check: `(protected)/layout.tsx` calls the BFF's session-check route server-side before
rendering any protected page. No valid session → redirect to `/login`. Token refresh happens
inside the generic proxy route: a 401 from Django triggers one refresh attempt against Django's
`POST /api/auth/refresh/` using the refresh-token cookie, then retries the original request once;
a second 401 clears both cookies and the client redirects to `/login`.

## Error handling

API errors from the BFF proxy are normalized into one shape components consume generically:
- 400 (validation) → mapped to per-field errors on the form that made the request (DRF's
  `{"field": ["message", ...]}` shape maps directly to field-level error display).
- 401 (auth, after the proxy's own refresh attempt already failed) → session cleared, redirect to
  `/login`.
- 403 (permission) → a toast ("You don't have permission to do that") — this phase doesn't yet
  have domain screens to test this against extensively, but the shell/toast mechanism is built
  here for every later phase to reuse.
- 404 / 5xx / network failure → a toast with a generic retry-safe message, or a full error
  boundary for a failure during initial page render.

This reuses the same toast mechanism the mockup assumes for sale-completion feedback (Decision
7), generalized to error feedback broadly — one mechanism, not two.

## Data flow example

User opens the app → `(protected)/layout.tsx` calls the BFF session-check route → valid session,
`role=sales_staff` → renders with the staff nav link set, and (since this phase has no `/checkout`
page yet) a stub landing page. A later phase replaces that stub with the real POS screen; nothing
in this phase's shell needs to change when that happens — the layout and nav-gating logic are
already correct, only the page content underneath changes.

## Testing

**Vitest + React Testing Library** for component/unit tests — the reusable `ui/` components
(`Button`, `Card`, `Field`, `Tag`, `Table`, `Dialog`) get rendered-output and interaction tests;
the role-gating logic (`RoleGate`/nav-link-set-by-role) gets a unit test per role.

**Playwright** for a small number of end-to-end smoke tests, matching this project's established
"proportional testing, not exhaustive" discipline: this phase's smoke test is login → correct
role-based redirect (one test per role class: staff-or-technician → `/checkout`,
admin-or-manager → `/dashboard`), plus a failed-login-shows-error case, plus a
session-expiry-redirects-to-login case. Not a full pixel-diff visual regression suite — higher
cost than any backend phase asked for, and out of proportion to a Foundation phase with no domain
screens yet.

## Out of scope for this phase

- Every domain screen (products, purchases, sales/POS, stock/equipment, finance, notifications,
  admin dashboard) — each gets its own later spec → plan → implementation cycle.
- Real i18n / Kinyarwanda translation (Decision 5).
- Responsive/tablet-specific layouts beyond what the mockup itself specifies (Decision 6) — none
  currently specified.
- Visual regression / pixel-diff testing.
- Any backend changes — this phase (and the frontend track generally) consumes the existing API
  surface; no new Django endpoints are implied by anything in this spec.
