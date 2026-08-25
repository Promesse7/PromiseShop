# Frontend Phase 7: Admin Dashboard Implementation Plan

## Global Constraints

- No backend changes. All data comes from `GET /dashboard/sales-summary/?period=month`,
  `GET /dashboard/stock-health/`, `fetchAllPages<Sale>("sales/")`, `fetchAllPages<Purchase>("purchases/")`,
  and the existing `useCatalogProducts()` hook (read-only import, no edits).
- Additive-only edits to `lib/types.ts` (append `Purchase`, `PurchaseItem`, `SalesSummary`, `StockHealth`).
- No edits to `components/layout/Nav.tsx` — `/dashboard` is already linked for both roles.
- Vitest + RTL for every hook/component; one Playwright e2e smoke test authored but not executed (see
  Phase design doc's Testing section — parallel worktrees share port 3000/the dev DB).

## Task 1: `useDashboardData` hook

### Step 1: Write the failing tests

`frontend/lib/dashboard/useDashboardData.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useDashboardData } from "./useDashboardData";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const PRODUCTS = [
  { product_id: 1, category: 10, barcode: "PES-TV-1", name: "Samsung TV", brand: "Samsung", model_number: "UA43", reorder_level: 5 },
  { product_id: 2, category: 20, barcode: "PES-AUD-1", name: "JBL Flip 6", brand: "JBL", model_number: "FLIP6", reorder_level: 4 },
  { product_id: 3, category: 20, barcode: "PES-AUD-2", name: "Old Speaker", brand: "Sony", model_number: "MDR", reorder_level: 2 },
];
const CATEGORIES = [
  { category_id: 10, name: "Televisions", code: "TV" },
  { category_id: 20, name: "Audio", code: "AUD" },
];
const PRICING = [
  { price_id: 1, product: 1, wholesale_price: "300000.00", retail_price: "385000.00", effective_date: "2026-01-01", is_current: true },
  { price_id: 2, product: 2, retail_price: "145000.00", effective_date: "2026-01-01", is_current: true },
  { price_id: 3, product: 3, retail_price: "50000.00", effective_date: "2026-01-01", is_current: true },
];
const INVENTORY = [
  { inventory_id: 1, product: 1, quantity_in_stock: 12, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: false },
  { inventory_id: 2, product: 2, quantity_in_stock: 2, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: true },
  { inventory_id: 3, product: 3, quantity_in_stock: 6, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: false },
];
const SALES = [
  {
    sale_id: 1, customer: null, employee: 1, sale_date: "2026-08-10T10:00:00Z", payment_method: "cash",
    total_amount: "385000.00", status: "completed",
    items: [{ sale_item_id: 1, sale: 1, product: 1, quantity: 1, unit_price: "385000.00", subtotal: "385000.00" }],
  },
  {
    sale_id: 2, customer: null, employee: 1, sale_date: "2026-08-15T10:00:00Z", payment_method: "cash",
    total_amount: "145000.00", status: "completed",
    items: [{ sale_item_id: 2, sale: 2, product: 2, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" }],
  },
  {
    sale_id: 3, customer: null, employee: 1, sale_date: "2026-06-01T10:00:00Z", payment_method: "cash",
    total_amount: "50000.00", status: "completed",
    items: [{ sale_item_id: 3, sale: 3, product: 3, quantity: 1, unit_price: "50000.00", subtotal: "50000.00" }],
  },
];
const PURCHASES = [
  { purchase_id: 1, supplier: 1, employee: 1, invoice_number: "INV-1", purchase_date: "2026-08-05",
    total_paid: "200000.00", total_invoiced: "200000.00", payment_status: "paid", status: "received", items: [] },
];

function mockFetchImpl(overrides: Record<string, () => Promise<Response>> = {}) {
  return vi.fn((url: string) => {
    for (const [key, handler] of Object.entries(overrides)) {
      if (url.includes(key)) return handler();
    }
    if (url.includes("/dashboard/sales-summary/")) {
      return Promise.resolve({ ok: true, json: async () => ({ period: "month", total_revenue: "530000.00", sale_count: 2, top_products: [] }) } as Response);
    }
    if (url.includes("/dashboard/stock-health/")) {
      return Promise.resolve({ ok: true, json: async () => ({ low_stock_count: 1, equipment_status_counts: {} }) } as Response);
    }
    if (url.includes("/products/")) return Promise.resolve({ ok: true, json: async () => paginated(PRODUCTS) } as Response);
    if (url.includes("/categories/")) return Promise.resolve({ ok: true, json: async () => paginated(CATEGORIES) } as Response);
    if (url.includes("/product-pricing/")) return Promise.resolve({ ok: true, json: async () => paginated(PRICING) } as Response);
    if (url.includes("/inventory/")) return Promise.resolve({ ok: true, json: async () => paginated(INVENTORY) } as Response);
    if (url.includes("/sales/")) return Promise.resolve({ ok: true, json: async () => paginated(SALES) } as Response);
    if (url.includes("/purchases/")) return Promise.resolve({ ok: true, json: async () => paginated(PURCHASES) } as Response);
    throw new Error(`Unexpected URL: ${url}`);
  });
}

describe("useDashboardData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("computes this month's revenue, purchase cost, gross profit and margin", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.salesRevenue).toBe(530000);
    expect(result.current.purchaseCost).toBe(200000);
    expect(result.current.grossProfit).toBe(330000);
    expect(result.current.grossMarginPct).toBeCloseTo(330000 / 530000);
  });

  it("flags isForbidden and skips further fetches when sales-summary 403s", async () => {
    const fetchMock = mockFetchImpl({
      "/dashboard/sales-summary/": () => Promise.resolve({ ok: false, status: 403, json: async () => ({ detail: "Forbidden" }) } as Response),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isForbidden).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/sales/"))).toBe(false);
  });

  it("derives reorder counts and low-stock rows from the catalog join", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.reorderCount).toBe(1);
    expect(result.current.outOfStockCount).toBe(0);
    expect(result.current.lowStockRows.map((r) => r.product_id)).toEqual([2]);
  });

  it("computes top sellers for the current month only, sorted by revenue", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.topSellers[0]).toMatchObject({ product_id: 1, units: 1, revenue: 385000 });
    expect(result.current.topSellers.map((s) => s.product_id)).not.toContain(3);
  });

  it("flags a product with no sale in 30+ days as a slow mover", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.slowMovers.map((s) => s.product_id)).toContain(3);
    expect(result.current.slowMovers.map((s) => s.product_id)).not.toContain(1);
  });

  it("buckets revenue and purchase cost into 6 trailing months", async () => {
    vi.stubGlobal("fetch", mockFetchImpl());
    const { result } = renderHook(() => useDashboardData(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.trend).toHaveLength(6);
    expect(result.current.trend[5].month).toBe("2026-08");
    expect(result.current.trend[5].revenue).toBe(530000);
    const june = result.current.trend.find((p) => p.month === "2026-06");
    expect(june?.revenue).toBe(50000);
  });
});
```

### Step 2: Run test to verify it fails

`npm test -- useDashboardData` — fails, module doesn't exist yet.

### Step 3: Write minimal implementation

`frontend/lib/dashboard/useDashboardData.ts` — see file for final content (fetches `sales-summary` +
`stock-health` first; on 403 from either, short-circuits with `isForbidden: true` and disables the
remaining queries via TanStack Query's `enabled` option; otherwise fetches raw `/sales/` + `/purchases/`
and reuses `useCatalogProducts()`; aggregates revenue/cost/profit/margin, reorder counts, low-stock rows,
top sellers, slow movers, and the 6-month trend, all memoized on the fetched data).

### Step 4: Run test to verify it passes

`npm test -- useDashboardData` — all 6 cases pass.

### Step 5: Commit

`git add frontend/lib/dashboard/useDashboardData.ts frontend/lib/dashboard/useDashboardData.test.tsx frontend/lib/types.ts && git commit -m "Add useDashboardData hook with client-side aggregation"`

## Task 2: `buildDashboardCsv`

### Step 1: Write the failing test

`frontend/lib/dashboard/csv.test.ts` — asserts the CSV has a header row, one row per stat, and one
section per table (top sellers, low stock), with numbers unquoted and text fields present.

### Step 2: Run test to verify it fails

`npm test -- csv` — fails, module doesn't exist.

### Step 3: Write minimal implementation

`frontend/lib/dashboard/csv.ts` — `buildDashboardCsv(data: DashboardData): string`, pure function, no
DOM/Blob code here (that lives in `ExportCsvButton.tsx` so the string-building logic stays unit-testable
without jsdom's Blob/URL quirks).

### Step 4: Run test to verify it passes

### Step 5: Commit

## Task 3: `StatCards` and `AdminOnlyNotice` components

### Step 1: Write the failing tests

`StatCards.test.tsx` — renders the four cards with formatted RWF currency strings and the margin/↑vs-prior
meta line omitted when no prior-period figure is available (this phase has no "vs last month" comparison
data — mockup's "▲ 9.4% vs July" isn't reproducible without a second period fetch; render the plain figure
only, documented in the design doc's Decision 2 scope). `AdminOnlyNotice.test.tsx` — renders the "Admins
only" message.

### Step 2-5: fail → implement (`components/dashboard/StatCards.tsx`, `components/dashboard/AdminOnlyNotice.tsx`) → pass → commit.

## Task 4: `RevenueTrendChart`, `LowStockTable`, `TopSellersTable`, `SlowMoversTable`

### Step 1: Write the failing tests

One RTL test per component: `RevenueTrendChart.test.tsx` asserts one bar-pair per trend point and the
month labels render; `LowStockTable.test.tsx`/`TopSellersTable.test.tsx`/`SlowMoversTable.test.tsx` assert
row content and the empty-state message when given `[]`.

### Step 2-5: fail → implement (reuse `components/ui/Table.tsx`; `RevenueTrendChart` is a small inline SVG,
matching the mockup's own bar+line structure at proportional simplicity — no charting library) → pass →
commit.

## Task 5: `DashboardPageClient` and `page.tsx`

### Step 1: Write the failing test

`DashboardPageClient.test.tsx` — mocks `useDashboardData` (via `vi.mock`) for three states: loading (shows
skeleton text), forbidden (`AdminOnlyNotice`), and loaded (all cards/tables/chart present, Export CSV
button present and triggers `buildDashboardCsv`).

### Step 2-5: fail → implement (`app/(protected)/dashboard/DashboardPageClient.tsx` composes every
component above; `app/(protected)/dashboard/page.tsx` replaces the stub, mirroring
`app/(protected)/products/page.tsx`'s `getSession()` → client-component pattern) → pass → commit.

## Task 6: e2e smoke test (authored, not executed this run)

`frontend/e2e/dashboard.spec.ts` — log in as `admin1` → land on `/dashboard` → assert the four stat-card
labels ("Sales revenue", "Purchase cost", "Gross profit", "Needs reorder") are visible and at least one
table renders a row. Matches `e2e/products.spec.ts`'s structure; doc-comments any fixture data assumed.
Commit without running (see Global Constraints / design doc Testing section).
