# Frontend Design System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every screen a consistent, less-flat visual hierarchy (glass-accented cards, a shared page header, an active-route nav) without changing the Nocturne color palette, any interaction, or any role gating.

**Architecture:** Three shared primitives change once — `Card` (new `variant="glass"`), `Nav` (sticky glass backdrop + active-route highlight), and a new `PageHeader` component. Every screen already composes these (or will be migrated to `PageHeader`), so the visual update propagates app-wide without a page-by-page redesign. `StatCards` (the dashboard KPI row Todo.md specifically reacted to) adopts the glass `Card` variant. Nine page clients get their duplicated ad hoc header markup replaced with `PageHeader`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind CSS, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-frontend-design-system-polish-design.md`

## Global Constraints

- Keep the existing Nocturne palette verbatim — no new `bg`/`accent` colors, no background gradient added to `<body>`. Every visual change is built from tokens already in `tailwind.config.ts` plus the new glow/glass tokens this plan adds.
- Glass treatment is opt-in per surface — dense data surfaces (tables, lists) stay solid. Only `Card` (for KPI/detail-style content) and `Nav` get glass treatment.
- No behavior changes — every existing interaction (filters, dialogs, links, role gating) stays exactly as it is. Every migration task's job is to keep its page's existing test file green, not to add new behavior.
- Full verification gate before this is done: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Scope note (narrowing one part of the spec)

The spec listed `products/[id]/ProductDetailPageClient.tsx` as a tentative `PageHeader` candidate, to be confirmed during implementation. Having now read it: its header is a detail-page pattern (breadcrumb back-link + title + status tag + barcode + trailing actions, using `h3` already), structurally different from the nine identical list-page toolbar headers below. Forcing it into the same `PageHeader` API would require growing that API well past what those nine pages need. **Excluded from this plan**, along with the other detail-style headers (`UnitDetailPageClient`, `PurchaseWorkspaceClient`) and `StockPageClient`'s second, sub-section header ("Serialized units" — not a page title). This matches the spec's own YAGNI instruction to stay focused.

---

### Task 1: `Card` gets a `glass` variant

**Files:**
- Modify: `frontend/tailwind.config.ts`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/components/ui/Card.tsx`
- Test: `frontend/components/ui/Card.test.tsx`

**Interfaces:**
- Produces: `Card` accepts `variant?: "solid" | "glass"` (default `"solid"`). Later tasks (`StatCards`) pass `variant="glass"`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/components/ui/Card.test.tsx` (append inside the existing `describe("Card", ...)` block, after the `"defaults to no elevation shadow"` test):

```tsx
  it("applies glass variant classes when variant is glass", () => {
    const { container } = render(<Card variant="glass">content</Card>);
    expect(container.firstChild).toHaveClass("glass");
    expect(container.firstChild).toHaveClass("glass-hover");
  });

  it("defaults to the solid variant (bg-surface, no glass class)", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass("bg-surface");
    expect(container.firstChild).not.toHaveClass("glass");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run components/ui/Card.test.tsx`
Expected: FAIL — `container.firstChild` doesn't have class `"glass"` (the `variant` prop doesn't exist yet).

- [ ] **Step 3: Add the glow shadow tokens and glass utilities**

In `frontend/tailwind.config.ts`, extend the existing `boxShadow` object (inside `theme.extend`):

```ts
      boxShadow: {
        sm: "0 0 0 1px #3f424d",
        md: "0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,0.55)",
        lg: "0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,0.65)",
        "glow-sm": "0 0 20px -4px rgba(145, 132, 217, 0.35)",
        "glow-md": "0 0 32px -6px rgba(145, 132, 217, 0.45)",
      },
```

In `frontend/app/globals.css`, add a new `@layer utilities` block at the end of the file (after the existing `@media print { ... }` block):

```css
@layer utilities {
  .glass {
    @apply bg-surface/70 backdrop-blur-md border border-divider;
  }
  .glass-hover {
    @apply hover:border-accent/40 hover:shadow-glow-sm transition-all duration-200;
  }
}
```

- [ ] **Step 4: Implement the `variant` prop on `Card`**

Replace the full contents of `frontend/components/ui/Card.tsx`'s `Card` function and its surrounding types with:

```tsx
import type { HTMLAttributes } from "react";

type CardVariant = "solid" | "glass";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: "sm" | "md" | "lg";
  variant?: CardVariant;
}

const elevationClasses = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

const variantClasses: Record<CardVariant, string> = {
  solid: "bg-surface",
  glass: "glass glass-hover",
};

export function Card({ elevation, variant = "solid", className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1.5 p-3 rounded-md",
        variantClasses[variant],
        elevation ? elevationClasses[elevation] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}
```

(Leave `CardKicker`, `CardTitle`, `CardBody`, `CardMeta` at the bottom of the file exactly as they are today — only the `Card` function and the types/consts above it change.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run components/ui/Card.test.tsx`
Expected: PASS (all 5 tests, including the 3 pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add frontend/tailwind.config.ts frontend/app/globals.css frontend/components/ui/Card.tsx frontend/components/ui/Card.test.tsx
git commit -m "Add glass variant to Card, plus glow shadow tokens"
```

---

### Task 2: New `PageHeader` component

**Files:**
- Create: `frontend/components/ui/PageHeader.tsx`
- Test: `frontend/components/ui/PageHeader.test.tsx`

**Interfaces:**
- Produces: `PageHeader({ title: string; subtitle?: string; children?: React.ReactNode })`. Renders `title` as an `h3`, an optional `subtitle` span, then `children` inline in the same flex row. Later tasks (3, and the page-migration tasks 5–13) import this from `@/components/ui/PageHeader`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/ui/PageHeader.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as a heading", () => {
    render(<PageHeader title="Products" />);
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
  });

  it("renders an optional subtitle next to the title", () => {
    render(<PageHeader title="Dashboard" subtitle="Monthly summary" />);
    expect(screen.getByText("Monthly summary")).toBeInTheDocument();
  });

  it("does not render a subtitle when omitted", () => {
    render(<PageHeader title="Products" />);
    expect(screen.queryByText("Monthly summary")).not.toBeInTheDocument();
  });

  it("renders children after the title, e.g. toolbar controls", () => {
    render(
      <PageHeader title="Products">
        <button type="button">+ New product</button>
      </PageHeader>
    );
    expect(screen.getByRole("button", { name: "+ New product" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/ui/PageHeader.test.tsx`
Expected: FAIL — cannot find module `./PageHeader`.

- [ ] **Step 3: Implement `PageHeader`**

Create `frontend/components/ui/PageHeader.tsx`:

```tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <h3 className="m-0">{title}</h3>
      {subtitle && <span className="text-sm text-text/50">{subtitle}</span>}
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run components/ui/PageHeader.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/ui/PageHeader.tsx frontend/components/ui/PageHeader.test.tsx
git commit -m "Add PageHeader: shared title/subtitle/toolbar row for page clients"
```

---

### Task 3: `Nav` — sticky glass backdrop + active-route highlighting

**Files:**
- Modify: `frontend/components/layout/Nav.tsx`
- Test: `frontend/components/layout/Nav.test.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: no prop/API change — `Nav`'s `{ role, username }` props are unchanged. Internal only: it becomes a client component (`usePathname`), and links get `aria-current="page"` when active.

- [ ] **Step 1: Write the failing tests**

In `frontend/components/layout/Nav.test.tsx`, add the mock and a `beforeEach` right after the existing imports (before the first `describe`):

```tsx
import { usePathname } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const mockedUsePathname = vi.mocked(usePathname);

beforeEach(() => {
  mockedUsePathname.mockReturnValue("/");
});
```

Update the import line at the top of the file to include `beforeEach`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
```

Then add these two tests inside the existing `describe("Nav", ...)` block (anywhere after the other `it` blocks):

```tsx
  it("marks the current route's link as active via aria-current, and leaves others unmarked", () => {
    mockedUsePathname.mockReturnValue("/products");
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("marks a link as active for a nested route under it", () => {
    mockedUsePathname.mockReturnValue("/products/42");
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run components/layout/Nav.test.tsx`
Expected: The two new tests FAIL (no `aria-current` attribute exists yet). The pre-existing tests should still pass at this point (the mock's default `"/"` doesn't match any real link, so nothing existing breaks by adding the mock alone) — if any pre-existing test unexpectedly fails, stop and re-check the mock setup before continuing.

- [ ] **Step 3: Implement sticky glass nav + active-route highlighting**

Replace the full contents of `frontend/components/layout/Nav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag } from "@/components/ui/Tag";
import type { EmployeeRole } from "@/lib/types";

interface NavLink {
  href: string;
  label: string;
}

const STAFF_LINKS: NavLink[] = [
  { href: "/checkout", label: "Checkout" },
  { href: "/products", label: "Products" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/customers", label: "Customers" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/checkout", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/customers", label: "Customers" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

// The backend's Employee and Expense endpoints (and every dashboard endpoint) are gated to
// role === "admin" strictly — a Manager gets a hard 403, unlike the rest of this list which is
// admin+manager shared. So the Employees/Expenses links are appended only for the strict admin
// role, not derived from ADMIN_ROLES like the rest of this array.
const STRICT_ADMIN_ROLES: EmployeeRole[] = ["admin"];

export function getNavLinksForRole(role: EmployeeRole): NavLink[] {
  const base = ADMIN_ROLES.includes(role) ? ADMIN_LINKS : STAFF_LINKS;
  if (!STRICT_ADMIN_ROLES.includes(role)) return base;
  return [...base, { href: "/employees", label: "Employees" }, { href: "/expenses", label: "Expenses" }];
}

function isActiveLink(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClassName(active: boolean): string {
  return active
    ? "text-sm text-accent bg-accent/10 rounded-sm px-2 py-1 -my-1"
    : "text-sm hover:text-accent";
}

interface NavProps {
  role: EmployeeRole;
  username: string;
}

export function Nav({ role, username }: NavProps) {
  const pathname = usePathname();
  const links = getNavLinksForRole(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : role === "sales_staff" ? "Sales Staff" : "Technician";
  const notificationsActive = isActiveLink(pathname, "/notifications");

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-4 py-2.5 px-4 bg-surface/70 backdrop-blur-md border-b border-divider">
      <span className="font-sans font-medium text-base mr-auto whitespace-nowrap">
        Promise Electronic Shop
      </span>
      {links.map((link) => {
        const active = isActiveLink(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={navLinkClassName(active)}
          >
            {link.label}
          </Link>
        );
      })}
      {/* Notifications are strictly admin-only (recipients are always role="admin" employees,
          unlike the admin+manager ADMIN_LINKS above), so it's gated here rather than in that array. */}
      {role === "admin" && (
        <Link
          href="/notifications"
          aria-current={notificationsActive ? "page" : undefined}
          className={navLinkClassName(notificationsActive)}
        >
          Notifications
        </Link>
      )}
      {isAdmin && <Tag>Admin</Tag>}
      <span className="text-sm opacity-60">
        {username} · {roleLabel}
      </span>
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/layout/Nav.test.tsx`
Expected: PASS (all 14 tests — 12 pre-existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/layout/Nav.tsx frontend/components/layout/Nav.test.tsx
git commit -m "Nav: sticky glass backdrop and active-route highlighting"
```

---

### Task 4: `StatCards` adopts the glass `Card` variant

**Files:**
- Modify: `frontend/components/dashboard/StatCards.tsx`
- Test: `frontend/components/dashboard/StatCards.test.tsx`

**Interfaces:**
- Consumes: `Card`'s `variant="glass"` from Task 1.

- [ ] **Step 1: Write the failing test**

Add to `frontend/components/dashboard/StatCards.test.tsx`, inside the existing `describe("StatCards", ...)` block:

```tsx
  it("renders each stat as a glass-variant card", () => {
    const { container } = render(<StatCards data={makeData()} />);
    const cards = container.querySelectorAll(".glass");
    expect(cards).toHaveLength(4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run components/dashboard/StatCards.test.tsx`
Expected: FAIL — 0 elements have class `.glass` (cards are still `elevation="sm"`, default solid variant).

- [ ] **Step 3: Switch each `Card` to `variant="glass"`**

In `frontend/components/dashboard/StatCards.tsx`, change all four `<Card elevation="sm">` to `<Card variant="glass">` (drop `elevation="sm"` — the glass variant's own border/glow replaces the hairline elevation shadow). The four cards become:

```tsx
      <Card variant="glass">
        <CardKicker>Sales revenue</CardKicker>
        <span className="font-sans font-medium text-2xl">{formatRwf(data.salesRevenue)}</span>
        <CardMeta>{data.saleCount} sales this month</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Purchase cost</CardKicker>
        <span className="font-sans font-medium text-2xl">{formatRwf(data.purchaseCost)}</span>
        <CardMeta>{data.purchaseOrderCount} purchase orders (paid amounts)</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Gross profit</CardKicker>
        <span className="font-sans font-medium text-2xl text-accent-300">{formatRwf(data.grossProfit)}</span>
        <CardMeta>revenue − purchase cost · {(data.grossMarginPct * 100).toFixed(1)}% margin</CardMeta>
      </Card>
      <Card variant="glass">
        <CardKicker>Needs reorder</CardKicker>
        <span className="font-sans font-medium text-2xl">{data.reorderCount} products</span>
        <CardMeta>{data.outOfStockCount} out of stock</CardMeta>
      </Card>
```

(The surrounding `<div className="grid grid-cols-4 gap-4 mb-6">` wrapper and all data-driven content stay exactly as they are.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run components/dashboard/StatCards.test.tsx`
Expected: PASS (all 4 tests, including the 3 pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add frontend/components/dashboard/StatCards.tsx frontend/components/dashboard/StatCards.test.tsx
git commit -m "StatCards: use the glass Card variant for dashboard KPIs"
```

---

### Task 5: Migrate `DashboardPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/dashboard/DashboardPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

In `frontend/app/(protected)/dashboard/DashboardPageClient.tsx`, add the import (alongside the other component imports):

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex items-baseline gap-3 mb-6 flex-wrap">
        <h3 className="m-0">Dashboard</h3>
        <span className="text-sm text-text/50">Monthly summary</span>
        <div className="ml-auto">
          <ExportCsvButton data={data} />
        </div>
      </div>
```

with:

```tsx
      <PageHeader title="Dashboard" subtitle="Monthly summary">
        <div className="ml-auto">
          <ExportCsvButton data={data} />
        </div>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/dashboard/DashboardPageClient.test.tsx"`
Expected: PASS (all 4 pre-existing tests — this is a pure structural swap, no new assertions needed since the visible text/roles are unchanged).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/dashboard/DashboardPageClient.tsx"
git commit -m "Dashboard: migrate header to shared PageHeader"
```

---

### Task 6: Migrate `StockPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/stock/StockPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2. Only the page's main toolbar header changes — the "Serialized units" sub-section header (`CardKicker`-based) below the `<hr>` is untouched (see Scope note).

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Stock overview</h4>
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </div>
```

with:

```tsx
      <PageHeader title="Stock overview">
        <SegmentedToggle name="stk" options={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v as StockFilter)} />
        <Link href="/stock/scan" className="ml-auto text-sm text-accent">
          Quick status change →
        </Link>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/stock/StockPageClient.test.tsx"`
Expected: PASS (all 6 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/stock/StockPageClient.tsx"
git commit -m "Stock: migrate main toolbar header to shared PageHeader"
```

---

### Task 7: Migrate `ProductsPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/products/ProductsPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Products</h4>
        <input
          aria-label="Search products"
          placeholder="Search name, brand, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[300px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <SegmentedToggle name="category" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="ml-auto">
            + New product
          </Button>
        )}
      </div>
```

with:

```tsx
      <PageHeader title="Products">
        <input
          aria-label="Search products"
          placeholder="Search name, brand, barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[300px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <SegmentedToggle name="category" options={categoryOptions} value={categoryFilter} onChange={setCategoryFilter} />
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="ml-auto">
            + New product
          </Button>
        )}
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/products/page.test.tsx"`
Expected: PASS (all 7 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/products/ProductsPageClient.tsx"
git commit -m "Products: migrate header to shared PageHeader"
```

---

### Task 8: Migrate `PurchasesPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/purchases/PurchasesPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Purchases</h4>
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          + New purchase
        </Button>
      </div>
```

with:

```tsx
      <PageHeader title="Purchases">
        <Button onClick={() => setCreateOpen(true)} className="ml-auto">
          + New purchase
        </Button>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/purchases/PurchasesPageClient.test.tsx"`
Expected: PASS (all 6 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/purchases/PurchasesPageClient.tsx"
git commit -m "Purchases: migrate header to shared PageHeader"
```

---

### Task 9: Migrate `CustomersPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/customers/CustomersPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Customers</h4>
        <input
          aria-label="Search customers"
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[240px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New customer
        </Button>
      </div>
```

with:

```tsx
      <PageHeader title="Customers">
        <input
          aria-label="Search customers"
          placeholder="Search name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[240px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New customer
        </Button>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/customers/CustomersPageClient.test.tsx"`
Expected: PASS (all 3 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/customers/CustomersPageClient.tsx"
git commit -m "Customers: migrate header to shared PageHeader"
```

---

### Task 10: Migrate `SuppliersPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/suppliers/SuppliersPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Suppliers</h4>
        <input
          aria-label="Search suppliers"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[220px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New supplier
        </Button>
      </div>
```

with:

```tsx
      <PageHeader title="Suppliers">
        <input
          aria-label="Search suppliers"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-[220px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md ml-4"
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New supplier
        </Button>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/suppliers/SuppliersPageClient.test.tsx"`
Expected: PASS (all 4 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/suppliers/SuppliersPageClient.tsx"
git commit -m "Suppliers: migrate header to shared PageHeader"
```

---

### Task 11: Migrate `EmployeesPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/employees/EmployeesPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Employees</h4>
        <Tag variant="outline">Admin only</Tag>
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New employee
        </Button>
      </div>
```

with:

```tsx
      <PageHeader title="Employees">
        <Tag variant="outline">Admin only</Tag>
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New employee
        </Button>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/employees/EmployeesPageClient.test.tsx"`
Expected: PASS (all 4 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/employees/EmployeesPageClient.tsx"
git commit -m "Employees: migrate header to shared PageHeader"
```

---

### Task 12: Migrate `ExpensesPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/expenses/ExpensesPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Expenses</h4>
        <Tag variant="outline">Admin only</Tag>
        <SegmentedToggle
          name="expense-filter"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as ExpenseCategory | "all")}
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New expense
        </Button>
      </div>
```

with:

```tsx
      <PageHeader title="Expenses">
        <Tag variant="outline">Admin only</Tag>
        <SegmentedToggle
          name="expense-filter"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as ExpenseCategory | "all")}
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New expense
        </Button>
      </PageHeader>
```

(The `Card`/`CardKicker` total-summary block right below stays exactly as it is — this task only touches the header row.)

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/expenses/ExpensesPageClient.test.tsx"`
Expected: PASS (all 5 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/expenses/ExpensesPageClient.tsx"
git commit -m "Expenses: migrate header to shared PageHeader"
```

---

### Task 13: Migrate `NotificationsPageClient` to `PageHeader`

**Files:**
- Modify: `frontend/app/(protected)/notifications/NotificationsPageClient.tsx`

**Interfaces:**
- Consumes: `PageHeader` from Task 2. Note: this file's non-admin early-return branch (`if (role !== "admin") { return <div><h4>...` ) is a *different* render path — it stays untouched; only the main admin-path header below it changes.

- [ ] **Step 1: Replace the header block**

Add the import:

```tsx
import { PageHeader } from "@/components/ui/PageHeader";
```

Replace:

```tsx
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Notification log</h4>
        <Tag>Admin only</Tag>
        <div className="ml-auto">
          <SegmentedToggle name="notification-filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
      </div>
```

with:

```tsx
      <PageHeader title="Notification log">
        <Tag>Admin only</Tag>
        <div className="ml-auto">
          <SegmentedToggle name="notification-filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
      </PageHeader>
```

- [ ] **Step 2: Run this page's existing test file to confirm no regression**

Run: `npx vitest run "app/(protected)/notifications/NotificationsPageClient.test.tsx"`
Expected: PASS (all 3 pre-existing tests).

- [ ] **Step 3: Commit**

```bash
git add "frontend/app/(protected)/notifications/NotificationsPageClient.tsx"
git commit -m "Notifications: migrate header to shared PageHeader"
```

---

### Task 14: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Full unit suite**

Run: `npm test`
Expected: every test file passes, including all files touched in Tasks 1–13 (Card, PageHeader, Nav, StatCards, and the 9 migrated `*PageClient.test.tsx` files) plus every untouched test file (regression guard for the whole app).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors surfaced at build time.

- [ ] **Step 5: Manual visual pass**

With the dev server running (`npm run dev`) and the backend up (`docker compose ps` shows `web`/`postgres`/`redis` healthy), log in as `admin1` / `adminpass` and click through Dashboard, Products, Stock, Purchases, Customers, Suppliers, Employees, Expenses, and Notifications. Confirm: the nav bar stays visible while scrolling and highlights the current page, every page's title/toolbar row looks consistent, and the dashboard KPI cards show the glass/glow treatment. This step has no automated pass/fail — report what you see instead of a test result.

- [ ] **Step 6: Commit (only if Step 5 surfaced fixes)**

If the manual pass found nothing to fix, there is nothing to commit for this task. If it did, make the smallest fix that addresses it, re-run Steps 1–4, and commit with a message describing what visual issue was fixed.
