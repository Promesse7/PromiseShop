# Frontend Design System Polish — Design

## Context

`Todo.md` (user-authored) proposed a large visual overhaul for the dashboard — a full
glassmorphism re-theme, an Odoo-style Cmd+K command bar with view switchers, a live
"Chatter" activity drawer, and drill-down interactive KPI cards. In conversation the user
scoped this down explicitly: **polish + subtle glass accents on top of the existing
"Nocturne" palette, applied app-wide, with no new features or navigation patterns.**

The current UI is functionally complete (Phases 1–9, all merged and verified — see
`docs/superpowers/plans/` and project memory) but visually flat: `Card` is a solid
`bg-surface` box with a 1px hairline shadow, `StatCards` render plain text with no visual
hierarchy, `Nav` has no active-route indication, and every page hand-rolls its own header
markup (`<div className="flex items-baseline gap-3 mb-6">…`) with small inconsistent
variations. This spec addresses those specific, verified gaps — not the full Todo.md
document.

**Explicitly out of scope** (deferred, not part of this pass): new background/brand
colors, Cmd+K search, Kanban/Pivot/List view switchers, the live Chatter/websocket
activity drawer, drill-down KPI interactivity, sparklines. None of these are visual
polish — they are new subsystems and would need their own brainstorming pass.

## Decisions made (with the user)

1. **Keep the existing Nocturne palette verbatim.** No new `bg`/`accent` colors, no new
   background gradient on `<body>`. Every visual change is built from tokens that already
   exist in `tailwind.config.ts`.
2. **Glass treatment is opt-in per surface, not global.** Dense data surfaces (tables,
   lists) stay fully solid — backdrop-blur under small text or table rows hurts
   legibility and was never asked for. Only card-shaped summary/detail surfaces (KPI
   cards, detail panels) get the glass variant.
3. **Whole-app rollout via shared primitives**, not a page-by-page pass. `Card`, `Nav`,
   and a new `PageHeader` are the only components that change structurally; every screen
   inherits the update by virtue of already using them.
4. **No behavior changes.** Every existing interaction (filters, dialogs, links, role
   gating) is untouched. This is a styling- and structure-only pass — reflected in tests
   by asserting the same roles/text as before, plus new assertions only for genuinely new
   things (`Nav`'s active-link state, `PageHeader`'s slots).

## Architecture

Files touched:

```
frontend/
  tailwind.config.ts                     # add glow shadow scale (additive)
  app/globals.css                        # add .glass / .glass-hover utilities
  components/
    ui/
      Card.tsx                           # add variant="glass"
      PageHeader.tsx                     # NEW — kicker/title/subtitle + actions slot
    layout/
      Nav.tsx                            # sticky + glass backdrop + active-route state
    dashboard/
      StatCards.tsx                      # use Card variant="glass", stronger number hierarchy
  app/(protected)/
    dashboard/DashboardPageClient.tsx     # use PageHeader
    products/ProductsPageClient.tsx       # use PageHeader
    stock/StockPageClient.tsx             # use PageHeader
    purchases/PurchasesPageClient.tsx     # use PageHeader
    customers/CustomersPageClient.tsx     # use PageHeader
    suppliers/SuppliersPageClient.tsx     # use PageHeader
    employees/EmployeesPageClient.tsx     # use PageHeader
    expenses/ExpensesPageClient.tsx       # use PageHeader
    notifications/NotificationsPageClient.tsx  # use PageHeader
    products/[id]/ProductDetailPageClient.tsx  # use PageHeader (if it has its own header)
```

The exact set of page clients migrated to `PageHeader` will be confirmed during
implementation by grepping for the current ad hoc header pattern — the list above is
based on the known page inventory, not an exhaustive audit.

### `tailwind.config.ts` / `globals.css`

Add (additive only, nothing removed or renamed):
- `boxShadow.glow-sm` / `boxShadow.glow-md`: soft `accent`-tinted blurred shadow, for
  hover/emphasis states — distinct from the existing hard-edged `sm`/`md`/`lg` hairline
  shadows, which stay as-is for default card elevation.
- `.glass` utility class: `bg-surface/70 backdrop-blur-md border border-divider`.
- `.glass-hover` utility class: `hover:border-accent/40 hover:shadow-glow-sm
  transition-all duration-200`.

### `Card`

Add `variant?: "solid" | "glass"` (default `"solid"`, so every existing usage is
unaffected). `"glass"` applies `.glass .glass-hover` instead of `bg-surface`. The
`elevation` prop keeps working for either variant.

### `PageHeader`

New component: `<PageHeader kicker? title subtitle? actions? />`. Renders the
kicker/title/subtitle stack on the left (matching the current dashboard's
`h3` + muted subtitle pattern) and an `actions` slot on the right (matching where
`ExportCsvButton` sits today). Pure presentational — no data fetching, no role logic;
callers keep deciding what goes in `actions`.

### `Nav`

- Wrap in a sticky (`sticky top-0 z-10`) container with the new `.glass` treatment
  (backdrop-blur over content scrolling underneath), replacing the current plain
  `border-b border-divider` bar.
- Add active-route detection via `usePathname()` (Nav becomes a client component if it
  isn't already reachable as one — it's rendered from the server `ProtectedLayout`, so
  this requires either marking `Nav` `"use client"` or a small client wrapper; the
  simplest is marking `Nav` itself `"use client"` since it takes no server-only props).
  The current link gets a distinct treatment (accent text + subtle underline/pill
  background) instead of the current uniform `hover:text-accent` for all links.

### `StatCards`

Switch each `Card` to `variant="glass"`, keep the existing kicker/number/meta content
and data logic untouched, and give the number itself slightly more visual weight
(size/weight already `text-2xl font-medium` — evaluate bumping to match the elevated
container, no functional change).

## Error handling

None of this touches data fetching, so there's no new error surface. `Card`'s new prop
defaults to today's behavior if omitted, so nothing regresses silently.

## Testing plan

- `Card.test.tsx`: new cases for `variant="glass"` applying the glass classes, and that
  omitting `variant` still renders the current solid classes (regression guard).
- `PageHeader.test.tsx`: new file — renders kicker/title/subtitle/actions in the right
  slots.
- `Nav.test.tsx`: existing role/label assertions must keep passing unchanged (proves no
  behavior regression); add cases asserting the current route's link gets the active
  treatment (e.g. via `aria-current="page"` rather than a brittle class-string check).
- `StatCards.test.tsx`: existing assertions (formatted currency, etc.) must keep passing.
- Every migrated `*PageClient.test.tsx`: existing assertions must keep passing after
  swapping in `PageHeader` — this is the regression check that the migration didn't
  change visible text/roles.
- Full suite gate before calling this done: `npm test`, `npx tsc --noEmit`, `npm run
  lint`, `npm run build`. No backend involved, so no e2e/Docker requirement for this
  pass — but doing one manual visual pass in the browser (once the Chrome extension
  reconnects) before considering it finished is worth doing, since this is a visual
  change that automated tests can't fully judge.

## Out of scope

- Everything listed under "Explicitly out of scope" in Context.
- Any change to `checkout`/`stock`/`purchasing` domain logic, API calls, or role gating.
- Rewriting `components/pos/CartTable.tsx` / `CartCards.tsx` or other dense data
  surfaces to use the glass variant — they stay solid per Decision 2.
- A design-token rename/cleanup of the existing (unusually tight, sub-pixel) spacing
  scale — that scale was deliberately pixel-matched to the mockups and isn't part of
  this "look" complaint.
