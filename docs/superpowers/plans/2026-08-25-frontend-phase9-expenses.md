# Frontend Phase 9: Expense Entry Implementation Plan

See the design doc (`docs/superpowers/specs/2026-08-25-frontend-phase9-expenses-design.md`) for
full context, decisions, and rationale. This plan follows the same TDD task structure as every
prior phase's plan (write failing tests → verify fail → minimal implementation → verify pass →
commit), executed task-by-task below. Test code for each task is committed in full in its own file
(listed per task) rather than re-transcribed here.

## Global constraints

- No backend changes (`backend/finance/*` already fully supports this phase).
- Reuse `ui/` primitives (`Button`, `Card`/`CardKicker`, `Field`, `Tag`, `Table`, `Dialog`,
  `SegmentedToggle`) — no new primitives.
- Every create/edit dialog uses the keyed-inner-component pattern (`useState(() => ...)` + `key`
  remount), never a `useEffect` calling `setState`.
- `lib/types.ts` and `components/layout/Nav.tsx` edits are additive only.

## Task 1: `lib/types.ts` — `ExpenseCategory` / `Expense` types

- Step 1-4: Types are compile-time only — verified by every downstream file's `tsc --noEmit` pass,
  not a standalone test.
- Step 5: Committed as part of Task 2 (the first file that consumes the types).

## Task 2: `expenseForm.ts` — form values, payload, validation, category constant

- Step 1: `lib/expenses/expenseForm.test.ts` — empty-values shape (today's date default,
  no category), value-mapping from a fetched `Expense` (null description → empty string), payload
  building (trim, blank description → `null`), validation (category required, amount must be a
  positive number, date required).
- Step 2: Run `npx vitest run lib/expenses/expenseForm.test.ts` before the implementation exists →
  fails (module not found).
- Step 3: `lib/expenses/expenseForm.ts` — `EXPENSE_CATEGORIES`, `emptyExpenseFormValues`,
  `expenseFormValuesFromExpense`, `buildExpensePayload`, `validateExpenseForm`.
- Step 4: Re-run → passes.
- Step 5: Commit — types + form helpers together.

## Task 3: `useExpenses` hook

- Step 1: `lib/expenses/useExpenses.test.tsx` — fetches and exposes the list when `enabled=true`;
  issues no request at all when `enabled=false`.
- Step 2: Run → fails (module not found).
- Step 3: `lib/expenses/useExpenses.ts` — `useQuery` over `fetchAllPages("expenses/")`, query key
  `["expenses"]`, mirroring `useEmployees(enabled)`'s exact shape.
- Step 4: Re-run → passes.
- Step 5: Commit.

## Task 4: `ExpenseTable` component

- Step 1: `components/expenses/ExpenseTable.test.tsx` — renders category label/formatted
  amount/description fallback, empty state, `onEdit` callback.
- Step 2: Run → fails (module not found).
- Step 3: `components/expenses/ExpenseTable.tsx`.
- Step 4: Re-run → passes.
- Step 5: Commit.

## Task 5: `ExpenseFormDialog` component

- Step 1: `components/expenses/ExpenseFormDialog.test.tsx` — create payload shape, edit
  pre-fill + PATCH payload shape, validation blocks submit and shows both category and amount
  errors.
- Step 2: Run → fails (module not found).
- Step 3: `components/expenses/ExpenseFormDialog.tsx` — keyed-remount pattern, category `<select>`,
  amount/date `Field`s, description `<textarea>`.
- Step 4: Re-run → passes.
- Step 5: Commit.

## Task 6: `AdminOnlyNotice` + `ExpensesPageClient` + page

- Step 1: `app/(protected)/expenses/ExpensesPageClient.test.tsx` — admin-only notice + zero fetch
  when not admin; fetched list + combined total for admin; category filter narrows both the table
  and the total; create/edit dialog open + pre-fill.
- Step 2: Run → fails (module not found).
- Step 3: `components/expenses/AdminOnlyNotice.tsx`, `app/(protected)/expenses/ExpensesPageClient.tsx`
  (all hooks called unconditionally before the `!isAdmin` branch — see design doc's note on the
  Notifications phase's `rules-of-hooks` lint fix), `app/(protected)/expenses/page.tsx`.
- Step 4: Re-run → passes.
- Step 5: Commit.

## Task 7: `Nav.tsx` — Expenses link

- Step 1: Update `components/layout/Nav.test.tsx` — `getNavLinksForRole("admin")` now includes
  `/expenses` appended after `/employees`; `getNavLinksForRole("manager")` still excludes both;
  `<Nav role="admin">` renders an "Expenses" link, `<Nav role="manager">` does not.
- Step 2: Run → fails (assertions expect a link that doesn't exist yet).
- Step 3: Extend the existing `STRICT_ADMIN_ROLES` branch in `getNavLinksForRole` to append both
  `{ href: "/employees", ... }` and `{ href: "/expenses", ... }`.
- Step 4: Re-run → passes.
- Step 5: Commit.

## Task 8: e2e smoke test

- Step 1/3: `e2e/expenses.spec.ts` — admin records an expense and sees it listed; sales staff don't
  see the Expenses nav link. Written but **not executed** in this worktree (shared port/dev-database
  across the two parallel phases building this round — verification happens once, after merge, in
  the orchestrating session).
- Step 5: Commit.

## Task 9: Full verification

- `npm test` (full suite, not just this phase's new files) — must show zero regressions.
- `npm run lint` — zero errors.
- `npx tsc --noEmit` — zero errors.
- Commit any fixes these surface, then give the final report.
