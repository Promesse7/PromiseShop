# Frontend Phase 9: Expense Entry — Design

## Context

Unlike every prior phase, **there is no mockup screen for this one.** The interactive mockup
bundle's dashboard screen (`1m`) carries its own footnote acknowledging the gap directly: "Tax &
detailed expense breakdowns: planned follow-on phase (placeholder in nav when it lands)." The
original design docx describes the underlying business need — an Admin logs rent, utilities,
salaries, repairs, and other operating expenses — but specifies no layout, fields beyond the
schema, or interaction pattern. This phase is therefore a **small original design pass**, not a
pixel port: it must read as part of the same "Nocturne" design system as every other screen (same
tokens, same `ui/` component set, same information density) rather than a bolt-on, but nothing here
was copied from a mockup screenshot because none exists.

The backend (`finance.Expense`) is already fully built — no backend changes are needed for this
phase, same as every prior phase. This phase runs in parallel with one sibling phase (Purchasing,
covering mockups `2a`/`2b`/`2c`/`1o`) building unrelated, non-overlapping screens.

## What was designed vs. ported

Everything in this phase was designed fresh, using the already-built Suppliers/Customers/Employees
screens (Frontend Phase 5) as the closest structural and visual template — same
list-with-toolbar-and-create/edit-dialog shape, same spacing, same component reuse. Nothing here
claims mockup fidelity; the "Decisions" below are original-design choices, not deviations from a
source screen.

## Decisions made

Running autonomously (no live user to brainstorm with), the same discipline every prior phase used
applies here: keep scope proportional, reuse existing patterns over inventing new ones, and
document every non-obvious choice.

1. **Gated strictly to `role === "admin"`, reusing the existing `STRICT_ADMIN_ROLES` mechanism
   Phase 5 introduced for Employees** (`components/layout/Nav.tsx`), rather than the inline
   `role === "admin"` conditional JSX block Phase 6 used for Notifications. Both patterns already
   coexist in `Nav.tsx`; `STRICT_ADMIN_ROLES` was chosen because it's centralized, already
   unit-tested via `getNavLinksForRole`, and Expenses is architecturally identical to Employees (an
   `IsAdmin`-gated directory-style CRUD screen) — extending the same array to append both
   `/employees` and `/expenses` keeps strict-admin gating in one place instead of splitting it a
   third way. `ExpenseViewSet`'s permission is `IsAdmin` (`backend/accounts/permissions.py`), which
   checks `role == "admin"` literally — a Manager gets a hard 403, same gotcha as Employees,
   Dashboard, and Notifications elsewhere in this app.
2. **The page and `useExpenses` hook follow the exact `isAdmin`/`enabled` gating pattern Phase 5
   established for Employees**, not a post-fetch 403 handler: `app/(protected)/expenses/page.tsx`
   reads `getSession()` server-side and passes `isAdmin={session?.role === "admin"}`;
   `useExpenses(enabled)` never issues the `IsAdmin`-gated request at all when `enabled` is
   `false`. A non-admin sees `AdminOnlyNotice` (a page-local component, mirroring Employees' and
   Dashboard's own page-local copies rather than a shared component neither of those phases
   bothered to extract).
3. **Category filtering uses the existing `SegmentedToggle` component with 6 options (All + the 5
   fixed categories), not a native `<select>`.** `SegmentedToggle` already supports an arbitrary
   options array (Stock's All/Low-out/Serialized toggle already uses 3); since `Expense.category`
   is a small fixed enum (not an open-ended, growing set like Product categories, which use tab
   buttons built from a fetched list instead), a segmented toggle is the closer fit and reuses an
   existing primitive rather than introducing a new filter pattern.
4. **Category filtering is client-side, not the backend's `?category=` query param.** Matches every
   other list screen in this codebase (Suppliers/Customers' search, Catalog's status/category
   filters) — the expense list is fetched in full via `fetchAllPages` and filtered in memory, same
   "hundreds not millions of rows" scale reasoning, and keeps the `["expenses"]` query key stable
   regardless of which filter is active (no re-fetch on toggle).
5. **A small "Total (filtered)" stat card sits above the table**, summing the currently-visible
   (post-filter) expenses client-side. This is a proportional, optional addition — not a full
   category-breakdown dashboard (that already exists in a different shape via the Dashboard phase's
   unused `financial-snapshot` endpoint, which this phase intentionally does not touch or extend).
   Kept to one number to avoid duplicating dashboard-scoped work.
6. **Edit is included; Delete is not.** `ExpenseViewSet` supports both `PATCH` and `DELETE`, but
   Phase 5 explicitly left delete out of every directory screen "matching Catalog's own precedent of
   not building an affordance the mockup doesn't show" — with no mockup at all here, the same
   caution applies by extension: nothing in the docx or dashboard footnote calls for a delete
   affordance, so it's left out. Edit is included because every other CRUD screen in this codebase
   treats create/edit as one shared form, and `PATCH` is trivial to wire once the dialog exists.
7. **`recorded_by` renders as `Employee #<id>`, not a resolved name.** Same choice Stock/Equipment
   (Phase 4) made for `changed_by` on equipment status history — avoids coupling this phase to the
   Employees phase's own data for a secondary, non-primary field.
8. **Amount fields use the `Field` component's `type="number"` input directly (matching
   `SetPriceDialog`'s retail/wholesale price fields), not a currency-formatted input.** Formatting
   happens only at render time in the table and the total-stat card (`RWF 123,456`), matching how
   every other price/amount value in this codebase is formatted.

## Architecture

```
frontend/
  app/(protected)/
    expenses/
      page.tsx                  — server: getSession(), passes isAdmin = role === "admin"
      ExpensesPageClient.tsx    — original design, no mockup screen
  components/
    expenses/
      ExpenseTable.tsx
      ExpenseFormDialog.tsx
      AdminOnlyNotice.tsx
  lib/
    expenses/
      useExpenses.ts            — enabled-gated useQuery, query key ["expenses"]
      expenseForm.ts            — form values/payload/validation + EXPENSE_CATEGORIES constant
  components/layout/Nav.tsx     — additive: STRICT_ADMIN_ROLES branch now appends both
                                   /employees and /expenses
  lib/types.ts                  — additive: ExpenseCategory, Expense
```

`useExpenses(enabled)` mirrors `useEmployees(enabled)` exactly (Phase 5 precedent) — same shape,
same `isLoading = enabled && query.isLoading` guard so a disabled query never reports "loading."

## Expenses screen

`ExpensesPageClient` (client component) receives `isAdmin` from the server page. When `!isAdmin`,
renders `AdminOnlyNotice` immediately — but `useExpenses(isAdmin)` and every other hook are still
called unconditionally above that branch (React's rules of hooks — this was a real lint error,
`react-hooks/rules-of-hooks`, caught and fixed in the Notifications phase's page client during this
same session's post-merge review; this phase avoids repeating it by calling all hooks before any
conditional return).

When admin: header row (heading, "Admin only" tag, category `SegmentedToggle`, "+ New expense"
button), a "Total (filtered)" stat card, the expense table (Date, Category tag, Amount, Description
with a `—` fallback, Recorded by, Edit), and `ExpenseFormDialog`. Table rows sorted by the backend's
default ordering (`-expense_date, -expense_id` — most recent first, already server-side, no
client-side re-sort needed).

`ExpenseFormDialog` fields: category (select, required), amount (number, required, must be > 0 —
mirrors the backend's `min_value=0.01` validation client-side so the error surfaces immediately
rather than round-tripping), expense date (date input, defaults to today on create), description
(optional `<textarea>`, matching `ProductFormDialog`'s free-text fields). Follows the exact
keyed-inner-component dialog pattern fixed everywhere else this session
(`SupplierFormDialog`/`ProductFormDialog`/etc.) — initial state computed via `useState(() => ...)`,
remounted via a `key` derived from `mode` + id, **not** a `useEffect` calling `setState` (the
`react-hooks/set-state-in-effect` lint error every other dialog in this codebase was fixed for
during this session's post-merge review).

## Error handling

Reuses every established pattern — no new mechanism: field-level `400` errors map to per-field
messages; `403`/`404`/`5xx`/network failure → toast via `useToast()`, dialog stays open with the
form intact; the admin-only gate avoids ever triggering a 403 in the first place (Decision 2), same
as Employees.

## Testing

**Vitest + RTL:** `useExpenses` (fetch + shape, the `enabled` gate), `expenseForm` (empty values
defaulting to today's date, value-mapping from a fetched record, payload building with
trim/null-coalescing, validation for category/amount/date), `ExpenseTable` (row rendering including
the description fallback, empty state, Edit callback), `ExpenseFormDialog` (create payload shape,
edit pre-fill + PATCH payload shape, validation-blocks-submit), `ExpensesPageClient` (admin-only
gating never fetching, fetched-list + total rendering, category-filter behavior updating the total,
dialog open/pre-fill), and `Nav`/`getNavLinksForRole` (updated for the appended Expenses link,
admin-vs-manager split).

**Playwright e2e:** one smoke test file (`e2e/expenses.spec.ts`) covering two flows proportional to
this phase's scope: admin records an expense and sees it reflected in the list; sales staff do not
see the Expenses nav link at all (mirrors Notifications' e2e pattern for its own admin-only link).

## Out of scope for this phase

- Any UI for the Dashboard's existing `financial-snapshot` endpoint (VAT, net-margin, overhead
  allocation) — that's the mockup's `3a`/`3b`/`3c` track, which requires business decisions
  (overhead-allocation methodology, VAT rate/regime, target-margin policy) the docx itself defers
  as "Phase 2" and this session's gap analysis explicitly excluded from blind implementation.
- Deleting expense records (Decision 6).
- A shared `AdminOnlyNotice` component — three phases now each have their own page-local copy
  (Employees, Dashboard, Expenses); extracting one is a reasonable follow-up but out of scope here,
  same standing note Catalog's own review left about a reusable `QueryGate`.
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
