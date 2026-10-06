# UI Navigation, Layout & Motion Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole PromiseShop frontend tidy, navigable and smooth: a grouped sidebar plus a phone tab bar, jump search, one page template, responsive tables/sheets, and an app-like motion system on every screen.

**Architecture:** Wave 1 adds new building blocks (motion tokens, `Page`, `DataTable`, `Sheet`-aware `Dialog`, states, confirm, money formatter) without touching screens. Wave 2 replaces the top-bar `Nav` with an `AppShell` (sidebar, top bar, phone tab bar, More sheet, jump search, help panel, page transitions). Wave 3 moves every screen group onto the template. Wave 4 adds shared-element transitions and a consistency pass. Frontend only; no backend changes; role visibility unchanged.

**Route transitions (decided after reading `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`):** Next 16's App Router supports React's `<ViewTransition>` (`import { ViewTransition } from 'react'`) with no config; navigations are transitions, so it animates automatically, and it degrades to no animation on unsupported browsers. A `(protected)/template.tsx` only remounts when the *first* segment changes (`/products` → `/products/12` does not remount it), so it is NOT used for page transitions. Use `ViewTransition` for page enter/exit and for card → detail shared-element morphs (`name="product-<id>"` etc.), plus `Link transitionTypes={['nav-back']}` for the reverse direction. Use `motion` for everything inside a page (sheets, nav pills, lists, count-ups, presses). Read that guide before Tasks 11 and 16.

**Tech Stack:** Next 16.3 (App Router), React 19.2, TypeScript, Tailwind 3.4, TanStack Query, lucide-react, **`motion`** (Framer Motion, `motion/react` import), Vitest 2.1 + RTL, Playwright.

**Spec:** Approved in-chat design (2026-10-07, Sections 1–4). The user waived a written spec; the design is restated below as Global Constraints and per-task requirements.

## Global Constraints

- Frontend only (`frontend/`). No backend or API changes. Who-sees-what per role stays exactly as today (`getNavLinksForRole` semantics, strict-admin links, notifications admin-only).
- Keep the visual identity: Tailwind colours, fonts, glass styles, `accent` purple. **Spacing scale is custom:** `1`=2.8px, `2`=5.6px, `3`=8.4px, `4`=11.2px, `6`=16.8px, `8`=22.4px. Other steps are Tailwind defaults (e.g. `5`=20px, `10`=40px). Check before using.
- Breakpoint: phone layout `< 1024px` (`lg`), desktop `≥ 1024px`. Phone target is 390px wide.
- Motion library: `motion` (`npm i motion`), imported from `motion/react`. All durations/easings/springs come from `lib/motion.ts`. Nothing animates longer than 300ms; nothing blocks input; animate only `transform`/`opacity` (plus sidebar width); `prefers-reduced-motion` → instant or opacity-only.
- Money: whole RWF with thousands separators, right-aligned in tables, via `formatRwf` only.
- Never use `window.confirm` or `window.prompt`; use `useConfirm`.
- Vitest must be run as `npx vitest run --minWorkers=1 --maxWorkers=2 …` (RAM is tight). Existing tests are updated when markup changes, never deleted. `npx tsc --noEmit` and `npx eslint .` must stay clean.
- Commit with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never run docker compose, no Neon.

## Review Focus

1. **Deep links and refresh:** opening `/products/12` directly must render inside the shell with the right breadcrumb, active nav item, and a working back arrow (falls back to the parent list when there is no history).
2. **Role edge cases:** a technician/sales_staff never sees an Admin group, and the phone tab bar for each of the 4 roles has exactly its 4 shortcuts plus More. A manager never sees Employees/Expenses/Setup/Settings/Notifications.
3. **Phone keyboard and safe areas:** bottom sheets and the tab bar must not cover focused inputs or the iOS home indicator (`env(safe-area-inset-bottom)`). Sticky footers in long forms stay reachable with the keyboard open.
4. **Reduced motion:** with `prefers-reduced-motion: reduce`, page transitions, sheets, staggered lists and count-ups are instant, and the app is fully usable.
5. **Print:** receipts, labels, Z-report and statements still print correctly. The shell, the tab bar and motion wrappers are hidden or neutral in `@media print`, and `.print-target` isolation still works inside sheets.

---

## Wave 1 — Foundation (no screen changes)

### Task 1: Motion tokens + `motion` dependency

**Files:** Create `lib/motion.ts`, `lib/motion.test.ts`; modify `package.json` (add `motion`).

**Produces:**
```ts
export const DURATION = { fast: 0.15, base: 0.22, slow: 0.3 } as const;
export const EASE = { out: [0.22, 1, 0.36, 1], inOut: [0.65, 0, 0.35, 1] } as const;
export const SPRING = { sheet: { type: "spring", stiffness: 420, damping: 38 }, pill: { type: "spring", stiffness: 500, damping: 40 } } as const;
export const pageVariants: Variants;   // initial {opacity:0,y:8}, animate {opacity:1,y:0}, exit {opacity:0,y:-4}; custom dir=-1 reverses y
export const listItem: Variants;       // stagger child: {opacity:0,y:6} → {opacity:1,y:0}
export const listContainer: Variants;  // staggerChildren 0.03, max 10 staggered
export function useReducedMotionSafe(): boolean; // wraps motion's useReducedMotion, false during SSR
```
- [ ] Test: every duration ≤ 0.3; `pageVariants.initial` has `opacity: 0`; reduced-motion hook returns a boolean.
- [ ] Implement, run the tests, commit `feat(ui): motion tokens`.

### Task 2: `formatRwf` + `useConfirm`

**Files:** Create `lib/format.ts` (+test), `components/ui/ConfirmDialog.tsx` (+test), `components/ui/ConfirmProvider.tsx`; modify `components/layout/Providers.tsx` to mount `ConfirmProvider`.

**Produces:**
```ts
export function formatRwf(value: string | number | null | undefined, opts?: { sign?: boolean }): string; // "RWF 1,234,500"; null/undefined/"" → "—"; rounds to whole francs; sign:true → "+RWF 500"/"−RWF 500"
export function useConfirm(): (o: { title: string; message?: string; confirmLabel?: string; tone?: "default" | "danger"; requireText?: string; input?: { label: string; required?: boolean } }) => Promise<false | true | string>; // string when `input` was given (replaces window.prompt)
```
- [ ] Tests: `formatRwf("530000.00") === "RWF 530,000"`, `formatRwf(null) === "—"`, `formatRwf(-500,{sign:true}) === "−RWF 500"`; confirm resolves `true` on confirm, `false` on cancel/Escape; the input variant resolves the typed text and blocks empty input when required.
- [ ] Implement, test, commit.

### Task 3: Responsive `Dialog` (centred on desktop, bottom sheet on phone)

**Files:** Modify `components/ui/Dialog.tsx` (+ its test); create `lib/useMediaQuery.ts` (+test).

**Interface:** keep `{ open, onClose, title, children }` and add `footer?: ReactNode` (sticky footer), `size?: "sm" | "md" | "lg"`, `description?: string`. Uses `AnimatePresence`:
- **Desktop:** scale 0.96→1 + fade.
- **Phone:** slides up with `SPRING.sheet`, drag handle, `drag="y"` closes when dragged >120px or velocity >500.
- Escape and backdrop close it. Focus moves to the first focusable element and returns on close. `role="dialog" aria-modal aria-labelledby`.
- Body scroll is locked while open. Phone padding-bottom uses `env(safe-area-inset-bottom)`.
- Keep the existing `print:` overrides (`.print-target` must still print).
- `useMediaQuery("(min-width: 1024px)")` returns false on the server and in jsdom unless `matchMedia` is mocked.

- [ ] Tests: renders title and children when open; nothing when closed; Escape calls onClose; the footer renders outside the scroll area; phone mode (matchMedia false) has `data-variant="sheet"`, desktop has `data-variant="dialog"`. Existing Dialog tests stay green.
- [ ] Implement, run the **full** vitest suite (Dialog is used everywhere), commit.

### Task 4: `Page` template

**Files:** Create `components/ui/Page.tsx` (+test). Keep `PageHeader` for now; it's removed in Wave 4 once unused.

**Produces:**
```tsx
<Page
  title="Purchases" description="Stock coming in from suppliers"
  breadcrumb={[{ label: "Buy" }, { label: "Purchases" }]}   // optional; the shell also derives one
  primaryAction={<Button>+ New purchase</Button>}
  secondaryActions={[{ label: "Export CSV", onSelect: fn }]}  // rendered in a "⋯" menu
  toolbar={<Toolbar>…</Toolbar>}                               // optional
  back="/purchases"                                            // detail pages: shows ← on phone
>{children}</Page>
export function Toolbar(props: { search?: ReactNode; filters?: ReactNode; activeFilterCount?: number; trailing?: ReactNode }): JSX.Element;
// desktop: one row (search · filters · trailing). Phone: search + a "Filters (n)" button opening a Dialog sheet with the filters.
```
Content is wrapped in `motion.div` with `pageVariants`.
- [ ] Tests: renders the title, description and primary action; the ⋯ menu lists secondary actions and calls `onSelect`; phone Toolbar shows "Filters (2)" and opens the sheet.
- [ ] Implement, test, commit.

### Task 5: `DataTable` (table on desktop, cards on phone)

**Files:** Create `components/ui/DataTable.tsx` (+test). Keep `Table` (it's used widely and migrated screen by screen in Wave 3).

**Produces:**
```tsx
interface DataColumn<T> { key: string; header: string; render?: (row: T) => ReactNode; sortValue?: (row: T) => string | number; align?: "left" | "right"; money?: boolean; /* money → formatRwf + right align */ primary?: boolean; /* card title on phone */ mobile?: boolean /* show on phone card (default: first 4) */ }
<DataTable columns rows rowKey onRowClick?={(row)=>void} rowHref?={(row)=>string} empty={<EmptyState …/>} loading?={boolean} stickyHeader defaultSort={{ key, dir }} />
```
- **Desktop:** clickable sortable headers (aria-sort), sticky header, row hover; rows are links when `rowHref` is given.
- **Phone:** a list of compact cards: the primary column as title, the other mobile columns as label/value rows, and the whole card tappable.
- Rows animate in with `listContainer/listItem` on first render only; removed rows exit with a fade (`AnimatePresence`, `layout`).
- [ ] Tests: sorts on header click (asc→desc); money column shows "RWF 1,000" right-aligned; `rowHref` renders a link; phone renders cards with the primary title; empty and loading states render.
- [ ] Implement, test, commit.

### Task 6: State components

**Files:** Create `components/ui/EmptyState.tsx`, `components/ui/LoadingState.tsx`, `components/ui/ErrorState.tsx` (upgrade the existing one in place, same export), with tests.

**Produces:**
- `EmptyState({ icon, title, message?, action? })`
- `LoadingState({ variant: "table" | "cards" | "detail" | "form", rows?: number })`: shaped skeletons that reuse `Skeleton`
- `ErrorState({ message, onRetry? })`: shows a Retry button when `onRetry` is given. Keep backward compatibility with the current `ErrorState({message})` call sites.

- [ ] Tests for each, then commit `feat(ui): foundation building blocks`.

**Wave 1 exit:** full vitest suite green, `tsc` and `eslint` clean. No screen visibly changed except that dialogs now animate and become sheets on phone.

---

## Wave 2 — App shell

### Task 7: Navigation model (pure)

**Files:** Create `lib/nav/navModel.ts` (+test). Modify `components/layout/Nav.tsx` to re-export `getNavLinksForRole` from here so the existing tests keep passing until removal.

**Produces:**
```ts
export type NavGroupId = "sell" | "stock" | "buy" | "money" | "admin";
export interface NavItem { href: string; label: string; icon: LucideIcon; group: NavGroupId }
export const NAV_GROUPS: { id: NavGroupId; label: string }[]; // Sell, Stock, Buy, Money, Admin, in order
export function getNavItemsForRole(role: EmployeeRole): NavItem[];        // same visibility as today's getNavLinksForRole, plus /stock/movements; /notifications for admin only (group admin)
export function getNavGroupsForRole(role): { id; label; items: NavItem[] }[]; // non-empty groups only
export function getTabBarItems(role): NavItem[];                          // staff: checkout, sales("My sales"), products, stock · admin/manager: dashboard, sales, products, debts
export function findActiveItem(pathname: string, items: NavItem[]): NavItem | undefined; // longest-prefix match (/stock/movements beats /stock)
export function breadcrumbFor(pathname: string, items): { label: string; href?: string }[]; // [group label, item label, (detail label set by page)]
```
Groups:
- **Sell:** /checkout, /sales, /close-day, /customers, /debts
- **Stock:** /products, /stock, /stock/movements, /shop-use
- **Buy:** /purchases, /suppliers
- **Money:** /dashboard, /expenses
- **Admin:** /employees, /settings, /setup/import, /notifications

Labels: staff see "My sales"; everyone else sees "Sales".
- [ ] Tests: an exact item list per role for all 4 roles (manager has no admin-strict items; technician equals sales_staff); groups in order and none empty; tab bar items per role; longest-prefix active match; breadcrumb for `/stock/movements` = Stock › Movements.
- [ ] Implement, test, commit.

### Task 8: Sidebar, TopBar, TabBar, MoreSheet

**Files:** Create `components/shell/Sidebar.tsx`, `TopBar.tsx`, `TabBar.tsx`, `MoreSheet.tsx`, `UserMenu.tsx` (+tests).
- **Sidebar** (desktop only, `hidden lg:flex`):
  - 240px; collapses to a 64px rail via a toggle, stored in localStorage `promiseshop.sidebar.collapsed` (try/catch).
  - Group labels; icons plus labels (tooltips when collapsed).
  - The active item gets a `motion.div layoutId="nav-pill"` background (`SPRING.pill`); width animates.
- **TopBar:**
  - Breadcrumb (desktop) or title plus a back arrow (phone, when the page passes `back` or the route is a detail route).
  - The search trigger: an input-looking button showing "Search or jump to… Ctrl K" on desktop, an icon on phone.
  - HelpButton (Task 10), the notifications bell (admin, unread count from the existing notifications hook), and `UserMenu` (name, role tag, Logout).
- **TabBar** (phone only, `lg:hidden`):
  - Fixed bottom, the 4 items plus More, with a `layoutId="tab-pill"` indicator.
  - `pb-[env(safe-area-inset-bottom)]`; hidden in print.
- **MoreSheet:** a `Dialog` sheet with the grouped full list, Help and Logout.

- [ ] Tests: the Sidebar renders the groups for a role and marks the active item `aria-current="page"`; collapse persists; the TabBar shows 4 + More, and More opens the sheet with all groups; logout calls `/api/auth/logout`.
- [ ] Implement, test, commit.

### Task 9: Jump search (command palette)

**Files:** Create `components/shell/CommandPalette.tsx`, `lib/nav/useCommandResults.ts` (+tests).
- Opens with Ctrl/Cmd+K, `/` when not typing, or the TopBar trigger. Desktop: drops in from the top. Phone: full-screen sheet.
- Sections:
  - **Pages:** the role's nav items, fuzzy-matched by label.
  - **Actions:** New sale → /checkout; New purchase → `/purchases?open=new`; Add product → `/products?new=1` (admin/manager); Record payment → /debts (admin/manager).
  - **Products:** existing `GET /api/products/search/?q=&limit=5` via `apiFetch`, debounced 200ms, from 2 characters.
  - **Customers:** the customers list filtered client-side, from 2 characters.
  - **Sale #:** input matching `/^#?S?-?\d+$/` offers "Open sale #N" → `/sales/N`.
- Arrow keys and Enter, Escape closes; `role="combobox"`/listbox semantics.
- [ ] Tests: Ctrl+K opens; typing filters pages; Enter navigates (mock `useRouter`); product results come from the search endpoint (mock fetch); a sale-number shortcut is offered; role-restricted pages and actions are absent for staff.
- [ ] Implement, test, commit.

### Task 10: Help panel (replaces GuidanceBar) + Dashboard setup checklist

**Files:**
- Create `components/shell/HelpPanel.tsx`, `components/shell/HelpButton.tsx` (+tests).
- Modify `components/layout/GuidanceBar.tsx` so its hint logic is exported as `useWorkflowHints()`; remove the bar from the layout.
- Modify `app/(protected)/dashboard/DashboardPageClient.tsx` to show the setup checklist until setup is done.

What it does:
- HelpButton is a "?" icon with a dot when `useWorkflowHints()` has undismissed items.
- It opens HelpPanel: a right sheet on desktop, a bottom sheet on phone. The panel lists the current to-dos (same dismiss logic and localStorage key as today) and short "how this page works" text from a small map of route → tips.
- [ ] Tests: the dot appears when hints exist; dismiss works; the checklist shows on the Dashboard before the first received purchase.
- [ ] Implement, test, commit.

### Task 11: `AppShell` + page transitions; retire `Nav`

**Files:**
- Create `components/shell/AppShell.tsx` (+test). Wrap the page content in React `<ViewTransition>` with a CSS enter/exit (fade + 8px rise, 220ms, defined in `globals.css` via `::view-transition-*` and `view-transition-class`), and a reversed slide for `nav-back` transition types. Do not use `template.tsx` for this.
- Modify `app/(protected)/layout.tsx` to render `<AppShell role username>{children}</AppShell>`.
- Delete `components/layout/Nav.tsx` and `Nav.test.tsx`. Port their role assertions into the `navModel` tests first.

Layout:
- Desktop: sidebar left, TopBar sticky; content `max-w-[1400px]`.
- Phone: TopBar sticky, content `pb-24` for the TabBar.
- The shell is hidden in print (`print:hidden`) so receipts and labels still print alone.
- Respect reduced motion: a plain div.
- [ ] Tests: the shell renders the sidebar (desktop mock) or the tab bar (phone mock); children render; the role's groups show.
- [ ] Run the **full** vitest suite. Fix tests that queried the old `Nav` text by role or label, then commit `feat(ui): app shell with grouped navigation and page transitions`.

**Wave 2 exit:** full suite green; the app runs with the new shell on all routes.

---

## Wave 3 — Screens onto the template (one agent per group, two at a time)

Every screen in a group gets the same treatment. Checklist per screen:
1. Wrap it in `<Page>` with title, description, `primaryAction` (the single main action), `secondaryActions`, and `back` for detail pages. Remove `PageHeader`.
2. Filters and search go into `<Toolbar>`, with an active filter count.
3. Tabular data uses `DataTable` with `money` columns and `rowHref` instead of row "Open →" buttons. Card-grid screens (Products, Suppliers, Customers, Stock) keep cards on desktop as the default view, with `motion` list stagger.
4. Loading, empty and error states use `LoadingState`, `EmptyState` and `ErrorState onRetry={refetch}`.
5. Detail pages get a header stat strip, then tabs (`components/ui/Tabs.tsx`, created by the first group that needs it, with an animated `layoutId="tab-underline"` indicator) instead of long card stacks.
6. Every `window.confirm`/`window.prompt` becomes `useConfirm`. Every money string goes through `formatRwf`.
7. Long forms in dialogs move their Save/Cancel into the Dialog `footer`.
8. Update the screen's tests to the new markup (same behaviours asserted), and add one phone-layout test per list screen.

### Task 12: Sell group
- Checkout (phone: the cart becomes a bottom drawer with a sticky total bar "3 items · RWF 245,000 · Pay →"; Pay opens the PaymentPanel full-height sheet; a success check-mark animation on sale complete; desktop layout unchanged apart from Page/Toolbar)
- Sales list and sale detail (tabs: Lines · Payments · Returns · Movements)
- Close day
- Customers and customer detail (tabs: Overview · Sales · Payments · Statement)
- Debts (the aging totals as stat strip, the two tabs kept)

### Task 13: Stock group
- Products list (the grid/list view toggle in the Toolbar) and product detail (tabs: Overview · Pricing · Stock & movements · Shop use · Specs)
- Stock overview, Movements, Scan, Unit detail
- Shop use and asset detail (the asset timeline stays a timeline)

### Task 14: Buy group
- Purchases list and the purchase workspace: header with stepper; items as a `DataTable` (phone cards); the add-item modes stay, inside the Page; the summary as a sticky side card on desktop and a sticky bottom bar on phone with Receive.
- Purchase scan page
- Suppliers

### Task 15: Money and Admin group
- **Dashboard:**
  - The Overview/Money chain/People tabs use the shared `Tabs`.
  - Stat-card numbers count up (`useCountUp` in `lib/motion.ts`; reduced motion shows the final value).
  - The waterfall bars grow in sequence.
  - The period picker goes in the Toolbar.
- Expenses, Employees, Settings, Setup/import, Notifications

Each Wave 3 task ends with: the group's tests, then a full vitest run, `tsc`, `eslint`, commit.

---

## Wave 4 — Polish

### Task 16: Shared-element transitions + consistency pass
- Shared-element morphs with React `<ViewTransition name="product-<id>">` on the list card title/thumbnail and the matching detail header, for products, customers, sales and shop assets. Back links use `transitionTypes={['nav-back']}`.
- Remove `PageHeader` and the old `Table` once unused (grep first). Unify toast placement: bottom-centre on phone above the TabBar, top-right on desktop, slide and stack.
- Button press feedback: `whileTap={{ scale: 0.97 }}` in `Button`.
- [ ] Full vitest, `tsc`, `eslint`, commit.

### Task 17: E2E + screenshots
- Update the Playwright specs for the new shell (nav by role, `getByRole("navigation")`).
- Add viewport projects for phone (390×844) and desktop (1280×800).
- Flows: login → sale → purchase receive → dashboard.
- Capture screenshots of every main route at both sizes into `test-results/ui-review/` for the owner's review. This runs against the dev server and Docker backend in the main session, not in agents.
