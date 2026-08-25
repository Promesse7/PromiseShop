# Frontend Phase 5: Directory (Suppliers, Customers & Employees) — Design

## Context

Frontend Phases 1-3 (Foundation, Sales/Checkout, Catalog) are complete and merged to `main`. This
phase — Directory — builds three screens the backend already fully supports but the frontend has
never had UI for: Suppliers (mockup `1i`), Customers (mockup `1j`), and Employees & roles (mockup
`1k`). All three are simple CRUD directories bundled into one phase because they share almost
identical shape (a searchable/browsable table + a create/edit dialog) and none depends on the
others. This phase runs in parallel with three sibling phases (Stock/Equipment, Notifications,
Dashboard) building other non-overlapping screens from the same mockup set.

The backend for all three already exists in full: `purchasing.Supplier` / `sales.Customer` /
`accounts.Employee`, each with a `ModelViewSet` — no backend changes are needed for this phase.

## Decisions made

Running autonomously (no live user to brainstorm with), ambiguities below are resolved the way
prior phases resolved theirs: prefer real backend behavior over the mockup's literal assumptions,
document every deviation.

1. **Suppliers' "POs" and "Total purchased (2026)" columns are dropped, not faked.** The mockup
   shows a per-supplier purchase-order count and total, but there is no backend aggregate for
   either, and Purchasing itself remains deferred pending backend rework — building a client-side
   join against an unbuilt domain isn't feasible. Matches this phase's standing "no backend
   changes" rule and Catalog's own precedent (Decision 1: a mockup affordance with no backing data
   becomes an honest omission, not a placeholder that would look real).
2. **Customers' "Purchases" count, "Last sale" column, and "Sales" link are dropped for the same
   reason** — no `?customer=` filter on `/sales/`, and joining the full unbounded sales list per
   customer for a directory screen was judged disproportionate to this phase's scope (unlike the
   Dashboard phase, which does do this kind of full-list client aggregation, because its whole
   purpose is period aggregates). The walk-in-sale note from the mockup ("Walk-in sales need no
   customer record") is kept verbatim since it costs nothing and clarifies the screen's purpose.
3. **The backend's `Customer.name` is nullable/blank-able (a walk-in sale has no customer at all),
   but the create/edit form requires a name.** A directory record you're deliberately creating in
   this screen is pointless with no identifying information — the backend's leniency exists for
   the *sale* flow (Phase 2, already built), not for this screen.
4. **Suppliers and Customers both get a functional "Edit" affordance even though the mockup shows
   only "+ New X".** The backend supports `PATCH` on both, the create/edit dialog is nearly free to
   extend once built (same pattern as Catalog's `ProductFormDialog`), and every other CRUD screen
   in this codebase treats create/edit as one shared form — omitting edit here would be an
   inconsistency with no real justification.
5. **Suppliers is admin/manager-only in the nav (added to `ADMIN_LINKS`); Customers is visible to
   every role (added to both `STAFF_LINKS` and `ADMIN_LINKS`).** Suppliers relates to Purchasing, a
   still-deferred admin-facing domain. Customers relates to Sales, which every role touches via
   Checkout (Phase 2) — Sales Staff and Technicians are the ones actually taking walk-in customer
   info at the register, so hiding this screen from them would be backwards. Both endpoints are
   `IsAuthenticated` only, so this is a UI-only navigational grouping, not an access-control
   boundary — matches Catalog's Decision 7 precedent (UI gating that doesn't mirror a backend
   permission 1:1).
6. **Employees is gated strictly to `role === "admin"`, not the app's usual `ADMIN_ROLES =
   ["admin", "manager"]`.** `EmployeeViewSet`'s permission is `IsAdmin`
   (`backend/accounts/permissions.py`), which checks the role literally — a Manager gets a hard
   403. This is a real, pre-existing gap: `Nav.tsx` previously showed `/employees` to managers too
   (inherited from `ADMIN_LINKS`, which is otherwise correctly admin+manager-shared for every other
   entry). This phase fixes it surgically: the Employees link is appended to the nav's admin list
   only for the strict-admin role, via a new `STRICT_ADMIN_ROLES` constant kept separate from
   `ADMIN_ROLES` — every other `ADMIN_LINKS` entry (Dashboard, Sales, Purchases, Stock, Suppliers,
   Customers) stays admin+manager-shared since those backends really are `IsAuthenticated`/shared.
   The Employees *page* independently checks `session.role === "admin"` server-side and renders an
   `AdminOnlyNotice` instead of ever calling `useEmployees` for a non-admin — no raw 403, no
   wasted fetch.
7. **The Employee edit form allows setting a new password (optional) alongside every other
   field.** The backend's `EmployeeSerializer.password` is a required `CharField` at the model
   level, but `ModelViewSet.partial_update` (what `PATCH` maps to) runs with `partial=True`, which
   DRF treats as "only validate fields actually present" — so a `PATCH` omitting `password` is
   valid and the existing hash is left untouched (confirmed directly in
   `EmployeeSerializer.update()`, which does `validated_data.pop("password", None)`). The dialog
   surfaces this as "New password (leave blank to keep current)" rather than forcing a re-entry on
   every edit.
8. **"Hired" (mockup: "Jan 2023") is a client-side format of the stored `hire_date` (an ISO date),
   not a separate stored field.**

## Architecture

```
frontend/
  app/(protected)/
    suppliers/
      page.tsx                        — server: no session gating needed (IsAuthenticated backend)
      SuppliersPageClient.tsx          — mockup 1i
    customers/
      page.tsx
      CustomersPageClient.tsx          — mockup 1j
    employees/
      page.tsx                        — server: getSession(), passes isAdmin = role === "admin"
      EmployeesPageClient.tsx          — mockup 1k, admin-only
  components/
    suppliers/  SupplierTable.tsx, SupplierFormDialog.tsx
    customers/  CustomerTable.tsx, CustomerFormDialog.tsx
    employees/  EmployeeTable.tsx, EmployeeFormDialog.tsx, AdminOnlyNotice.tsx
  lib/
    suppliers/  useSuppliers.ts, supplierForm.ts
    customers/  useCustomers.ts, customerForm.ts
    employees/  useEmployees.ts, employeeForm.ts
  components/layout/Nav.tsx            — additive: /suppliers, /customers links; Employees
                                          moved to a strict-admin-only append
  lib/types.ts                         — additive: Supplier, Customer, EmployeeStatus, Employee
```

Each `lib/<domain>/use<Domain>s.ts` hook is a thin `useQuery` over `fetchAllPages("<domain>/")`
with its own query key (`["suppliers"]`, `["customers"]`, `["employees"]`) — no cross-domain join
is needed (unlike Catalog's `useCatalogProducts`), since none of these three lists needs data from
another endpoint after Decisions 1-2 dropped the cross-domain aggregate columns.
`useEmployees(enabled)` takes an `enabled` flag so the Employees page never issues the `IsAdmin`
-gated request at all for a non-admin viewer (rather than issuing it and swallowing the 403).

## Suppliers (`1i`)

`SuppliersPageClient` fetches via `useSuppliers()`, filters client-side by name/contact/phone/email
substring match (same client-search pattern as Catalog's `useCatalogProducts` — the supplier list
is small, same "hundreds not millions" scale reasoning). Table columns: Supplier (name + address as
a sub-line), Contact person, Phone, Email, Edit (Decision 4) — POs/Total purchased dropped
(Decision 1). "+ New supplier" opens `SupplierFormDialog` in create mode; each row's "Edit" opens it
pre-filled in edit mode. Fields: `name` (required), `contact_person`, `phone`, `email`, `address`
(all optional, blank → `null` on submit). Submit invalidates `["suppliers"]`.

## Customers (`1j`)

Same shape as Suppliers: `CustomersPageClient` + `useCustomers()`, client-side search over
name/phone (matching the mockup's "Search name or phone…" placeholder). Table columns: Customer,
Phone, Email, Edit — Purchases/Last sale/Sales-link dropped (Decision 2). The mockup's walk-in note
is rendered verbatim below the table. `name` is required in the form despite being optional on the
backend (Decision 3).

## Employees (`1k`)

`app/(protected)/employees/page.tsx` reads `getSession()` server-side and passes
`isAdmin={session?.role === "admin"}` to `EmployeesPageClient`. When `!isAdmin`, the client renders
`AdminOnlyNotice` and never calls `useEmployees` (its `enabled` flag stays `false`) — no fetch, no
403 (Decision 6). When admin, the full screen renders: table (Name, Role tag, Username (mono),
Contact, Hired (formatted `hire_date`, Decision 8), Status tag, Edit), the mockup's "Admin only" tag
next to the heading, and its accountability-trail caption. "+ New employee" / "Edit" open
`EmployeeFormDialog` with fields: `full_name`, `role` (select), `username`, password (required on
create, optional "leave blank to keep current" on edit — Decision 7), `phone`, `email`, `hire_date`
(date input, required), `status` (select: active/inactive/terminated). Submit invalidates
`["employees"]`.

## Nav.tsx changes

- `STAFF_LINKS` gains `{ href: "/customers", label: "Customers" }`.
- `ADMIN_LINKS` gains `{ href: "/suppliers", label: "Suppliers" }` and
  `{ href: "/customers", label: "Customers" }`; `{ href: "/employees", label: "Employees" }` is
  **removed** from this shared array.
- A new `STRICT_ADMIN_ROLES = ["admin"]` constant, separate from the existing
  `ADMIN_ROLES = ["admin", "manager"]`. `getNavLinksForRole` appends the Employees link only when
  `STRICT_ADMIN_ROLES.includes(role)` — every other admin-list entry stays admin+manager-shared.

This is a small, additive, surgical diff to a file another parallel phase (Notifications) also
edits to add its own link — a trivial merge conflict is expected and gets resolved manually when
all four phase branches are merged.

## Error handling

Reuses every established pattern from Catalog — no new mechanism:
- Field-level `400` validation errors map to per-field messages (DRF's `{"field": ["message"]}`
  shape).
- `403`/`404`/`5xx`/network failure → toast via `useToast()`, dialog stays open with the form
  intact.
- Employees specifically avoids ever triggering a 403 in the first place by gating the fetch itself
  (Decision 6), rather than handling the error after the fact.

## Testing

**Vitest + RTL:** each `use<Domain>s` hook (fetch + shape, plus `useEmployees`'s `enabled` gate),
each `<domain>Form` helper module (empty values, value-mapping from a fetched record, payload
building including trim/null-coalescing, validation — including Employee's create-vs-edit password
requirement difference), each Table component (row rendering, empty state, Edit callback), each
FormDialog (create payload shape, edit pre-fill + PATCH payload shape, validation-blocks-submit),
each PageClient (fetched-list rendering, search filtering, dialog open/pre-fill), and `Nav`/
`getNavLinksForRole` (updated for the new Suppliers/Customers links and the admin-vs-manager
Employees split).

**Playwright e2e:** one smoke test file (`e2e/directory.spec.ts`) covering three flows proportional
to this phase's scope: admin creates a supplier and sees it listed; admin creates a customer and
sees it listed; admin sees the Employees screen (manager-sees-notice is covered at the unit level
via `EmployeesPageClient`'s `isAdmin` prop, not re-verified at the e2e level to keep the smoke
suite proportional).

## Out of scope for this phase

- Supplier/customer purchase-history aggregates (Decisions 1-2) — revisit only once Purchasing's
  backend rework lands and a real per-supplier/customer aggregate endpoint exists.
- Deleting suppliers/customers/employees (all three backends support `DELETE`, but nothing in the
  mockups exposes it, matching Catalog's own precedent of not building an affordance the mockup
  doesn't show).
- Employee self-service (password reset, profile edit by the employee themselves) — this screen is
  entirely admin-managing-others, matching mockup `1k`'s framing.
- Real i18n, motion-spec animations — same standing deferrals as every prior phase.
