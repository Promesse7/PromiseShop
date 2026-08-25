# Frontend Phase 2: Sales/Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the point-of-sale checkout flow (scan/search → cart → totals → complete sale →
receipt) on desktop and tablet, matching mockups `1b`/`1c`/`1n`.

**Architecture:** A `usePosCatalog` hook joins three existing list endpoints (products, categories,
current pricing, inventory) client-side into a lookup map keyed by barcode. Cart state is plain
React state in a `PosCheckout` container; two presentational layouts (`CartTable` desktop,
`CartCards` tablet) render the same state via a Tailwind `lg` breakpoint. Submitting posts to the
existing `POST /api/sales/` endpoint; on success the container swaps to a `Receipt` view built from
the cart lines already held in memory (not from the API response, which only returns product IDs).
A new `ToastProvider` (context + hook) gives every mutation a way to report success/failure,
reusing the `Toast` component Phase 1 built but never wired up. One backend change: an
`is_current=true` filter on `ProductPricingViewSet`.

**Tech Stack:** Django REST Framework (backend filter), Next.js 16 App Router + TypeScript,
TanStack Query, Tailwind, Vitest + React Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-frontend-phase2-sales-checkout-design.md`

## Global Constraints

- No i18n/Kinyarwanda translation — EN/RW toggle stays visual-only (spec Decision 4).
- No motion-spec animations (scan pulse, checkmark-draw, skeletons) — plain functional loading
  states only (spec Decision 2).
- No scanner-hardware SDK — barcode input is a plain controlled `<input>` (spec Decision 3).
- Receipt printing is `window.print()` + a `@media print` stylesheet — no PDF/thermal integration
  (spec Decision 5).
- No sale returns/cancellation UI in this phase (spec Decision 6), even though
  `POST /sales/{id}/return/` and `/cancel/` already exist on the backend.
- The "Customer" field is present but inert — always submits no customer; no lookup UI (spec "Out
  of scope").
- All frontend API calls go through the existing BFF proxy (`apiFetch` → `/api/proxy/<path>`) —
  never call Django directly from client code.
- Every list fetch must page through DRF's `PageNumberPagination` (`PAGE_SIZE=20` on the backend)
  to completion — never assume a list response is a bare array or that one page is everything.

---

## Task 1: Backend — `is_current` filter on ProductPricingViewSet

**Files:**
- Modify: `backend/catalog/views.py:29-38` (`ProductPricingViewSet.get_queryset`)
- Test: `backend/catalog/tests/test_product_pricing_api.py`

**Interfaces:**
- Produces: `GET /api/product-pricing/?is_current=true` returns only rows where
  `is_current=True`, combinable with the existing `?product=<id>` filter (both can be present at
  once).

- [ ] **Step 1: Write the failing test**

Add to `backend/catalog/tests/test_product_pricing_api.py`:

```python
def test_is_current_filter_returns_only_current_rows(admin, product):
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    ProductPricing.objects.create(
        product=product, wholesale_price="110000.00", retail_price="150000.00",
        effective_date=date(2026, 6, 1),
    )
    client = auth_client(admin, "adminpass")

    response = client.get("/api/product-pricing/?is_current=true")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["retail_price"] == "150000.00"
    assert results[0]["is_current"] is True


def test_is_current_filter_combines_with_product_filter(admin, product):
    other_category = Category.objects.create(name="Mobile", code="MOB")
    other_product = Product.objects.create(
        category=other_category, barcode="PES-MOB-00001", name="Anker Charger"
    )
    ProductPricing.objects.create(
        product=product, wholesale_price="108000.00", retail_price="145000.00",
        effective_date=date(2026, 1, 1),
    )
    ProductPricing.objects.create(
        product=other_product, wholesale_price="8000.00", retail_price="12000.00",
        effective_date=date(2026, 1, 1),
    )
    client = auth_client(admin, "adminpass")

    response = client.get(f"/api/product-pricing/?is_current=true&product={product.product_id}")

    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) == 1
    assert results[0]["product"] == product.product_id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose exec web pytest catalog/tests/test_product_pricing_api.py -v` (or your local
equivalent per `backend/README.md`)
Expected: FAIL — `test_is_current_filter_returns_only_current_rows` sees 2 results, not 1
(`?is_current=true` isn't filtered yet).

- [ ] **Step 3: Write minimal implementation**

In `backend/catalog/views.py`, replace `ProductPricingViewSet.get_queryset`:

```python
    def get_queryset(self):
        queryset = ProductPricing.objects.all().order_by("-effective_date")
        product_id = self.request.query_params.get("product")
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if self.request.query_params.get("is_current") == "true":
            queryset = queryset.filter(is_current=True)
        return queryset
```

- [ ] **Step 4: Run test to verify it passes**

Run: `docker compose exec web pytest catalog/tests/test_product_pricing_api.py -v`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 5: Run the full backend suite to confirm no regression**

Run: `docker compose exec web pytest`
Expected: PASS, same total test count as before + 2.

- [ ] **Step 6: Commit**

```bash
git add backend/catalog/views.py backend/catalog/tests/test_product_pricing_api.py
git commit -m "Add is_current filter to ProductPricingViewSet for POS catalog lookups"
```

---

## Task 2: Frontend — shared domain types + api-client utilities

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api-client.ts`
- Test: `frontend/lib/api-client.test.ts` (new)

**Interfaces:**
- Produces (types, added to `lib/types.ts`): `Category`, `Product`, `ProductPricing`, `Inventory`,
  `PosProduct`, `PaymentMethod`, `SaleItem`, `Sale`, `PaginatedResponse<T>`.
- Produces (`lib/api-client.ts`): `fetchAllPages<T>(path: string): Promise<T[]>`,
  `extractErrorMessage(body: unknown): string`. Both are consumed by Task 6 (`usePosCatalog`) and
  Task 11 (`PosCheckout`'s submit-error handling) respectively.

- [ ] **Step 1: Add the shared types**

Add to `frontend/lib/types.ts` (after the existing `LoginResponse` interface):

```typescript
export interface Category {
  category_id: number;
  name: string;
  code: string;
  description: string | null;
}

export interface Product {
  product_id: number;
  category: number;
  barcode: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months: number | null;
  reorder_level: number;
  unit: string;
  is_active: boolean;
  created_at: string;
}

export interface ProductPricing {
  price_id: number;
  product: number;
  wholesale_price?: string;
  retail_price: string;
  effective_date: string;
  is_current: boolean;
}

export interface Inventory {
  inventory_id: number;
  product: number;
  quantity_in_stock: number;
  quantity_in_use: number;
  quantity_damaged: number;
  storage_location: string | null;
  last_updated: string;
  is_low_stock: boolean;
}

export interface PosProduct {
  product_id: number;
  barcode: string;
  name: string;
  brand: string | null;
  model_number: string | null;
  category_name: string;
  retail_price: number;
  quantity_in_stock: number;
}

export type PaymentMethod = "cash" | "card" | "mobile_money" | "bank_transfer";

export interface SaleItem {
  sale_item_id: number;
  sale: number;
  product: number;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface Sale {
  sale_id: number;
  customer: number | null;
  employee: number;
  sale_date: string;
  payment_method: PaymentMethod | null;
  total_amount: string;
  status: "completed" | "returned" | "cancelled";
  items: SaleItem[];
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
```

These are plain type declarations — no runtime behavior to unit-test on their own. They're
exercised for real starting in Step 2 below (`fetchAllPages` uses `PaginatedResponse<T>`) and by
every later task that imports them.

- [ ] **Step 2: Write the failing tests for `fetchAllPages` and `extractErrorMessage`**

Create `frontend/lib/api-client.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllPages, extractErrorMessage } from "./api-client";

describe("fetchAllPages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns all results when the response fits on one page", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 2, next: null, previous: null, results: [{ id: 1 }, { id: 2 }] }),
    });

    const results = await fetchAllPages<{ id: number }>("products/");

    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/?page=1",
      expect.anything()
    );
  });

  it("follows next pages until next is null", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 3, next: "http://backend:8000/api/products/?page=2", previous: null,
        results: [{ id: 1 }, { id: 2 }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 3, next: null, previous: null, results: [{ id: 3 }] }),
    });

    const results = await fetchAllPages<{ id: number }>("products/");

    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/proxy/products/?page=2", expect.anything());
  });

  it("appends page as an additional query param when the path already has one", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 1, next: null, previous: null, results: [{ id: 1 }] }),
    });

    await fetchAllPages<{ id: number }>("product-pricing/?is_current=true");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/product-pricing/?is_current=true&page=1",
      expect.anything()
    );
  });
});

describe("extractErrorMessage", () => {
  it("returns a string detail directly", () => {
    expect(extractErrorMessage({ detail: "Insufficient stock." })).toBe("Insufficient stock.");
  });

  it("joins an array detail into one string", () => {
    expect(extractErrorMessage({ detail: ["Insufficient stock.", "Try again."] })).toBe(
      "Insufficient stock. Try again."
    );
  });

  it("flattens a nested field-error object detail", () => {
    expect(
      extractErrorMessage({ detail: { items: ["At least one line item is required."] } })
    ).toBe("At least one line item is required.");
  });

  it("falls back to a generic message when body has no detail", () => {
    expect(extractErrorMessage(null)).toBe("Something went wrong — try again.");
    expect(extractErrorMessage({})).toBe("Something went wrong — try again.");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- api-client.test.ts`
Expected: FAIL — `fetchAllPages` and `extractErrorMessage` are not exported from `./api-client`.

- [ ] **Step 4: Implement `fetchAllPages` and `extractErrorMessage`**

Add to `frontend/lib/api-client.ts` (below the existing `apiFetch`):

```typescript
import type { PaginatedResponse } from "./types";

export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const separator = path.includes("?") ? "&" : "?";

  while (true) {
    const data = await apiFetch<PaginatedResponse<T>>(`${path}${separator}page=${page}`);
    results.push(...data.results);
    if (!data.next) break;
    page += 1;
  }

  return results;
}

export function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map(String).join(" ");
    if (detail && typeof detail === "object") {
      return Object.values(detail).flat().map(String).join(" ");
    }
  }
  return "Something went wrong — try again.";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- api-client.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api-client.ts frontend/lib/api-client.test.ts
git commit -m "Add POS domain types and fetchAllPages/extractErrorMessage api-client utilities"
```

---

## Task 3: Frontend — ToastProvider + useToast

**Files:**
- Create: `frontend/components/layout/ToastProvider.tsx`
- Test: `frontend/components/layout/ToastProvider.test.tsx`

**Interfaces:**
- Consumes: `Toast` from `frontend/components/ui/Toast.tsx` (`{message, variant?}` props, already
  built).
- Produces: `ToastProvider({children})` component; `useToast(): {show(message: string, variant?:
  "success" | "error"): void}` hook, throws if used outside `ToastProvider`. Consumed by Task 4
  (mounted app-wide) and Task 11 (`PosCheckout` calls `show()` on submit failure).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/layout/ToastProvider.test.tsx`:

```tsx
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";

function Trigger({ message, variant }: { message: string; variant?: "success" | "error" }) {
  const { show } = useToast();
  return <button onClick={() => show(message, variant)}>Trigger</button>;
}

describe("ToastProvider / useToast", () => {
  it("renders nothing before show() is called", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a toast with the given message after show() is called", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    render(
      <ToastProvider>
        <Trigger message="Sale complete" />
      </ToastProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("status")).toHaveTextContent("Sale complete");
  });

  it("auto-dismisses the toast after 4 seconds", async () => {
    vi.useFakeTimers();
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup({ delay: null });
    render(
      <ToastProvider>
        <Trigger message="Sale complete" />
      </ToastProvider>
    );
    await user.click(screen.getByRole("button", { name: "Trigger" }));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("throws when useToast is used outside a ToastProvider", () => {
    function Broken() {
      useToast();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow("useToast must be used within a ToastProvider");
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ToastProvider.test.tsx`
Expected: FAIL — `./ToastProvider` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/layout/ToastProvider.tsx`:

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Toast } from "@/components/ui/Toast";

type ToastVariant = "success" | "error";

interface ToastState {
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const show = useCallback((message: string, variant: ToastVariant = "success") => {
    setToast({ message, variant });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ToastProvider.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/layout/ToastProvider.tsx frontend/components/layout/ToastProvider.test.tsx
git commit -m "Add ToastProvider/useToast to trigger the existing Toast component"
```

---

## Task 4: Frontend — wire QueryClientProvider + ToastProvider into the app

**Files:**
- Create: `frontend/components/layout/Providers.tsx`
- Modify: `frontend/app/(protected)/layout.tsx`
- Test: `frontend/components/layout/Providers.test.tsx`

**Interfaces:**
- Consumes: `queryClient` from `frontend/lib/query-client.ts` (already exists, unused until now);
  `ToastProvider` from Task 3.
- Produces: `Providers({children})`, mounted in `(protected)/layout.tsx` so every page under it can
  call `useQuery`/`useMutation` (Task 6 onward) and `useToast` (Task 11).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/layout/Providers.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { Providers } from "./Providers";
import { useToast } from "./ToastProvider";

function QueryProbe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: () => Promise.resolve("ok") });
  return <div>{data ?? "loading"}</div>;
}

function ToastProbe() {
  useToast();
  return <div>toast-ready</div>;
}

describe("Providers", () => {
  it("makes TanStack Query available to descendants", async () => {
    render(
      <Providers>
        <QueryProbe />
      </Providers>
    );
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });

  it("makes useToast available to descendants", () => {
    render(
      <Providers>
        <ToastProbe />
      </Providers>
    );
    expect(screen.getByText("toast-ready")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- Providers.test.tsx`
Expected: FAIL — `./Providers` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/layout/Providers.tsx`:

```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
```

Modify `frontend/app/(protected)/layout.tsx` to wrap `main` in `Providers`:

```tsx
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Nav } from "@/components/layout/Nav";
import { Providers } from "@/components/layout/Providers";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <Providers>
      <div>
        <Nav role={session.role} username={session.username} />
        <main className="p-4">{children}</main>
      </div>
    </Providers>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- Providers.test.tsx`
Expected: PASS, both tests.

- [ ] **Step 5: Run the full Vitest suite and the production build to confirm no regression**

Run: `npm run test && npm run build`
Expected: all existing tests still pass; build exits 0 (confirms `(protected)/layout.tsx` still
type-checks and the `/checkout`/`/dashboard` stub pages still render fine wrapped in `Providers`).

- [ ] **Step 6: Commit**

```bash
git add frontend/components/layout/Providers.tsx frontend/components/layout/Providers.test.tsx frontend/app/\(protected\)/layout.tsx
git commit -m "Wire QueryClientProvider and ToastProvider into the protected layout shell"
```

---

## Task 5: Frontend — cart pure functions

**Files:**
- Create: `frontend/lib/pos/cart.ts`
- Test: `frontend/lib/pos/cart.test.ts`

**Interfaces:**
- Consumes: `PosProduct` from `frontend/lib/types.ts` (Task 2).
- Produces: `CartLine {product: PosProduct, quantity: number}`, `addItem(lines, product):
  CartLine[]`, `setQuantity(lines, productId, quantity): CartLine[]`, `removeItem(lines,
  productId): CartLine[]`, `lineSubtotal(line): number`, `totals(lines): {itemCount: number,
  subtotal: number}`. Consumed by Task 8/9 (cart layouts) and Task 11 (`PosCheckout` container).

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/pos/cart.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { addItem, setQuantity, removeItem, lineSubtotal, totals, type CartLine } from "./cart";
import type { PosProduct } from "@/lib/types";

function makeProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  return {
    product_id: 1,
    barcode: "PES-AUD-00147",
    name: "JBL Flip 6 Speaker",
    brand: "JBL",
    model_number: "JBLFLIP6BLK",
    category_name: "Audio",
    retail_price: 145000,
    quantity_in_stock: 2,
    ...overrides,
  };
}

describe("addItem", () => {
  it("adds a new product as a line with quantity 1", () => {
    const result = addItem([], makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 1 }]);
  });

  it("increments quantity when the product is already in the cart", () => {
    const existing: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    const result = addItem(existing, makeProduct());
    expect(result).toEqual([{ product: makeProduct(), quantity: 2 }]);
  });

  it("does not mutate the input array", () => {
    const existing: CartLine[] = [];
    addItem(existing, makeProduct());
    expect(existing).toEqual([]);
  });
});

describe("setQuantity", () => {
  it("updates the quantity of the matching line", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    const result = setQuantity(lines, 1, 5);
    expect(result[0].quantity).toBe(5);
  });

  it("removes the line when quantity is set to 0 or less", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    expect(setQuantity(lines, 1, 0)).toEqual([]);
    expect(setQuantity(lines, 1, -1)).toEqual([]);
  });

  it("leaves other lines untouched", () => {
    const other = makeProduct({ product_id: 2, barcode: "PES-TV-00082", name: "TV" });
    const lines: CartLine[] = [
      { product: makeProduct(), quantity: 1 },
      { product: other, quantity: 3 },
    ];
    const result = setQuantity(lines, 1, 5);
    expect(result.find((l) => l.product.product_id === 2)?.quantity).toBe(3);
  });
});

describe("removeItem", () => {
  it("removes the matching line", () => {
    const lines: CartLine[] = [{ product: makeProduct(), quantity: 1 }];
    expect(removeItem(lines, 1)).toEqual([]);
  });
});

describe("lineSubtotal", () => {
  it("multiplies retail price by quantity", () => {
    const line: CartLine = { product: makeProduct({ retail_price: 18000 }), quantity: 2 };
    expect(lineSubtotal(line)).toBe(36000);
  });
});

describe("totals", () => {
  it("sums item counts and subtotals across lines", () => {
    const lines: CartLine[] = [
      { product: makeProduct({ retail_price: 385000 }), quantity: 1 },
      { product: makeProduct({ product_id: 2, retail_price: 18000 }), quantity: 2 },
    ];
    expect(totals(lines)).toEqual({ itemCount: 3, subtotal: 421000 });
  });

  it("returns zeros for an empty cart", () => {
    expect(totals([])).toEqual({ itemCount: 0, subtotal: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- cart.test.ts`
Expected: FAIL — `./cart` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/pos/cart.ts`:

```typescript
import type { PosProduct } from "@/lib/types";

export interface CartLine {
  product: PosProduct;
  quantity: number;
}

export function addItem(lines: CartLine[], product: PosProduct): CartLine[] {
  const existing = lines.find((line) => line.product.product_id === product.product_id);
  if (existing) {
    return lines.map((line) =>
      line.product.product_id === product.product_id
        ? { ...line, quantity: line.quantity + 1 }
        : line
    );
  }
  return [...lines, { product, quantity: 1 }];
}

export function setQuantity(lines: CartLine[], productId: number, quantity: number): CartLine[] {
  if (quantity <= 0) {
    return removeItem(lines, productId);
  }
  return lines.map((line) =>
    line.product.product_id === productId ? { ...line, quantity } : line
  );
}

export function removeItem(lines: CartLine[], productId: number): CartLine[] {
  return lines.filter((line) => line.product.product_id !== productId);
}

export function lineSubtotal(line: CartLine): number {
  return line.product.retail_price * line.quantity;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
}

export function totals(lines: CartLine[]): CartTotals {
  return lines.reduce(
    (acc, line) => ({
      itemCount: acc.itemCount + line.quantity,
      subtotal: acc.subtotal + lineSubtotal(line),
    }),
    { itemCount: 0, subtotal: 0 }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- cart.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/pos/cart.ts frontend/lib/pos/cart.test.ts
git commit -m "Add pure cart functions (add/set/remove line, totals)"
```

---

## Task 6: Frontend — usePosCatalog hook + catalog search

**Files:**
- Create: `frontend/lib/pos/usePosCatalog.ts`
- Create: `frontend/lib/pos/search.ts`
- Test: `frontend/lib/pos/usePosCatalog.test.tsx`
- Test: `frontend/lib/pos/search.test.ts`

**Interfaces:**
- Consumes: `fetchAllPages` (Task 2), `Product`/`Category`/`ProductPricing`/`Inventory`/
  `PosProduct` types (Task 2).
- Produces: `usePosCatalog(): {all: PosProduct[], byBarcode: Map<string, PosProduct>, isLoading:
  boolean, isError: boolean}`. `findByBarcode(catalog, barcode): PosProduct | undefined`,
  `searchCatalog(catalog, query): PosProduct[]`. Consumed by Task 7 (`ScanSearchField`) and Task 11
  (`PosCheckout`).

- [ ] **Step 1: Write the failing test for `usePosCatalog`**

Create `frontend/lib/pos/usePosCatalog.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePosCatalog } from "./usePosCatalog";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("usePosCatalog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { product_id: 1, category: 10, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK" },
                { product_id: 2, category: 20, barcode: "PES-TV-00082", name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000" },
                { product_id: 3, category: 20, barcode: "PES-TV-00099", name: "No Price TV", brand: "Samsung", model_number: "X" },
              ]),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { category_id: 10, name: "Audio", code: "AUD" },
                { category_id: 20, name: "Televisions", code: "TV" },
              ]),
          });
        }
        if (url.includes("/product-pricing/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { price_id: 1, product: 1, retail_price: "145000.00", effective_date: "2026-01-01", is_current: true },
                { price_id: 2, product: 2, retail_price: "385000.00", effective_date: "2026-01-01", is_current: true },
              ]),
          });
        }
        if (url.includes("/inventory/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { inventory_id: 1, product: 1, quantity_in_stock: 2, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: true },
                { inventory_id: 2, product: 2, quantity_in_stock: 12, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: false },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("joins products, categories, current pricing, and inventory by product id", async () => {
    const { result } = renderHook(() => usePosCatalog(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all).toHaveLength(3);
    const jbl = result.current.all.find((p) => p.product_id === 1);
    expect(jbl).toEqual({
      product_id: 1,
      barcode: "PES-AUD-00147",
      name: "JBL Flip 6",
      brand: "JBL",
      model_number: "JBLFLIP6BLK",
      category_name: "Audio",
      retail_price: 145000,
      quantity_in_stock: 2,
    });
  });

  it("defaults retail_price and quantity_in_stock to 0 for products missing a pricing or inventory row", async () => {
    const { result } = renderHook(() => usePosCatalog(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const noPriceProduct = result.current.all.find((p) => p.product_id === 3);
    expect(noPriceProduct?.retail_price).toBe(0);
    expect(noPriceProduct?.quantity_in_stock).toBe(0);
  });

  it("indexes products by barcode", async () => {
    const { result } = renderHook(() => usePosCatalog(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.byBarcode.get("PES-TV-00082")?.name).toBe("Samsung TV");
  });
});
```

- [ ] **Step 2: Write the failing test for `search.ts`**

Create `frontend/lib/pos/search.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { findByBarcode, searchCatalog } from "./search";
import type { PosProduct } from "@/lib/types";
import type { PosCatalog } from "./usePosCatalog";

const products: PosProduct[] = [
  { product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL", model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2 },
  { product_id: 2, barcode: "PES-TV-00082", name: "Samsung 43\" Crystal UHD TV", brand: "Samsung", model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 12 },
];

function makeCatalog(): PosCatalog {
  return {
    all: products,
    byBarcode: new Map(products.map((p) => [p.barcode, p])),
    isLoading: false,
    isError: false,
  };
}

describe("findByBarcode", () => {
  it("returns the exact match", () => {
    expect(findByBarcode(makeCatalog(), "PES-TV-00082")?.name).toBe('Samsung 43" Crystal UHD TV');
  });

  it("trims whitespace (scanners sometimes append a trailing newline)", () => {
    expect(findByBarcode(makeCatalog(), "PES-TV-00082\n")?.name).toBe('Samsung 43" Crystal UHD TV');
  });

  it("returns undefined for no match", () => {
    expect(findByBarcode(makeCatalog(), "UNKNOWN")).toBeUndefined();
  });
});

describe("searchCatalog", () => {
  it("matches by name substring, case-insensitively", () => {
    expect(searchCatalog(makeCatalog(), "jbl fli").map((p) => p.product_id)).toEqual([1]);
  });

  it("matches by brand", () => {
    expect(searchCatalog(makeCatalog(), "samsung").map((p) => p.product_id)).toEqual([2]);
  });

  it("matches by model number", () => {
    expect(searchCatalog(makeCatalog(), "ua43du7000").map((p) => p.product_id)).toEqual([2]);
  });

  it("returns an empty array for a blank query", () => {
    expect(searchCatalog(makeCatalog(), "  ")).toEqual([]);
  });

  it("returns an empty array for no match", () => {
    expect(searchCatalog(makeCatalog(), "xyz")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npm run test -- usePosCatalog.test.tsx search.test.ts`
Expected: FAIL — neither `./usePosCatalog` nor `./search` exists yet.

- [ ] **Step 4: Implement `usePosCatalog`**

Create `frontend/lib/pos/usePosCatalog.ts`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory, PosProduct } from "@/lib/types";

export interface PosCatalog {
  all: PosProduct[];
  byBarcode: Map<string, PosProduct>;
  isLoading: boolean;
  isError: boolean;
}

export function usePosCatalog(): PosCatalog {
  const products = useQuery({
    queryKey: ["products"],
    queryFn: () => fetchAllPages<Product>("products/"),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchAllPages<Category>("categories/"),
  });
  const pricing = useQuery({
    queryKey: ["product-pricing", "current"],
    queryFn: () => fetchAllPages<ProductPricing>("product-pricing/?is_current=true"),
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => fetchAllPages<Inventory>("inventory/"),
  });

  const isLoading = products.isLoading || categories.isLoading || pricing.isLoading || inventory.isLoading;
  const isError = products.isError || categories.isError || pricing.isError || inventory.isError;

  const all = useMemo((): PosProduct[] => {
    if (!products.data || !categories.data || !pricing.data || !inventory.data) return [];

    const categoryNameById = new Map(categories.data.map((c) => [c.category_id, c.name]));
    const priceByProductId = new Map(pricing.data.map((p) => [p.product, parseFloat(p.retail_price)]));
    const stockByProductId = new Map(inventory.data.map((i) => [i.product, i.quantity_in_stock]));

    return products.data.map((product) => ({
      product_id: product.product_id,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      model_number: product.model_number,
      category_name: categoryNameById.get(product.category) ?? "",
      retail_price: priceByProductId.get(product.product_id) ?? 0,
      quantity_in_stock: stockByProductId.get(product.product_id) ?? 0,
    }));
  }, [products.data, categories.data, pricing.data, inventory.data]);

  const byBarcode = useMemo(() => new Map(all.map((p) => [p.barcode, p])), [all]);

  return { all, byBarcode, isLoading, isError };
}
```

- [ ] **Step 5: Implement `search.ts`**

Create `frontend/lib/pos/search.ts`:

```typescript
import type { PosProduct } from "@/lib/types";
import type { PosCatalog } from "./usePosCatalog";

export function findByBarcode(catalog: PosCatalog, barcode: string): PosProduct | undefined {
  return catalog.byBarcode.get(barcode.trim());
}

export function searchCatalog(catalog: PosCatalog, query: string): PosProduct[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return catalog.all.filter(
    (p) =>
      p.barcode.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.brand ?? "").toLowerCase().includes(q) ||
      (p.model_number ?? "").toLowerCase().includes(q)
  );
}
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npm run test -- usePosCatalog.test.tsx search.test.ts`
Expected: PASS, all 3 + 7 tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib/pos/usePosCatalog.ts frontend/lib/pos/usePosCatalog.test.tsx frontend/lib/pos/search.ts frontend/lib/pos/search.test.ts
git commit -m "Add usePosCatalog (products+pricing+inventory join) and barcode/name search"
```

---

## Task 7: Frontend — ScanSearchField component

**Files:**
- Create: `frontend/components/pos/ScanSearchField.tsx`
- Test: `frontend/components/pos/ScanSearchField.test.tsx`

**Interfaces:**
- Consumes: `PosCatalog` (Task 6), `findByBarcode`/`searchCatalog` (Task 6), `Button` (existing).
- Produces: `ScanSearchField({catalog, onAdd}: {catalog: PosCatalog, onAdd: (product:
  PosProduct) => void})`. Consumed by Task 11 (`PosCheckout`).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/pos/ScanSearchField.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScanSearchField } from "./ScanSearchField";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";
import type { PosProduct } from "@/lib/types";

const jbl: PosProduct = {
  product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
  model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
};

function makeCatalog(): PosCatalog {
  return { all: [jbl], byBarcode: new Map([[jbl.barcode, jbl]]), isLoading: false, isError: false };
}

describe("ScanSearchField", () => {
  it("calls onAdd with an exact barcode match on Enter", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    const input = screen.getByLabelText("Scan barcode or search product");
    await userEvent.type(input, "PES-AUD-00147{Enter}");
    expect(onAdd).toHaveBeenCalledWith(jbl);
  });

  it("calls onAdd with a name-search match when the Search button is clicked", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "jbl fli");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onAdd).toHaveBeenCalledWith(jbl);
  });

  it("clears the input after a successful match", async () => {
    render(<ScanSearchField catalog={makeCatalog()} onAdd={vi.fn()} />);
    const input = screen.getByLabelText("Scan barcode or search product") as HTMLInputElement;
    await userEvent.type(input, "PES-AUD-00147{Enter}");
    expect(input.value).toBe("");
  });

  it("shows a not-in-catalog message and does not call onAdd when nothing matches", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "UNKNOWN{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Not in catalog — add product?")).toBeInTheDocument();
  });

  it("does nothing on Enter with an empty field", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByText("Not in catalog — add product?")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- ScanSearchField.test.tsx`
Expected: FAIL — `./ScanSearchField` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/pos/ScanSearchField.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { findByBarcode, searchCatalog } from "@/lib/pos/search";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";
import type { PosProduct } from "@/lib/types";

interface ScanSearchFieldProps {
  catalog: PosCatalog;
  onAdd: (product: PosProduct) => void;
}

export function ScanSearchField({ catalog, onAdd }: ScanSearchFieldProps) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [notFound, setNotFound] = useState(false);

  function resolve() {
    const trimmed = query.trim();
    if (!trimmed) return;

    const match = findByBarcode(catalog, trimmed) ?? searchCatalog(catalog, trimmed)[0];
    if (match) {
      onAdd(match);
      setQuery("");
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-xs text-text/70 mb-1">
        Scan barcode or search product
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="w-full max-w-[420px] min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md hover:border-text/45 focus-visible:border-accent focus-visible:outline-none"
          placeholder="Ready to scan…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              resolve();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={resolve}>
          Search
        </Button>
      </div>
      {notFound && <p className="text-xs text-text/60 mt-1">Not in catalog — add product?</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- ScanSearchField.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/pos/ScanSearchField.tsx frontend/components/pos/ScanSearchField.test.tsx
git commit -m "Add ScanSearchField (barcode exact-match + name search, mockup 1b)"
```

---

## Task 8: Frontend — CartTable (desktop layout)

**Files:**
- Create: `frontend/components/pos/CartTable.tsx`
- Test: `frontend/components/pos/CartTable.test.tsx`

**Interfaces:**
- Consumes: `CartLine`, `lineSubtotal` (Task 5), `Button` (existing).
- Produces: `CartTable({lines, onSetQuantity, onRemove}: {lines: CartLine[], onSetQuantity:
  (productId: number, quantity: number) => void, onRemove: (productId: number) => void})`.
  Consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/pos/CartTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartTable } from "./CartTable";
import type { CartLine } from "@/lib/pos/cart";

const line: CartLine = {
  product: {
    product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
    model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
  },
  quantity: 2,
};

describe("CartTable", () => {
  it("shows an empty-cart message with no lines", () => {
    render(<CartTable lines={[]} onSetQuantity={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, barcode, price, quantity, and subtotal", () => {
    render(<CartTable lines={[line]} onSetQuantity={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
    expect(screen.getByText("145,000")).toBeInTheDocument();
    expect(screen.getByText("290,000")).toBeInTheDocument();
  });

  it("calls onSetQuantity when the quantity input changes", async () => {
    const onSetQuantity = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />);
    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "5");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 5);
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={vi.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- CartTable.test.tsx`
Expected: FAIL — `./CartTable` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/pos/CartTable.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";

interface CartTableProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
  onRemove: (productId: number) => void;
}

export function CartTable({ lines, onSetQuantity, onRemove }: CartTableProps) {
  return (
    <table className="hidden lg:table w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-divider">
          <th className="text-left font-medium py-2 px-2 text-text/70">Product</th>
          <th className="text-left font-medium py-2 px-2 text-text/70">Barcode</th>
          <th className="text-right font-medium py-2 px-2 text-text/70">Retail price</th>
          <th className="text-right font-medium py-2 px-2 text-text/70 w-[76px]">Qty</th>
          <th className="text-right font-medium py-2 px-2 text-text/70">Subtotal</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={6} className="py-6 text-center text-text/50">
              No items scanned yet
            </td>
          </tr>
        ) : (
          lines.map((line) => (
            <tr key={line.product.product_id} className="border-b border-divider">
              <td className="py-2 px-2">
                {line.product.name}
                <br />
                <span className="text-xs text-text/50">
                  {line.product.category_name} · {line.product.model_number} ·{" "}
                  {line.product.quantity_in_stock} in stock
                </span>
              </td>
              <td className="py-2 px-2 font-mono text-xs">{line.product.barcode}</td>
              <td className="py-2 px-2 text-right">{line.product.retail_price.toLocaleString()}</td>
              <td className="py-2 px-2 text-right">
                <input
                  type="number"
                  min={1}
                  value={line.quantity}
                  onChange={(e) => onSetQuantity(line.product.product_id, Number(e.target.value))}
                  className="w-14 text-right min-h-9 py-1.5 px-2 border border-divider rounded-md bg-surface"
                />
              </td>
              <td className="py-2 px-2 text-right">{lineSubtotal(line).toLocaleString()}</td>
              <td className="py-2 px-2">
                <Button variant="ghost" onClick={() => onRemove(line.product.product_id)}>
                  Remove
                </Button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- CartTable.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/pos/CartTable.tsx frontend/components/pos/CartTable.test.tsx
git commit -m "Add CartTable desktop checkout layout (mockup 1b)"
```

---

## Task 9: Frontend — CartCards (tablet layout)

**Files:**
- Create: `frontend/components/pos/CartCards.tsx`
- Test: `frontend/components/pos/CartCards.test.tsx`

**Interfaces:**
- Consumes: `CartLine`, `lineSubtotal` (Task 5), `Card` (existing).
- Produces: `CartCards({lines, onSetQuantity}: {lines: CartLine[], onSetQuantity: (productId:
  number, quantity: number) => void})`. Consumed by Task 11. (No `onRemove` — mockup `1n` reduces
  quantity to 0 via the `−` stepper instead of a separate Remove action; `setQuantity` already
  removes the line at 0, per Task 5.)

- [ ] **Step 1: Write the failing test**

Create `frontend/components/pos/CartCards.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartCards } from "./CartCards";
import type { CartLine } from "@/lib/pos/cart";

const line: CartLine = {
  product: {
    product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
    model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
  },
  quantity: 2,
};

describe("CartCards", () => {
  it("shows an empty-cart message with no lines", () => {
    render(<CartCards lines={[]} onSetQuantity={vi.fn()} />);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, price, quantity, and subtotal", () => {
    render(<CartCards lines={[line]} onSetQuantity={vi.fn()} />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("290,000")).toBeInTheDocument();
  });

  it("calls onSetQuantity with quantity + 1 when + is clicked", async () => {
    const onSetQuantity = vi.fn();
    render(<CartCards lines={[line]} onSetQuantity={onSetQuantity} />);
    await userEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 3);
  });

  it("calls onSetQuantity with quantity - 1 when − is clicked", async () => {
    const onSetQuantity = vi.fn();
    render(<CartCards lines={[line]} onSetQuantity={onSetQuantity} />);
    await userEvent.click(screen.getByRole("button", { name: "−" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- CartCards.test.tsx`
Expected: FAIL — `./CartCards` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/pos/CartCards.tsx`:

```tsx
"use client";

import { Card } from "@/components/ui/Card";
import { lineSubtotal, type CartLine } from "@/lib/pos/cart";

interface CartCardsProps {
  lines: CartLine[];
  onSetQuantity: (productId: number, quantity: number) => void;
}

export function CartCards({ lines, onSetQuantity }: CartCardsProps) {
  return (
    <div className="flex lg:hidden flex-col gap-2">
      {lines.length === 0 ? (
        <p className="text-center text-text/50 py-6">No items scanned yet</p>
      ) : (
        lines.map((line) => (
          <Card key={line.product.product_id} elevation="sm">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="text-sm">{line.product.name}</div>
                <div className="text-xs text-text/50">
                  RWF {line.product.retail_price.toLocaleString()}
                </div>
              </div>
              <div className="flex items-center border border-divider rounded-md overflow-hidden">
                <button
                  type="button"
                  aria-label="−"
                  className="w-11 h-11 flex items-center justify-center"
                  onClick={() => onSetQuantity(line.product.product_id, line.quantity - 1)}
                >
                  −
                </button>
                <span className="w-10 text-center text-[15px]">{line.quantity}</span>
                <button
                  type="button"
                  aria-label="+"
                  className="w-11 h-11 flex items-center justify-center"
                  onClick={() => onSetQuantity(line.product.product_id, line.quantity + 1)}
                >
                  +
                </button>
              </div>
              <div className="w-[100px] text-right font-sans font-medium">
                {lineSubtotal(line).toLocaleString()}
              </div>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- CartCards.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/pos/CartCards.tsx frontend/components/pos/CartCards.test.tsx
git commit -m "Add CartCards tablet checkout layout with 44px steppers (mockup 1n)"
```

---

## Task 10: Frontend — Receipt component + print styles

**Files:**
- Create: `frontend/components/pos/Receipt.tsx`
- Modify: `frontend/app/globals.css`
- Test: `frontend/components/pos/Receipt.test.tsx`

**Interfaces:**
- Consumes: `CartLine` (Task 5), `Sale`/`PaymentMethod` (Task 2), `Button` (existing).
- Produces: `Receipt({sale, lines, servedBy, onPrint, onNewSale})`. Consumed by Task 11.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/pos/Receipt.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Receipt } from "./Receipt";
import type { CartLine } from "@/lib/pos/cart";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "590000.00", status: "completed", items: [],
};

const lines: CartLine[] = [
  {
    product: {
      product_id: 1, barcode: "PES-TV-00082", name: "Samsung 43\" TV", brand: "Samsung",
      model_number: "UA43DU7000", category_name: "Televisions", retail_price: 385000, quantity_in_stock: 11,
    },
    quantity: 1,
  },
  {
    product: {
      product_id: 2, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
      model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 1,
    },
    quantity: 1,
  },
];

describe("Receipt", () => {
  it("renders the sale id, payment method, line items, and total", () => {
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={vi.fn()} />);
    expect(screen.getAllByText("#S-841").length).toBeGreaterThan(0);
    expect(screen.getByText("Cash")).toBeInTheDocument();
    expect(screen.getByText("e.mugisha")).toBeInTheDocument();
    expect(screen.getByText('Samsung 43" TV × 1')).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 × 1")).toBeInTheDocument();
    expect(screen.getByText("RWF 590,000")).toBeInTheDocument();
  });

  it("calls onPrint when Print receipt is clicked", async () => {
    const onPrint = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={onPrint} onNewSale={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));
    expect(onPrint).toHaveBeenCalled();
  });

  it("calls onNewSale when New sale is clicked", async () => {
    const onNewSale = vi.fn();
    render(<Receipt sale={sale} lines={lines} servedBy="e.mugisha" onPrint={vi.fn()} onNewSale={onNewSale} />);
    await userEvent.click(screen.getByRole("button", { name: "New sale" }));
    expect(onNewSale).toHaveBeenCalled();
  });

  it("shows an em dash for payment method when none is set", () => {
    render(
      <Receipt
        sale={{ ...sale, payment_method: null }}
        lines={lines}
        servedBy="e.mugisha"
        onPrint={vi.fn()}
        onNewSale={vi.fn()}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- Receipt.test.tsx`
Expected: FAIL — `./Receipt` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/pos/Receipt.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/Button";
import type { CartLine } from "@/lib/pos/cart";
import type { PaymentMethod, Sale } from "@/lib/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_money: "Mobile Money",
  bank_transfer: "Bank Transfer",
};

interface ReceiptProps {
  sale: Sale;
  lines: CartLine[];
  servedBy: string;
  onPrint: () => void;
  onNewSale: () => void;
}

export function Receipt({ sale, lines, servedBy, onPrint, onNewSale }: ReceiptProps) {
  const saleDate = new Date(sale.sale_date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 p-3 rounded-md bg-accent-900 text-accent-100 text-sm shadow-sm">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Sale #S-{sale.sale_id} completed — stock updated, admin notified by email.
      </div>
      <div className="receipt-print bg-surface rounded-md p-6 shadow-sm">
        <div className="text-center mb-4">
          <div className="font-sans font-medium text-lg">Promise Electronic Shop</div>
          <div className="text-xs text-text/50">[Shop Address] · [Phone] · [Email]</div>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Receipt</span>
          <span className="font-mono">#S-{sale.sale_id}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Date</span>
          <span>{saleDate}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Served by</span>
          <span>{servedBy}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text/55">Payment</span>
          <span>{sale.payment_method ? PAYMENT_LABELS[sale.payment_method] : "—"}</span>
        </div>
        <hr className="border-divider my-2" />
        {lines.map((line) => (
          <div key={line.product.product_id} className="flex justify-between text-sm">
            <span>
              {line.product.name} × {line.quantity}
            </span>
            <span>{(line.product.retail_price * line.quantity).toLocaleString()}</span>
          </div>
        ))}
        <hr className="border-divider my-2" />
        <div className="flex justify-between font-sans font-medium text-lg">
          <span>Total</span>
          <span>RWF {Number(sale.total_amount).toLocaleString()}</span>
        </div>
        <p className="text-xs text-text/50 text-center mt-4">
          Murakoze! Thank you for shopping with us.
          <br />
          Warranty per product — keep this receipt.
        </p>
      </div>
      <div className="flex gap-2 justify-end print:hidden">
        <Button variant="secondary" onClick={onPrint}>
          Print receipt
        </Button>
        <Button onClick={onNewSale}>New sale</Button>
      </div>
    </div>
  );
}
```

Add to `frontend/app/globals.css` (after the existing `@layer base` block):

```css
@media print {
  body * {
    visibility: hidden;
  }
  .receipt-print,
  .receipt-print * {
    visibility: visible;
  }
  .receipt-print {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- Receipt.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/pos/Receipt.tsx frontend/components/pos/Receipt.test.tsx frontend/app/globals.css
git commit -m "Add Receipt component with print stylesheet (mockup 1c)"
```

---

## Task 11: Frontend — PosCheckout container, replacing the checkout stub

**Files:**
- Create: `frontend/components/pos/PosCheckout.tsx`
- Modify: `frontend/app/(protected)/checkout/page.tsx`
- Test: `frontend/components/pos/PosCheckout.test.tsx`

**Interfaces:**
- Consumes: `usePosCatalog` (Task 6), `addItem`/`setQuantity`/`removeItem`/`totals` (Task 5),
  `ScanSearchField` (Task 7), `CartTable` (Task 8), `CartCards` (Task 9), `Receipt` (Task 10),
  `apiFetch`/`ApiError`/`extractErrorMessage` (Task 2 + existing), `useToast` (Task 3),
  `SegmentedToggle`/`Button`/`Card`/`CardKicker` (existing).
- Produces: `PosCheckout({servedBy}: {servedBy: string})`. Consumed by
  `app/(protected)/checkout/page.tsx`, replacing the `"Coming soon."` stub.

- [ ] **Step 1: Write the failing test**

Create `frontend/components/pos/PosCheckout.test.tsx`. This mocks `usePosCatalog` (already
unit-tested in Task 6) and `fetch` (for the `POST /sales/` call), so the test exercises
`PosCheckout`'s own wiring, not the join logic or the network layer again.

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PosCheckout } from "./PosCheckout";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePosCatalogModule from "@/lib/pos/usePosCatalog";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";

const jbl = {
  product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
  model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("PosCheckout", () => {
  beforeEach(() => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [jbl],
      byBarcode: new Map([[jbl.barcode, jbl]]),
      isLoading: false,
      isError: false,
    } as PosCatalog);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("adds a scanned product to the cart and updates the total", async () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    expect(await screen.findByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
  });

  it("disables Complete sale with an empty cart", () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  it("posts to /api/proxy/sales/ and shows the receipt on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(await screen.findByText("#S-841")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/sales/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ items: [{ product: 1, quantity: 1 }], payment_method: "cash" }),
      })
    );
  });

  it("shows an error toast and keeps the cart when the sale submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Insufficient stock for product 1: requested 1, available 0." }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(
      await screen.findByText("Insufficient stock for product 1: requested 1, available 0.")
    ).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("calls window.print when Print receipt is clicked on the receipt view", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("returns to an empty cart when New sale is clicked from the receipt", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "New sale" }));

    expect(screen.getByLabelText("Scan barcode or search product")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6 Speaker")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- PosCheckout.test.tsx`
Expected: FAIL — `./PosCheckout` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/pos/PosCheckout.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePosCatalog } from "@/lib/pos/usePosCatalog";
import { addItem, removeItem, setQuantity, totals, type CartLine } from "@/lib/pos/cart";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import { useToast } from "@/components/layout/ToastProvider";
import { ScanSearchField } from "./ScanSearchField";
import { CartTable } from "./CartTable";
import { CartCards } from "./CartCards";
import { Receipt } from "./Receipt";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import { Card, CardKicker } from "@/components/ui/Card";
import type { PaymentMethod, PosProduct, Sale } from "@/lib/types";

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mobile_money", label: "MoMo" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank" },
];

interface PosCheckoutProps {
  servedBy: string;
}

export function PosCheckout({ servedBy }: PosCheckoutProps) {
  const catalog = usePosCatalog();
  const { show } = useToast();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [completedLines, setCompletedLines] = useState<CartLine[]>([]);

  function handleAdd(product: PosProduct) {
    setLines((current) => addItem(current, product));
  }

  function handleSetQuantity(productId: number, quantity: number) {
    setLines((current) => setQuantity(current, productId, quantity));
  }

  function handleRemove(productId: number) {
    setLines((current) => removeItem(current, productId));
  }

  async function handleCompleteSale() {
    if (lines.length === 0) return;
    setSubmitting(true);
    try {
      const sale = await apiFetch<Sale>("sales/", {
        method: "POST",
        body: JSON.stringify({
          items: lines.map((line) => ({ product: line.product.product_id, quantity: line.quantity })),
          payment_method: paymentMethod,
        }),
      });
      setCompletedSale(sale);
      setCompletedLines(lines);
      setLines([]);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? extractErrorMessage(error.body)
          : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewSale() {
    setCompletedSale(null);
    setCompletedLines([]);
  }

  if (completedSale) {
    return (
      <Receipt
        sale={completedSale}
        lines={completedLines}
        servedBy={servedBy}
        onPrint={() => window.print()}
        onNewSale={handleNewSale}
      />
    );
  }

  const { itemCount, subtotal } = totals(lines);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
      <div>
        <h4 className="mb-4">New sale</h4>
        <ScanSearchField catalog={catalog} onAdd={handleAdd} />
        <CartTable lines={lines} onSetQuantity={handleSetQuantity} onRemove={handleRemove} />
        <CartCards lines={lines} onSetQuantity={handleSetQuantity} />
      </div>
      <div className="flex flex-col gap-4">
        <Card elevation="md">
          <CardKicker>Total</CardKicker>
          <div className="flex justify-between text-sm">
            <span>Items ({itemCount})</span>
            <span>RWF {subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between font-sans font-medium text-xl mt-1.5">
            <span>Due</span>
            <span className="text-accent-300">RWF {subtotal.toLocaleString()}</span>
          </div>
        </Card>
        <div>
          <label className="block text-xs text-text/70 mb-1">Payment method</label>
          <SegmentedToggle
            name="payment"
            options={PAYMENT_OPTIONS}
            value={paymentMethod}
            onChange={(value) => setPaymentMethod(value as PaymentMethod)}
          />
        </div>
        <Button
          block
          disabled={lines.length === 0 || submitting}
          onClick={handleCompleteSale}
          className="min-h-11"
        >
          {submitting ? "Completing…" : "Complete sale"}
        </Button>
      </div>
    </div>
  );
}
```

Replace `frontend/app/(protected)/checkout/page.tsx`:

```tsx
import { getSession } from "@/lib/auth";
import { PosCheckout } from "@/components/pos/PosCheckout";

export default async function CheckoutPage() {
  const session = await getSession();
  return <PosCheckout servedBy={session?.username ?? ""} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- PosCheckout.test.tsx`
Expected: PASS, all 6 tests.

- [ ] **Step 5: Run the full Vitest suite and production build**

Run: `npm run test && npm run build`
Expected: all tests pass (existing + this phase's new ones); build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/pos/PosCheckout.tsx frontend/components/pos/PosCheckout.test.tsx "frontend/app/(protected)/checkout/page.tsx"
git commit -m "Wire PosCheckout into /checkout, replacing the Coming soon stub"
```

---

## Task 12: Frontend — Playwright e2e smoke test

**Files:**
- Create: `frontend/e2e/checkout.spec.ts`

**Interfaces:**
- Consumes: the real running backend + frontend dev server (same setup `e2e/login.spec.ts` already
  uses), plus a fixture product/price/inventory row created via Django shell.

- [ ] **Step 1: Create fixture data**

Following the same pattern documented in `.superpowers/sdd/2026-08-24-frontend-phase1-foundation/task-6-report.md`
for `staff1`/`admin1`, create a fixture product idempotently against the running dev backend:

```bash
docker compose exec web python manage.py shell -c "
from catalog.models import Category, Product, ProductPricing
from stock.models import Inventory
from datetime import date

category, _ = Category.objects.get_or_create(code='AUD', defaults={'name': 'Audio'})
product, created = Product.objects.get_or_create(
    barcode='PES-E2E-00001',
    defaults={'category': category, 'name': 'E2E Test Speaker', 'brand': 'TestBrand'},
)
ProductPricing.objects.get_or_create(
    product=product, is_current=True,
    defaults={'wholesale_price': '50000.00', 'retail_price': '75000.00', 'effective_date': date(2026, 1, 1)},
)
inventory, _ = Inventory.objects.get_or_create(product=product, defaults={'quantity_in_stock': 100})
if not created:
    inventory.quantity_in_stock = 100
    inventory.save(update_fields=['quantity_in_stock'])
print('fixture ready:', product.barcode)
"
```

- [ ] **Step 2: Write the e2e test**

Create `frontend/e2e/checkout.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Checkout", () => {
  test("staff can scan a product, complete a sale, and see the receipt", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("staff1");
    await page.getByLabel("Password").fill("staffpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/checkout");

    await page.getByLabel("Scan barcode or search product").fill("PES-E2E-00001");
    await page.getByLabel("Scan barcode or search product").press("Enter");
    await expect(page.getByText("E2E Test Speaker")).toBeVisible();

    await page.getByRole("button", { name: "Complete sale" }).click();

    await expect(page.getByText(/Sale #S-\d+ completed/)).toBeVisible();
    await expect(page.getByText("RWF 75,000")).toBeVisible();

    await page.getByRole("button", { name: "New sale" }).click();
    await expect(page.getByLabel("Scan barcode or search product")).toHaveValue("");
    await expect(page.getByText("No items scanned yet")).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS, both `login.spec.ts` (existing, unaffected) and the new `checkout.spec.ts` test
green against the live backend.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/checkout.spec.ts
git commit -m "Add checkout e2e smoke test: scan, complete sale, see receipt"
```

---

## Final verification

- [ ] Run the full backend suite: `docker compose exec web pytest` — same pass count as before
  Task 1 + 2.
- [ ] Run the full frontend suite: `cd frontend && npm run test` — all tests pass, count grows by
  roughly 45 across Tasks 2-11.
- [ ] Run the production build: `cd frontend && npm run build` — exits 0.
- [ ] Run the full e2e suite: `cd frontend && npm run test:e2e` — `login.spec.ts` and
  `checkout.spec.ts` both green.
- [ ] Manually verify in a browser at both a desktop width (≥1024px, `CartTable`) and a narrower
  width (<1024px, `CartCards`) that scanning, quantity changes, completing a sale, printing (print
  preview shows only the receipt), and starting a new sale all work.
