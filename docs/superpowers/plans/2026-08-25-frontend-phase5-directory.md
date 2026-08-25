# Frontend Phase 5: Directory Implementation Plan

See `docs/superpowers/specs/2026-08-25-frontend-phase5-directory-design.md` for full context and
decisions. This plan follows the same TDD discipline as Phase 3's plan (write failing test → verify
fails → minimal implementation → verify passes → commit), grouped into three independent tracks
(Suppliers, Customers, Employees) plus a shared Nav.tsx task. Each track is self-contained and could
be committed independently.

## Global constraints

- No backend changes. All three entities' endpoints already exist and are used as documented in
  the design doc.
- `lib/types.ts` edits are additive only (`Supplier`, `Customer`, `EmployeeStatus`, `Employee`
  appended at the end) — this file is also touched by sibling phases running in parallel.
- Every hook/component/dialog mirrors the exact structural pattern already established by
  `lib/products/useCatalogProducts.ts`, `components/products/ProductFormDialog.tsx`, and
  `components/products/ProductTable.tsx` (read directly before writing each equivalent).

## Task 1: Shared types

- **Step 1**: Append `Supplier`, `Customer`, `EmployeeStatus`, `Employee` interfaces to
  `lib/types.ts`, matching the backend serializers' field sets exactly (`SupplierSerializer`,
  `CustomerSerializer`, `EmployeeSerializer`).
- **Step 2**: No test for a pure type file; verified by every downstream test compiling.
- **Step 3**: Commit alongside Task 2 (first hook that consumes them).

## Task 2: Suppliers — `useSuppliers` hook

- **Step 1**: Write `lib/suppliers/useSuppliers.test.tsx` — mocks `fetch` for `/suppliers/`
  (paginated), asserts the hook exposes `all`/`isLoading`/`isError` and that `all` matches the
  fetched rows verbatim (no join needed, unlike Catalog).
- **Step 2**: Run `npx vitest run lib/suppliers/useSuppliers.test.tsx` — fails (module doesn't
  exist).
- **Step 3**: Implement `lib/suppliers/useSuppliers.ts` — a single `useQuery({queryKey: ["suppliers"], queryFn: () => fetchAllPages<Supplier>("suppliers/")})`.
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add useSuppliers hook + Supplier/Customer/Employee types."

## Task 3: Suppliers — `supplierForm` helpers

- **Step 1**: Write `lib/suppliers/supplierForm.test.ts` — empty-values shape, `Supplier` →
  form-values mapping (nulls become `""`), payload building (trim, blank → `null`), validation
  (name required).
- **Step 2**: Run — fails.
- **Step 3**: Implement `lib/suppliers/supplierForm.ts` (`emptySupplierFormValues`,
  `supplierFormValuesFromSupplier`, `buildSupplierPayload`, `validateSupplierForm`).
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add supplierForm payload/validation helpers."

## Task 4: Suppliers — `SupplierTable` + `SupplierFormDialog`

- **Step 1**: Write `components/suppliers/SupplierTable.test.tsx` (row rendering incl. address
  sub-line, `—` fallback for null contact fields, empty state, Edit callback) and
  `components/suppliers/SupplierFormDialog.test.tsx` (create submits `POST /suppliers/` with
  trimmed/nulled payload, edit pre-fills and `PATCH`es the right id, blank name blocks submit and
  shows the field error without calling `fetch`).
- **Step 2**: Run both — fail.
- **Step 3**: Implement `SupplierTable.tsx` (reuses `ui/Table`, `ui/Tag` not needed here — no
  status column) and `SupplierFormDialog.tsx` (mirrors `ProductFormDialog`'s
  state/validate/submit/toast/invalidate shape exactly, using `Field` for every input).
- **Step 4**: Re-run — pass.
- **Step 5**: Commit: "Add SupplierTable and SupplierFormDialog."

## Task 5: Suppliers — page

- **Step 1**: Write `app/(protected)/suppliers/SuppliersPageClient.test.tsx` — renders fetched
  list, search filters across name/contact/phone/email, "+ New supplier" opens the create dialog,
  clicking a row's Edit opens it pre-filled.
- **Step 2**: Run — fails.
- **Step 3**: Implement `SuppliersPageClient.tsx` (loading/error guards, `useMemo` client filter,
  toolbar, table, dialog wiring) and the trivial server `page.tsx`.
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add product list page (mockup 1i): Suppliers list, search, create/edit."

## Task 6: Customers — hook, form, table, dialog, page

Same five-step cycle as Tasks 2-5, applied to Customers:
- `lib/customers/useCustomers.ts` (+ test) — identical shape to `useSuppliers`.
- `lib/customers/customerForm.ts` (+ test) — identical shape to `supplierForm`, minus
  `contact_person`, with the Decision 3 name-required-in-UI note as a doc comment.
- `components/customers/CustomerTable.tsx` (+ test) — columns Customer/Phone/Email/Edit, `—`
  fallback.
- `components/customers/CustomerFormDialog.tsx` (+ test) — same shape as `SupplierFormDialog`.
- `app/(protected)/customers/CustomersPageClient.tsx` (+ test) + `page.tsx` — search over
  name/phone, renders the mockup's walk-in-sale note below the table.
- Commit: "Add product detail... " — actually: "Add Customers list page (mockup 1j): search,
  create/edit, walk-in note."

## Task 7: Employees — `useEmployees` hook (gated)

- **Step 1**: Write `lib/employees/useEmployees.test.tsx` — fetches and exposes the list when
  `enabled=true`; when `enabled=false`, `isLoading` is `false`, `all` is `[]`, and `fetch` is never
  called (this is the mechanism that keeps a manager from ever hitting the `IsAdmin`-gated
  endpoint).
- **Step 2**: Run — fails.
- **Step 3**: Implement `lib/employees/useEmployees.ts` — `useQuery({..., enabled})`.
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add useEmployees hook, gated by an explicit enabled flag."

## Task 8: Employees — `employeeForm` helpers

- **Step 1**: Write `lib/employees/employeeForm.test.ts` — value-mapping (password always blank on
  load), create-payload includes `password`, update-payload omits `password` when blank and
  includes it when typed, validation differs by mode (password required only on create).
- **Step 2**: Run — fails.
- **Step 3**: Implement `lib/employees/employeeForm.ts`.
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add employeeForm payload/validation helpers, mode-dependent password rule."

## Task 9: Employees — `EmployeeTable`, `AdminOnlyNotice`, `EmployeeFormDialog`

- **Step 1**: Write `components/employees/EmployeeTable.test.tsx` (role label + tag variant,
  formatted hire date, status tag, Edit callback, empty state) and
  `components/employees/EmployeeFormDialog.test.tsx` (create payload includes password; edit
  pre-fills with a blank password field and the PATCH omits `password` when left blank; all four
  always-required fields plus create-only password produce field errors and block submit).
  `AdminOnlyNotice` is trivial enough to skip a dedicated test (verified via
  `EmployeesPageClient.test.tsx` instead).
- **Step 2**: Run — fail.
- **Step 3**: Implement all three components (role/status `<select>`s, date input for `hire_date`,
  password `<Field type="password">`).
- **Step 4**: Re-run — pass.
- **Step 5**: Commit: "Add EmployeeTable, AdminOnlyNotice, EmployeeFormDialog."

## Task 10: Employees — page (admin-only gate)

- **Step 1**: Write `app/(protected)/employees/EmployeesPageClient.test.tsx` — `isAdmin=false`
  renders `AdminOnlyNotice` and calls `fetch` zero times; `isAdmin=true` renders the fetched table,
  the "Admin only" tag, opens create/edit dialogs correctly.
- **Step 2**: Run — fails.
- **Step 3**: Implement `EmployeesPageClient.tsx` (the `!isAdmin` early return is the whole gate)
  and the server `page.tsx` (`getSession()` → `isAdmin={session?.role === "admin"}`).
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Add Employees page (mockup 1k): admin-only gate, role/status management."

## Task 11: Nav.tsx — Suppliers/Customers links + Employees admin-only-not-manager fix

- **Step 1**: Update `components/layout/Nav.test.tsx`'s existing `getNavLinksForRole` assertions
  (the old test asserted `manager` output equals `admin` output verbatim — this is no longer true
  and must change to assert Suppliers/Customers appear for both but Employees appears only for
  admin) plus a new `Nav` render-level case for manager.
- **Step 2**: Run `npx vitest run components/layout/Nav.test.tsx` — fails against the old
  `Nav.tsx`.
- **Step 3**: Implement the `Nav.tsx` changes from the design doc (`STAFF_LINKS` gains Customers,
  `ADMIN_LINKS` gains Suppliers+Customers and loses the inline Employees entry, new
  `STRICT_ADMIN_ROLES` constant, `getNavLinksForRole` appends Employees conditionally).
- **Step 4**: Re-run — passes.
- **Step 5**: Commit: "Nav: add Suppliers/Customers links; gate Employees to admin, not manager."

## Task 12: e2e smoke test

- **Step 1**: Write `e2e/directory.spec.ts` — three flows: admin creates a supplier and sees it
  listed; admin creates a customer and sees it listed; admin sees the Employees screen and its
  "Admin only" tag (matching the existing `e2e/products.spec.ts` style: `getByLabel`/`getByRole`
  selectors, no test-id soup).
- **Step 2/4**: Not run in this worktree — shared port (3000) and dev database across four
  parallel phase worktrees; verification happens once, after all four phases are merged, in the
  orchestrating session.
- **Step 5**: Commit alongside Task 11 or its own commit: "Add directory e2e smoke test."

## Final step: full-suite verification

Run `npm test` (all Vitest files, not just this phase's) and `npm run lint` across the whole
worktree before considering the phase done — confirms no regression in Phases 1-3's existing tests
from the additive `lib/types.ts`/`Nav.tsx` edits.
