# Frontend Phase 3: Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the product catalog screens — list (search/filter/browse) and detail (stock,
pricing, specs, price history, edit) — replacing the current 404 at `/products`.

**Architecture:** Two new hooks (`useCatalogProducts`, `useProductDetail`) join the same backend
list endpoints Phase 2 already fetches, using identical TanStack Query keys so both phases share
one cache. A shared `ProductFormDialog` handles both create and edit; a separate `SetPriceDialog`
creates new `ProductPricing` rows. Six small presentational cards make up the product detail page.
No backend changes — every endpoint this phase needs already exists.

**Tech Stack:** Next.js 16 App Router + TypeScript, TanStack Query, Tailwind, Vitest + React
Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-frontend-phase3-catalog-design.md`

## Global Constraints

- No backend changes — every endpoint used here (`/products/`, `/categories/`,
  `/product-pricing/`, `/inventory/`, `/equipment-units/`) already exists and already supports
  what this phase needs.
- "+ New product" and "Edit" are visible only to `admin`/`manager` roles (UI-only gate; the backend
  itself allows any authenticated employee — this is a deliberate product decision, not a security
  boundary).
- The Wholesale price column/card is visible only to `admin`/`manager` — the backend already omits
  `wholesale_price` from the API response for non-admins, so this is belt-and-suspenders UI framing
  matching the mockup's "Admin only" note, not new access control.
- `category` is settable only at product creation — immutable after, matching the backend's
  `validate_category` rejection of changes.
- `storage_location` is never shown on the create form, and shown on the edit form only when the
  product being edited already has an `Inventory` row — a brand-new product has none until it's
  first received or sold (nothing auto-creates one, and `InventoryViewSet` has no `POST`).
- "Reorder" renders as a disabled placeholder button — no behavior.
- "Track serials" is derived from `GET /equipment-units/?product=<id>` returning at least one row
  — never a stored field.
- Every list fetch pages through completion via the existing `fetchAllPages` helper — never assume
  a bare array or one page is everything.
- All API calls go through the existing BFF proxy (`apiFetch`/`fetchAllPages` → `/api/proxy/<path>`).
- Reuse existing types (`Product`, `Category`, `ProductPricing`, `Inventory`, `PaginatedResponse`)
  from `frontend/lib/types.ts` — do not redefine them.
- Reuse the exact TanStack Query keys Phase 2 already established: `["products"]`, `["categories"]`,
  `["product-pricing", "current"]`, `["inventory"]` — for cache sharing across `/checkout` and
  `/products`. New keys introduced by this phase (e.g. per-product price history) must not collide
  with these.

---

## Task 1: `useCatalogProducts` hook

**Files:**
- Create: `frontend/lib/products/useCatalogProducts.ts`
- Test: `frontend/lib/products/useCatalogProducts.test.tsx`

**Interfaces:**
- Consumes: `fetchAllPages` (`frontend/lib/api-client.ts`), `Product`/`Category`/`ProductPricing`/
  `Inventory` (`frontend/lib/types.ts`).
- Produces: `CatalogProduct` type, `CatalogProducts` type
  (`{all: CatalogProduct[], categories: Category[], isLoading: boolean, isError: boolean}`),
  `useCatalogProducts(): CatalogProducts`. Consumed by Task 4 (`ProductTable`) and Task 10 (list
  page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/products/useCatalogProducts.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCatalogProducts } from "./useCatalogProducts";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useCatalogProducts", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { product_id: 1, category: 10, barcode: "PES-TV-00082", name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", reorder_level: 5 },
                { product_id: 2, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", reorder_level: 4 },
                { product_id: 3, category: 20, barcode: "PES-AUD-00099", name: "No Stock Mic", brand: "Boya", model_number: "BY-M1", reorder_level: 5 },
              ]),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { category_id: 10, name: "Televisions", code: "TV" },
                { category_id: 20, name: "Audio", code: "AUD" },
              ]),
          });
        }
        if (url.includes("/product-pricing/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { price_id: 1, product: 1, wholesale_price: "318000.00", retail_price: "385000.00", effective_date: "2026-01-01", is_current: true },
                { price_id: 2, product: 2, retail_price: "145000.00", effective_date: "2026-01-01", is_current: true },
              ]),
          });
        }
        if (url.includes("/inventory/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { inventory_id: 1, product: 1, quantity_in_stock: 12, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: false },
                { inventory_id: 2, product: 2, quantity_in_stock: 2, quantity_in_use: 0, quantity_damaged: 0, is_low_stock: true },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("joins products, categories, current pricing, and inventory", async () => {
    const { result } = renderHook(() => useCatalogProducts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const tv = result.current.all.find((p) => p.product_id === 1);
    expect(tv).toEqual({
      product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000",
      barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions",
      retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12,
      reorder_level: 5, status: "ok",
    });
  });

  it("marks a product with stock at or below reorder level as low_stock", async () => {
    const { result } = renderHook(() => useCatalogProducts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const jbl = result.current.all.find((p) => p.product_id === 2);
    expect(jbl?.status).toBe("low_stock");
    expect(jbl?.wholesale_price).toBeNull();
  });

  it("marks a product with zero stock as out_of_stock even when reorder_level is higher", async () => {
    const { result } = renderHook(() => useCatalogProducts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const noStock = result.current.all.find((p) => p.product_id === 3);
    expect(noStock?.status).toBe("out_of_stock");
    expect(noStock?.quantity_in_stock).toBe(0);
    expect(noStock?.retail_price).toBe(0);
  });

  it("exposes the fetched categories list", async () => {
    const { result } = renderHook(() => useCatalogProducts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.categories.map((c) => c.name)).toEqual(["Televisions", "Audio"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- useCatalogProducts.test.tsx`
Expected: FAIL — `./useCatalogProducts` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/products/useCatalogProducts.ts`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory } from "@/lib/types";

export interface CatalogProduct {
  product_id: number;
  name: string;
  brand: string | null;
  model_number: string | null;
  barcode: string;
  category_id: number;
  category_name: string;
  retail_price: number;
  wholesale_price: number | null;
  quantity_in_stock: number;
  reorder_level: number;
  status: "ok" | "low_stock" | "out_of_stock";
}

export interface CatalogProducts {
  all: CatalogProduct[];
  categories: Category[];
  isLoading: boolean;
  isError: boolean;
}

function deriveStatus(quantityInStock: number, reorderLevel: number): CatalogProduct["status"] {
  if (quantityInStock === 0) return "out_of_stock";
  if (quantityInStock <= reorderLevel) return "low_stock";
  return "ok";
}

export function useCatalogProducts(): CatalogProducts {
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

  const all = useMemo((): CatalogProduct[] => {
    if (!products.data || !categories.data || !pricing.data || !inventory.data) return [];

    const categoryNameById = new Map(categories.data.map((c) => [c.category_id, c.name]));
    const priceByProductId = new Map(
      pricing.data.map((p) => [
        p.product,
        {
          retail: parseFloat(p.retail_price),
          wholesale: p.wholesale_price !== undefined ? parseFloat(p.wholesale_price) : null,
        },
      ])
    );
    const stockByProductId = new Map(inventory.data.map((i) => [i.product, i.quantity_in_stock]));

    return products.data.map((product): CatalogProduct => {
      const price = priceByProductId.get(product.product_id);
      const quantity_in_stock = stockByProductId.get(product.product_id) ?? 0;
      return {
        product_id: product.product_id,
        name: product.name,
        brand: product.brand,
        model_number: product.model_number,
        barcode: product.barcode,
        category_id: product.category,
        category_name: categoryNameById.get(product.category) ?? "",
        retail_price: price?.retail ?? 0,
        wholesale_price: price?.wholesale ?? null,
        quantity_in_stock,
        reorder_level: product.reorder_level,
        status: deriveStatus(quantity_in_stock, product.reorder_level),
      };
    });
  }, [products.data, categories.data, pricing.data, inventory.data]);

  return { all, categories: categories.data ?? [], isLoading, isError };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- useCatalogProducts.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/products/useCatalogProducts.ts frontend/lib/products/useCatalogProducts.test.tsx
git commit -m "Add useCatalogProducts: products+categories+pricing+inventory join with status derivation"
```

---

## Task 2: `useProductDetail` hook

**Files:**
- Create: `frontend/lib/products/useProductDetail.ts`
- Test: `frontend/lib/products/useProductDetail.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `fetchAllPages` (`frontend/lib/api-client.ts`), `Product`/`Category`/
  `ProductPricing`/`Inventory`/`PaginatedResponse` (`frontend/lib/types.ts`).
- Produces: `ProductDetail` type, `useProductDetail(productId: number): ProductDetail`. Consumed by
  Task 11 (detail page) and indirectly by Tasks 5/6/7's card components (via props the page passes
  down, not by calling the hook themselves).

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/products/useProductDetail.test.tsx`:

```tsx
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useProductDetail } from "./useProductDetail";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useProductDetail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/1/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6",
              brand: "JBL", model_number: "JBLFLIP6BLK", description: null, specifications: "30W RMS",
              usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
              is_active: true, created_at: "2026-01-01T00:00:00Z",
            }),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 20, name: "Audio", code: "AUD" }]) });
        }
        if (url.includes("/product-pricing/?product=1")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true },
                { price_id: 1, product: 1, wholesale_price: "118000.00", retail_price: "155000.00", effective_date: "2026-02-15", is_current: false },
              ]),
          });
        }
        if (url.includes("/inventory/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ inventory_id: 1, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2", is_low_stock: true }]),
          });
        }
        if (url.includes("/equipment-units/?product=1")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ unit_id: 1 }]) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("resolves the product, its category, current price, and inventory", async () => {
    const { result } = renderHook(() => useProductDetail(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.product?.name).toBe("JBL Flip 6");
    expect(result.current.category?.name).toBe("Audio");
    expect(result.current.currentPricing?.price_id).toBe(2);
    expect(result.current.inventory?.storage_location).toBe("Shelf B2");
  });

  it("orders price history with the current row included and findable", async () => {
    const { result } = renderHook(() => useProductDetail(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.priceHistory).toHaveLength(2);
    expect(result.current.priceHistory.find((p) => p.is_current)?.price_id).toBe(2);
  });

  it("derives hasTrackedSerials true when equipment units exist for the product", async () => {
    const { result } = renderHook(() => useProductDetail(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasTrackedSerials).toBe(true);
  });
});

describe("useProductDetail with no inventory or equipment rows", () => {
  it("returns undefined inventory and hasTrackedSerials false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/2/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              product_id: 2, category: 20, barcode: "PES-NEW-00001", name: "Brand New Item",
              brand: null, model_number: null, description: null, specifications: null,
              usage_instructions: null, warranty_months: 0, reorder_level: 5, unit: "pcs",
              is_active: true, created_at: "2026-08-01T00:00:00Z",
            }),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 20, name: "Audio", code: "AUD" }]) });
        }
        if (url.includes("/product-pricing/?product=2")) {
          return Promise.resolve({ ok: true, json: async () => paginated([]) });
        }
        if (url.includes("/inventory/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([]) });
        }
        if (url.includes("/equipment-units/?product=2")) {
          return Promise.resolve({ ok: true, json: async () => paginated([]) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
    const { result } = renderHook(() => useProductDetail(2), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.inventory).toBeUndefined();
    expect(result.current.currentPricing).toBeUndefined();
    expect(result.current.hasTrackedSerials).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- useProductDetail.test.tsx`
Expected: FAIL — `./useProductDetail` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/products/useProductDetail.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { apiFetch, fetchAllPages } from "@/lib/api-client";
import type { Product, Category, ProductPricing, Inventory, PaginatedResponse } from "@/lib/types";

export interface ProductDetail {
  product: Product | undefined;
  category: Category | undefined;
  currentPricing: ProductPricing | undefined;
  priceHistory: ProductPricing[];
  inventory: Inventory | undefined;
  hasTrackedSerials: boolean;
  isLoading: boolean;
  isError: boolean;
}

export function useProductDetail(productId: number): ProductDetail {
  const product = useQuery({
    queryKey: ["products", productId],
    queryFn: () => apiFetch<Product>(`products/${productId}/`),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchAllPages<Category>("categories/"),
  });
  const priceHistory = useQuery({
    queryKey: ["product-pricing", "history", productId],
    queryFn: () => fetchAllPages<ProductPricing>(`product-pricing/?product=${productId}`),
  });
  const inventory = useQuery({
    queryKey: ["inventory"],
    queryFn: () => fetchAllPages<Inventory>("inventory/"),
  });
  const equipmentCount = useQuery({
    queryKey: ["equipment-units", "count", productId],
    queryFn: () => apiFetch<PaginatedResponse<{ unit_id: number }>>(`equipment-units/?product=${productId}`),
  });

  const isLoading =
    product.isLoading || categories.isLoading || priceHistory.isLoading || inventory.isLoading || equipmentCount.isLoading;
  const isError =
    product.isError || categories.isError || priceHistory.isError || inventory.isError || equipmentCount.isError;

  const category = categories.data?.find((c) => c.category_id === product.data?.category);
  const currentPricing = priceHistory.data?.find((p) => p.is_current);
  const productInventory = inventory.data?.find((i) => i.product === productId);
  const hasTrackedSerials = (equipmentCount.data?.count ?? 0) > 0;

  return {
    product: product.data,
    category,
    currentPricing,
    priceHistory: priceHistory.data ?? [],
    inventory: productInventory,
    hasTrackedSerials,
    isLoading,
    isError,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- useProductDetail.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/products/useProductDetail.ts frontend/lib/products/useProductDetail.test.tsx
git commit -m "Add useProductDetail: single product + price history + inventory + track-serials derivation"
```

---

## Task 3: `productForm` payload/validation helpers

**Files:**
- Create: `frontend/lib/products/productForm.ts`
- Test: `frontend/lib/products/productForm.test.ts`

**Interfaces:**
- Consumes: `Product` (`frontend/lib/types.ts`).
- Produces: `ProductFormValues` type, `emptyProductFormValues()`, `productFormValuesFromProduct(product, storageLocation)`,
  `ProductPayload` type, `buildProductPayload(values, mode)`, `ProductFormErrors` type,
  `validateProductForm(values, mode)`. Consumed by Task 8 (`ProductFormDialog`).

- [ ] **Step 1: Write the failing tests**

Create `frontend/lib/products/productForm.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  emptyProductFormValues,
  productFormValuesFromProduct,
  buildProductPayload,
  validateProductForm,
} from "./productForm";
import type { Product } from "@/lib/types";

const product: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: "30W RMS",
  usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
  is_active: true, created_at: "2026-01-01T00:00:00Z",
};

describe("emptyProductFormValues", () => {
  it("returns all-blank values with no category selected", () => {
    expect(emptyProductFormValues()).toEqual({
      name: "", category: "", brand: "", model_number: "", description: "",
      specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
      unit: "", storage_location: "",
    });
  });
});

describe("productFormValuesFromProduct", () => {
  it("converts a Product into form string values, substituting empty strings for null fields", () => {
    expect(productFormValuesFromProduct(product, "Shelf B2")).toEqual({
      name: "JBL Flip 6", category: 20, brand: "JBL", model_number: "JBLFLIP6BLK",
      description: "", specifications: "30W RMS", usage_instructions: "Hold power 2s.",
      warranty_months: "12", reorder_level: "4", unit: "pcs", storage_location: "Shelf B2",
    });
  });

  it("uses an empty string for storage_location when none is passed", () => {
    expect(productFormValuesFromProduct(product, null).storage_location).toBe("");
  });
});

describe("buildProductPayload", () => {
  it("includes category on create when one is selected", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    expect(buildProductPayload(values, "create")).toMatchObject({ name: "New Item", category: 20 });
  });

  it("omits category on edit even when set (immutable after creation)", () => {
    const values = { ...productFormValuesFromProduct(product, null) };
    const payload = buildProductPayload(values, "edit");
    expect(payload.category).toBeUndefined();
  });

  it("converts blank optional text fields to null", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    const payload = buildProductPayload(values, "create");
    expect(payload.brand).toBeNull();
    expect(payload.model_number).toBeNull();
  });

  it("omits numeric fields left blank so the backend's own defaults apply", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "" };
    const payload = buildProductPayload(values, "create");
    expect(payload.warranty_months).toBeUndefined();
    expect(payload.reorder_level).toBeUndefined();
    expect(payload.unit).toBeUndefined();
  });

  it("includes numeric fields when provided", () => {
    const values = { ...emptyProductFormValues(), name: "New Item", category: 20 as number | "", warranty_months: "6", reorder_level: "10", unit: "box" };
    const payload = buildProductPayload(values, "create");
    expect(payload.warranty_months).toBe(6);
    expect(payload.reorder_level).toBe(10);
    expect(payload.unit).toBe("box");
  });
});

describe("validateProductForm", () => {
  it("requires a name", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), category: 20 }, "create");
    expect(errors.name).toBeDefined();
  });

  it("requires a category on create", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "New Item" }, "create");
    expect(errors.category).toBeDefined();
  });

  it("does not require category on edit", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "Existing Item" }, "edit");
    expect(errors.category).toBeUndefined();
  });

  it("returns no errors for a valid create form", () => {
    const errors = validateProductForm({ ...emptyProductFormValues(), name: "New Item", category: 20 }, "create");
    expect(errors).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- productForm.test.ts`
Expected: FAIL — `./productForm` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/lib/products/productForm.ts`:

```typescript
import type { Product } from "@/lib/types";

export interface ProductFormValues {
  name: string;
  category: number | "";
  brand: string;
  model_number: string;
  description: string;
  specifications: string;
  usage_instructions: string;
  warranty_months: string;
  reorder_level: string;
  unit: string;
  storage_location: string;
}

export function emptyProductFormValues(): ProductFormValues {
  return {
    name: "", category: "", brand: "", model_number: "", description: "",
    specifications: "", usage_instructions: "", warranty_months: "", reorder_level: "",
    unit: "", storage_location: "",
  };
}

export function productFormValuesFromProduct(
  product: Product,
  storageLocation: string | null
): ProductFormValues {
  return {
    name: product.name,
    category: product.category,
    brand: product.brand ?? "",
    model_number: product.model_number ?? "",
    description: product.description ?? "",
    specifications: product.specifications ?? "",
    usage_instructions: product.usage_instructions ?? "",
    warranty_months: product.warranty_months != null ? String(product.warranty_months) : "",
    reorder_level: String(product.reorder_level),
    unit: product.unit,
    storage_location: storageLocation ?? "",
  };
}

export interface ProductPayload {
  name: string;
  category?: number;
  brand: string | null;
  model_number: string | null;
  description: string | null;
  specifications: string | null;
  usage_instructions: string | null;
  warranty_months?: number;
  reorder_level?: number;
  unit?: string;
}

export function buildProductPayload(
  values: ProductFormValues,
  mode: "create" | "edit"
): ProductPayload {
  const payload: ProductPayload = {
    name: values.name.trim(),
    brand: values.brand.trim() || null,
    model_number: values.model_number.trim() || null,
    description: values.description.trim() || null,
    specifications: values.specifications.trim() || null,
    usage_instructions: values.usage_instructions.trim() || null,
  };
  if (mode === "create" && values.category !== "") {
    payload.category = values.category;
  }
  if (values.warranty_months.trim() !== "") {
    payload.warranty_months = Number(values.warranty_months);
  }
  if (values.reorder_level.trim() !== "") {
    payload.reorder_level = Number(values.reorder_level);
  }
  if (values.unit.trim() !== "") {
    payload.unit = values.unit.trim();
  }
  return payload;
}

export type ProductFormErrors = Partial<Record<"name" | "category", string>>;

export function validateProductForm(
  values: ProductFormValues,
  mode: "create" | "edit"
): ProductFormErrors {
  const errors: ProductFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required.";
  }
  if (mode === "create" && values.category === "") {
    errors.category = "Category is required.";
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- productForm.test.ts`
Expected: PASS, all 11 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/products/productForm.ts frontend/lib/products/productForm.test.ts
git commit -m "Add productForm payload-building and validation helpers"
```

---

## Task 4: `ProductTable` component

**Files:**
- Create: `frontend/components/products/ProductTable.tsx`
- Test: `frontend/components/products/ProductTable.test.tsx`

**Interfaces:**
- Consumes: `CatalogProduct` (Task 1), `Table` (`frontend/components/ui/Table.tsx`, existing), `Tag`
  (existing).
- Produces: `ProductTable({products, showWholesale}: {products: CatalogProduct[], showWholesale:
  boolean})`. Consumed by Task 10 (list page).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/products/ProductTable.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductTable } from "./ProductTable";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const products: CatalogProduct[] = [
  {
    product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000",
    barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions",
    retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12,
    reorder_level: 5, status: "ok",
  },
  {
    product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK",
    barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio",
    retail_price: 145000, wholesale_price: null, quantity_in_stock: 2,
    reorder_level: 4, status: "low_stock",
  },
];

describe("ProductTable", () => {
  it("shows an empty-state message with no products", () => {
    render(<ProductTable products={[]} showWholesale={false} />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });

  it("renders product name, category, barcode, retail price, stock, and status", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("Televisions")).toBeInTheDocument();
    expect(screen.getByText("PES-TV-00082")).toBeInTheDocument();
    expect(screen.getByText("385,000")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });

  it("hides the Wholesale column when showWholesale is false", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.queryByRole("columnheader", { name: "Wholesale" })).not.toBeInTheDocument();
    expect(screen.queryByText("318,000")).not.toBeInTheDocument();
  });

  it("shows the Wholesale column with a dash for a missing price when showWholesale is true", () => {
    render(<ProductTable products={products} showWholesale={true} />);
    expect(screen.getByRole("columnheader", { name: "Wholesale" })).toBeInTheDocument();
    expect(screen.getByText("318,000")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("links each row to its product detail page", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/products/1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- ProductTable.test.tsx`
Expected: FAIL — `./ProductTable` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/ProductTable.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const STATUS_TAG: Record<CatalogProduct["status"], { label: string; variant: "accent" | "outline" | "neutral" }> = {
  ok: { label: "OK", variant: "accent" },
  low_stock: { label: "Low stock", variant: "outline" },
  out_of_stock: { label: "Out of stock", variant: "neutral" },
};

interface ProductTableProps {
  products: CatalogProduct[];
  showWholesale: boolean;
}

export function ProductTable({ products, showWholesale }: ProductTableProps) {
  const columns = [
    {
      key: "name",
      header: "Product",
      render: (p: CatalogProduct) => (
        <>
          {p.name}
          <br />
          <span className="text-xs text-text/50">
            {p.brand} · {p.model_number}
          </span>
        </>
      ),
    },
    { key: "category_name", header: "Category" },
    {
      key: "barcode",
      header: "Barcode",
      render: (p: CatalogProduct) => <span className="font-mono text-xs">{p.barcode}</span>,
    },
    {
      key: "retail_price",
      header: "Retail",
      render: (p: CatalogProduct) => p.retail_price.toLocaleString(),
    },
    ...(showWholesale
      ? [
          {
            key: "wholesale_price",
            header: "Wholesale",
            render: (p: CatalogProduct) =>
              p.wholesale_price != null ? (
                <span className="text-text/50">{p.wholesale_price.toLocaleString()}</span>
              ) : (
                "—"
              ),
          },
        ]
      : []),
    { key: "quantity_in_stock", header: "In stock" },
    {
      key: "status",
      header: "Status",
      render: (p: CatalogProduct) => {
        const tag = STATUS_TAG[p.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
    },
    {
      key: "open",
      header: "",
      render: (p: CatalogProduct) => <Link href={`/products/${p.product_id}`}>Open</Link>,
    },
  ];

  return (
    <Table columns={columns} rows={products} rowKey={(p) => String(p.product_id)} emptyMessage="No products found" />
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- ProductTable.test.tsx`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Run a production build to confirm `Table`'s generic type accepts `CatalogProduct`**

Run: `cd frontend && npm run build`
Expected: exit 0. (Vitest's transform doesn't type-check, so this is the first point a generic
type mismatch between `Table<T extends Record<string, unknown>>` and `CatalogProduct` would
surface — it's expected to pass, matching the existing precedent of plain object literals being
used with this same generic in `Table.test.tsx`, but confirm it here before later tasks build on
this file.)

- [ ] **Step 6: Commit**

```bash
git add frontend/components/products/ProductTable.tsx frontend/components/products/ProductTable.test.tsx
git commit -m "Add ProductTable (mockup 1d list layout, role-gated Wholesale column)"
```

---

## Task 5: `StockCard` and `CatalogInfoCard` components

**Files:**
- Create: `frontend/components/products/StockCard.tsx`
- Create: `frontend/components/products/CatalogInfoCard.tsx`
- Test: `frontend/components/products/StockCard.test.tsx`
- Test: `frontend/components/products/CatalogInfoCard.test.tsx`

**Interfaces:**
- Consumes: `Inventory`, `Category` (`frontend/lib/types.ts`), `Card`/`CardKicker` (existing).
- Produces: `StockCard({inventory}: {inventory: Inventory | undefined})`,
  `CatalogInfoCard({category, brand, modelNumber, warrantyMonths, hasTrackedSerials}: {category:
  Category | undefined, brand: string | null, modelNumber: string | null, warrantyMonths: number,
  hasTrackedSerials: boolean})`. Both consumed by Task 11 (detail page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/products/StockCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockCard } from "./StockCard";
import type { Inventory } from "@/lib/types";

const inventory: Inventory = {
  inventory_id: 1, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1,
  storage_location: "Shelf B2", last_updated: "2026-08-01T00:00:00Z", is_low_stock: true,
};

describe("StockCard", () => {
  it("renders stock, in-use, damaged counts, and location", () => {
    render(<StockCard inventory={inventory} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Shelf B2")).toBeInTheDocument();
  });

  it("shows a not-yet-received state when there is no inventory row", () => {
    render(<StockCard inventory={undefined} />);
    expect(screen.getByText("Not yet received")).toBeInTheDocument();
  });
});
```

Create `frontend/components/products/CatalogInfoCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogInfoCard } from "./CatalogInfoCard";
import type { Category } from "@/lib/types";

const category: Category = { category_id: 20, name: "Audio", code: "AUD" };

describe("CatalogInfoCard", () => {
  it("renders category, brand/model, warranty, and track-serials on", () => {
    render(
      <CatalogInfoCard category={category} brand="JBL" modelNumber="JBLFLIP6BLK" warrantyMonths={12} hasTrackedSerials={true} />
    );
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("JBL · JBLFLIP6BLK")).toBeInTheDocument();
    expect(screen.getByText("12 months")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
  });

  it("renders track-serials off when no equipment units exist", () => {
    render(<CatalogInfoCard category={category} brand={null} modelNumber={null} warrantyMonths={0} hasTrackedSerials={false} />);
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- StockCard.test.tsx CatalogInfoCard.test.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/StockCard.tsx`:

```tsx
import { Card, CardKicker } from "@/components/ui/Card";
import type { Inventory } from "@/lib/types";

interface StockCardProps {
  inventory: Inventory | undefined;
}

export function StockCard({ inventory }: StockCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Stock</CardKicker>
      {inventory ? (
        <>
          <div className="flex justify-between text-sm">
            <span>In stock</span>
            <span>{inventory.quantity_in_stock}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>In use (demo)</span>
            <span>{inventory.quantity_in_use}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Damaged</span>
            <span>{inventory.quantity_damaged}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Location</span>
            <span>{inventory.storage_location ?? "—"}</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-text/50">Not yet received</p>
      )}
    </Card>
  );
}
```

Create `frontend/components/products/CatalogInfoCard.tsx`:

```tsx
import { Card, CardKicker } from "@/components/ui/Card";
import type { Category } from "@/lib/types";

interface CatalogInfoCardProps {
  category: Category | undefined;
  brand: string | null;
  modelNumber: string | null;
  warrantyMonths: number;
  hasTrackedSerials: boolean;
}

export function CatalogInfoCard({ category, brand, modelNumber, warrantyMonths, hasTrackedSerials }: CatalogInfoCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Catalog</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Category</span>
        <span>{category?.name ?? "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Brand / model</span>
        <span>
          {brand ?? "—"} · {modelNumber ?? "—"}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Warranty</span>
        <span>{warrantyMonths} months</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Track serials</span>
        <span className={hasTrackedSerials ? "text-accent" : ""}>{hasTrackedSerials ? "On" : "Off"}</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- StockCard.test.tsx CatalogInfoCard.test.tsx`
Expected: PASS, 2 + 2 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/StockCard.tsx frontend/components/products/StockCard.test.tsx frontend/components/products/CatalogInfoCard.tsx frontend/components/products/CatalogInfoCard.test.tsx
git commit -m "Add StockCard and CatalogInfoCard for product detail (mockup 1e)"
```

---

## Task 6: `PricingCard` and `PriceHistoryCard` components

**Files:**
- Create: `frontend/components/products/PricingCard.tsx`
- Create: `frontend/components/products/PriceHistoryCard.tsx`
- Test: `frontend/components/products/PricingCard.test.tsx`
- Test: `frontend/components/products/PriceHistoryCard.test.tsx`

**Interfaces:**
- Consumes: `ProductPricing` (`frontend/lib/types.ts`), `Card`/`CardKicker`/`Tag`/`Button` (existing).
- Produces: `PricingCard({currentPricing}: {currentPricing: ProductPricing | undefined})`,
  `PriceHistoryCard({history, onSetNewPrice}: {history: ProductPricing[], onSetNewPrice: () =>
  void})`. Both consumed by Task 11 (detail page); `PricingCard` is rendered by the page only when
  `role` is admin/manager (the gating lives in the page, not the card itself — the card always
  renders what it's given).

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/products/PricingCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingCard } from "./PricingCard";
import type { ProductPricing } from "@/lib/types";

const currentPricing: ProductPricing = {
  price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00",
  effective_date: "2026-07-01", is_current: true,
};

describe("PricingCard", () => {
  it("renders retail, wholesale, margin, and effective date", () => {
    render(<PricingCard currentPricing={currentPricing} />);
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 112,000")).toBeInTheDocument();
    expect(screen.getByText("22.8%")).toBeInTheDocument();
    expect(screen.getByText("01 Jul 2026")).toBeInTheDocument();
  });

  it("shows a no-price-set state when there is no current pricing", () => {
    render(<PricingCard currentPricing={undefined} />);
    expect(screen.getByText("No price set")).toBeInTheDocument();
  });

  it("shows a placeholder margin when there is no wholesale price", () => {
    render(
      <PricingCard
        currentPricing={{ price_id: 1, product: 1, retail_price: "145000.00", effective_date: "2026-07-01", is_current: true }}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

Create `frontend/components/products/PriceHistoryCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PriceHistoryCard } from "./PriceHistoryCard";
import type { ProductPricing } from "@/lib/types";

const history: ProductPricing[] = [
  { price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true },
  { price_id: 1, product: 1, wholesale_price: "118000.00", retail_price: "155000.00", effective_date: "2026-02-15", is_current: false },
];

describe("PriceHistoryCard", () => {
  it("renders every row with the current one tagged", () => {
    render(<PriceHistoryCard history={history} onSetNewPrice={vi.fn()} />);
    expect(screen.getByText("01 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText("15 Feb 2026")).toBeInTheDocument();
    expect(screen.getByText("current")).toBeInTheDocument();
  });

  it("calls onSetNewPrice when the button is clicked", async () => {
    const onSetNewPrice = vi.fn();
    render(<PriceHistoryCard history={history} onSetNewPrice={onSetNewPrice} />);
    await userEvent.click(screen.getByRole("button", { name: "Set new price" }));
    expect(onSetNewPrice).toHaveBeenCalled();
  });

  it("shows an empty state with no history", () => {
    render(<PriceHistoryCard history={[]} onSetNewPrice={vi.fn()} />);
    expect(screen.getByText("No price history yet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- PricingCard.test.tsx PriceHistoryCard.test.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/PricingCard.tsx`:

```tsx
import { Card, CardKicker } from "@/components/ui/Card";
import type { ProductPricing } from "@/lib/types";

interface PricingCardProps {
  currentPricing: ProductPricing | undefined;
}

export function PricingCard({ currentPricing }: PricingCardProps) {
  if (!currentPricing) {
    return (
      <Card elevation="sm">
        <CardKicker>Current pricing · Admin only</CardKicker>
        <p className="text-sm text-text/50">No price set</p>
      </Card>
    );
  }

  const retail = Number(currentPricing.retail_price);
  const wholesale = currentPricing.wholesale_price != null ? Number(currentPricing.wholesale_price) : null;
  const margin = wholesale != null && retail > 0 ? (((retail - wholesale) / retail) * 100).toFixed(1) : null;
  const effectiveDate = new Date(currentPricing.effective_date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Card elevation="sm">
      <CardKicker>Current pricing · Admin only</CardKicker>
      <div className="flex justify-between text-sm">
        <span>Retail</span>
        <span>RWF {retail.toLocaleString()}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Wholesale</span>
        <span>{wholesale != null ? `RWF ${wholesale.toLocaleString()}` : "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Margin</span>
        <span className="text-accent-300">{margin != null ? `${margin}%` : "—"}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Effective since</span>
        <span>{effectiveDate}</span>
      </div>
    </Card>
  );
}
```

Create `frontend/components/products/PriceHistoryCard.tsx`:

```tsx
"use client";

import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import type { ProductPricing } from "@/lib/types";

interface PriceHistoryCardProps {
  history: ProductPricing[];
  onSetNewPrice: () => void;
}

export function PriceHistoryCard({ history, onSetNewPrice }: PriceHistoryCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Price history</CardKicker>
      {history.length === 0 ? (
        <p className="text-sm text-text/50">No price history yet</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-divider">
              <th className="text-left font-medium py-2 px-2 text-text/70">Effective</th>
              <th className="text-right font-medium py-2 px-2 text-text/70">Wholesale</th>
              <th className="text-right font-medium py-2 px-2 text-text/70">Retail</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((row) => (
              <tr key={row.price_id} className="border-b border-divider">
                <td className="py-2 px-2">
                  {new Date(row.effective_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </td>
                <td className="py-2 px-2 text-right">
                  {row.wholesale_price != null ? Number(row.wholesale_price).toLocaleString() : "—"}
                </td>
                <td className="py-2 px-2 text-right">{Number(row.retail_price).toLocaleString()}</td>
                <td className="py-2 px-2">{row.is_current && <Tag variant="accent">current</Tag>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Button variant="secondary" onClick={onSetNewPrice} className="mt-2">
        Set new price
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- PricingCard.test.tsx PriceHistoryCard.test.tsx`
Expected: PASS, 3 + 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/PricingCard.tsx frontend/components/products/PricingCard.test.tsx frontend/components/products/PriceHistoryCard.tsx frontend/components/products/PriceHistoryCard.test.tsx
git commit -m "Add PricingCard and PriceHistoryCard for product detail (mockup 1e)"
```

---

## Task 7: `InfoSheetCard` (with print) and `SpecificationsCard` components

**Files:**
- Create: `frontend/components/products/InfoSheetCard.tsx`
- Create: `frontend/components/products/SpecificationsCard.tsx`
- Modify: `frontend/app/globals.css`
- Test: `frontend/components/products/InfoSheetCard.test.tsx`
- Test: `frontend/components/products/SpecificationsCard.test.tsx`

**Interfaces:**
- Consumes: `Card`/`CardKicker`/`Button` (existing).
- Produces: `InfoSheetCard({usageInstructions, onEdit}: {usageInstructions: string | null, onEdit?:
  () => void})` — `onEdit` is optional; when omitted, no Edit button renders at all (Task 11 uses
  this to hide it for non-admin roles), `SpecificationsCard({specifications}: {specifications:
  string | null})`. Both consumed by Task 11 (detail page).

- [ ] **Step 1: Write the failing tests**

Create `frontend/components/products/InfoSheetCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InfoSheetCard } from "./InfoSheetCard";

describe("InfoSheetCard", () => {
  it("renders the usage instructions text", () => {
    render(<InfoSheetCard usageInstructions="Hold power 2s to switch on." onEdit={vi.fn()} />);
    expect(screen.getByText("Hold power 2s to switch on.")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no usage instructions", () => {
    render(<InfoSheetCard usageInstructions={null} onEdit={vi.fn()} />);
    expect(screen.getByText("No usage information yet.")).toBeInTheDocument();
  });

  it("calls window.print when Print info sheet is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<InfoSheetCard usageInstructions="Hold power 2s." onEdit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print info sheet" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<InfoSheetCard usageInstructions="Hold power 2s." onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("does not render an Edit button when onEdit is not provided", () => {
    render(<InfoSheetCard usageInstructions="Hold power 2s." />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
```

Create `frontend/components/products/SpecificationsCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecificationsCard } from "./SpecificationsCard";

describe("SpecificationsCard", () => {
  it("renders the specifications text", () => {
    render(<SpecificationsCard specifications="30 W RMS · 12 h battery" />);
    expect(screen.getByText("30 W RMS · 12 h battery")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no specifications", () => {
    render(<SpecificationsCard specifications={null} />);
    expect(screen.getByText("No specifications recorded.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test -- InfoSheetCard.test.tsx SpecificationsCard.test.tsx`
Expected: FAIL — neither component exists yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/InfoSheetCard.tsx`:

```tsx
"use client";

import { Card, CardKicker } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface InfoSheetCardProps {
  usageInstructions: string | null;
  onEdit?: () => void;
}

export function InfoSheetCard({ usageInstructions, onEdit }: InfoSheetCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>How it works — staff & customer info sheet</CardKicker>
      <p className="info-sheet-print text-sm opacity-85 m-0">
        {usageInstructions ?? "No usage information yet."}
      </p>
      <div className="flex gap-2 print:hidden">
        <Button variant="ghost" onClick={() => window.print()}>
          Print info sheet
        </Button>
        {onEdit && (
          <Button variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </Card>
  );
}
```

Create `frontend/components/products/SpecificationsCard.tsx`:

```tsx
import { Card, CardKicker } from "@/components/ui/Card";

interface SpecificationsCardProps {
  specifications: string | null;
}

export function SpecificationsCard({ specifications }: SpecificationsCardProps) {
  return (
    <Card elevation="sm">
      <CardKicker>Specifications</CardKicker>
      <p className="text-sm m-0 whitespace-pre-wrap">{specifications ?? "No specifications recorded."}</p>
    </Card>
  );
}
```

Add to `frontend/app/globals.css` (after the existing `@media print` block from Phase 2 — do not
remove or restructure it):

```css
@media print {
  body:has(.info-sheet-print) .info-sheet-print,
  body:has(.info-sheet-print) .info-sheet-print * {
    visibility: visible;
  }
}
```

(This is additive to the existing `.receipt-print` print rule; the two never coexist on the same
page, so there's no conflict — each page's print stylesheet only matters when that page's own
printable class is present in the DOM.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm run test -- InfoSheetCard.test.tsx SpecificationsCard.test.tsx`
Expected: PASS, 4 + 2 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/InfoSheetCard.tsx frontend/components/products/InfoSheetCard.test.tsx frontend/components/products/SpecificationsCard.tsx frontend/components/products/SpecificationsCard.test.tsx frontend/app/globals.css
git commit -m "Add InfoSheetCard (with print) and SpecificationsCard for product detail"
```

---

## Task 8: `ProductFormDialog` component

**Files:**
- Create: `frontend/components/products/ProductFormDialog.tsx`
- Test: `frontend/components/products/ProductFormDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`Field`/`Button` (existing), `ProductFormValues`/`emptyProductFormValues`/
  `buildProductPayload`/`validateProductForm` (Task 3), `Category`/`Product` (`frontend/lib/types.ts`),
  `apiFetch` (`frontend/lib/api-client.ts`), `useToast` (existing).
- Produces: `ProductFormDialog({open, mode, categories, initialProduct, initialStorageLocation,
  onClose, onSaved}: {open: boolean, mode: "create" | "edit", categories: Category[],
  initialProduct?: Product, initialStorageLocation?: string | null, onClose: () => void, onSaved:
  () => void})`. Consumed by Task 10 (list page, create mode) and Task 11 (detail page, edit mode).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/products/ProductFormDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProductFormDialog } from "./ProductFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Category, Product } from "@/lib/types";

const categories: Category[] = [
  { category_id: 20, name: "Audio", code: "AUD" },
  { category_id: 10, name: "Televisions", code: "TV" },
];

const existingProduct: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: null, usage_instructions: null,
  warranty_months: 12, reorder_level: 4, unit: "pcs", is_active: true, created_at: "2026-01-01T00:00:00Z",
};

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ProductFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not render when closed", () => {
    renderWithToast(
      <ProductFormDialog open={false} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(screen.queryByText("New product")).not.toBeInTheDocument();
  });

  it("shows a category select and no storage location field in create mode", () => {
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.queryByLabelText("Storage location")).not.toBeInTheDocument();
  });

  it("pre-fills fields and disables category in edit mode", () => {
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation="Shelf B2" onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("JBL Flip 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(screen.getByLabelText("Storage location")).toHaveValue("Shelf B2");
  });

  it("omits storage location in edit mode when the product has no inventory row yet", () => {
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Storage location")).not.toBeInTheDocument();
  });

  it("shows a validation error and does not submit when name is blank", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => existingProduct });
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts to /api/proxy/products/ and calls onSaved on successful create", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...existingProduct, product_id: 5 }),
    });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText("Name"), "New Widget");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "New Widget", category: 20, brand: null, model_number: null,
          description: null, specifications: null, usage_instructions: null,
        }),
      })
    );
  });

  it("patches /api/proxy/products/:id/ on successful edit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => existingProduct });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={onSaved}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaved).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith("/api/proxy/products/1/", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows an error toast and keeps the dialog open when submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ detail: { name: ["This field may not be blank."] } }),
    });
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field may not be blank.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("JBL Flip 6")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- ProductFormDialog.test.tsx`
Expected: FAIL — `./ProductFormDialog` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/ProductFormDialog.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyProductFormValues,
  productFormValuesFromProduct,
  buildProductPayload,
  validateProductForm,
  type ProductFormValues,
  type ProductFormErrors,
} from "@/lib/products/productForm";
import type { Category, Product } from "@/lib/types";

interface ProductFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  categories: Category[];
  initialProduct?: Product;
  initialStorageLocation?: string | null;
  inventoryId?: number;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductFormDialog({
  open,
  mode,
  categories,
  initialProduct,
  initialStorageLocation,
  inventoryId,
  onClose,
  onSaved,
}: ProductFormDialogProps) {
  const categoryId = useId();
  const { show } = useToast();
  const [values, setValues] = useState<ProductFormValues>(emptyProductFormValues());
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const showStorageLocation = mode === "edit" && initialStorageLocation != null;

  useEffect(() => {
    if (mode === "edit" && initialProduct) {
      setValues(productFormValuesFromProduct(initialProduct, initialStorageLocation ?? null));
    } else {
      setValues(emptyProductFormValues());
    }
    setErrors({});
  }, [mode, initialProduct, initialStorageLocation, open]);

  function setField<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateProductForm(values, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = buildProductPayload(values, mode);
      if (mode === "create") {
        await apiFetch<Product>("products/", { method: "POST", body: JSON.stringify(payload) });
      } else if (initialProduct) {
        await apiFetch<Product>(`products/${initialProduct.product_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        if (showStorageLocation && inventoryId != null) {
          await apiFetch(`inventory/${inventoryId}/`, {
            method: "PATCH",
            body: JSON.stringify({ storage_location: values.storage_location }),
          });
        }
      }
      onSaved();
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === "create" ? "New product" : "Edit product"}>
      <div className="flex flex-col gap-3 min-w-[420px]">
        <Field label="Name" name="name" value={values.name} onChange={(v) => setField("name", v)} error={errors.name} />
        <div className="flex flex-col gap-1">
          <label htmlFor={categoryId} className="block text-xs text-text/70">
            Category
          </label>
          <select
            id={categoryId}
            value={values.category}
            disabled={mode === "edit"}
            onChange={(e) => setField("category", e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md disabled:opacity-60"
          >
            <option value="">Select a category…</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
        </div>
        <Field label="Brand" name="brand" value={values.brand} onChange={(v) => setField("brand", v)} />
        <Field label="Model number" name="model_number" value={values.model_number} onChange={(v) => setField("model_number", v)} />
        <Field label="Description" name="description" value={values.description} onChange={(v) => setField("description", v)} />
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">Specifications</label>
          <textarea
            value={values.specifications}
            onChange={(e) => setField("specifications", e.target.value)}
            className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="block text-xs text-text/70">How it works / usage</label>
          <textarea
            value={values.usage_instructions}
            onChange={(e) => setField("usage_instructions", e.target.value)}
            className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          />
        </div>
        <Field label="Warranty (months)" name="warranty_months" type="number" value={values.warranty_months} onChange={(v) => setField("warranty_months", v)} />
        <Field label="Reorder level" name="reorder_level" type="number" value={values.reorder_level} onChange={(v) => setField("reorder_level", v)} />
        <Field label="Unit" name="unit" value={values.unit} onChange={(v) => setField("unit", v)} />
        {showStorageLocation && (
          <Field
            label="Storage location"
            name="storage_location"
            value={values.storage_location}
            onChange={(v) => setField("storage_location", v)}
          />
        )}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- ProductFormDialog.test.tsx`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/ProductFormDialog.tsx frontend/components/products/ProductFormDialog.test.tsx
git commit -m "Add ProductFormDialog: shared create/edit form for products + conditional storage location"
```

---

## Task 9: `SetPriceDialog` component

**Files:**
- Create: `frontend/components/products/SetPriceDialog.tsx`
- Test: `frontend/components/products/SetPriceDialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`Field`/`Button` (existing), `apiFetch`/`ApiError`/`extractErrorMessage`
  (`frontend/lib/api-client.ts`), `useToast` (existing), `EmployeeRole` (`frontend/lib/types.ts`).
- Produces: `SetPriceDialog({open, productId, isAdmin, onClose, onSaved}: {open: boolean,
  productId: number, isAdmin: boolean, onClose: () => void, onSaved: () => void})`. Consumed by
  Task 11 (detail page).

- [ ] **Step 1: Write the failing test**

Create `frontend/components/products/SetPriceDialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SetPriceDialog } from "./SetPriceDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("SetPriceDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the wholesale price field for admins", () => {
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Wholesale price")).toBeInTheDocument();
  });

  it("hides the wholesale price field for non-admins", () => {
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Wholesale price")).not.toBeInTheDocument();
  });

  it("posts to /api/proxy/product-pricing/ with the product id and entered values", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ price_id: 3, product: 1, retail_price: "150000.00", effective_date: "2026-08-25", is_current: true }),
    });
    const onSaved = vi.fn();
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Retail price"), "150000");
    await userEvent.type(screen.getByLabelText("Wholesale price"), "112000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaved).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/product-pricing/",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"product":1'),
      })
    );
  });

  it("shows an error toast and keeps the dialog open on failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ detail: { retail_price: ["This field is required."] } }),
    });
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- SetPriceDialog.test.tsx`
Expected: FAIL — `./SetPriceDialog` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/components/products/SetPriceDialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import type { ProductPricing } from "@/lib/types";

interface SetPriceDialogProps {
  open: boolean;
  productId: number;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SetPriceDialog({ open, productId, isAdmin, onClose, onSaved }: SetPriceDialogProps) {
  const { show } = useToast();
  const [retailPrice, setRetailPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        product: productId,
        retail_price: retailPrice,
        effective_date: effectiveDate,
      };
      if (isAdmin) {
        payload.wholesale_price = wholesalePrice;
      }
      await apiFetch<ProductPricing>("product-pricing/", { method: "POST", body: JSON.stringify(payload) });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(extractErrorMessage(err.body));
      } else {
        show("Something went wrong — try again.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Set new price">
      <div className="flex flex-col gap-3 min-w-[320px]">
        <Field label="Retail price" name="retail_price" type="number" value={retailPrice} onChange={setRetailPrice} />
        {isAdmin && (
          <Field label="Wholesale price" name="wholesale_price" type="number" value={wholesalePrice} onChange={setWholesalePrice} />
        )}
        <Field label="Effective date" name="effective_date" type="date" value={effectiveDate} onChange={setEffectiveDate} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2 justify-end mt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- SetPriceDialog.test.tsx`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/products/SetPriceDialog.tsx frontend/components/products/SetPriceDialog.test.tsx
git commit -m "Add SetPriceDialog: creates a new ProductPricing row, admin-gated wholesale field"
```

---

## Task 10: Product list page

**Files:**
- Create: `frontend/app/(protected)/products/page.tsx`
- Test: `frontend/app/(protected)/products/page.test.tsx`

**Interfaces:**
- Consumes: `useCatalogProducts` (Task 1), `ProductTable` (Task 4), `ProductFormDialog` (Task 8),
  `getSession` (`frontend/lib/auth.ts`, existing), `SegmentedToggle`/`Button` (existing).
- Produces: the real `/products` page, replacing the current 404 (no stub existed — `Nav` already
  links here from Phase 1, but no `page.tsx` was ever created for it).

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(protected)/products/page.test.tsx`. This mocks `useCatalogProducts` (already
unit-tested in Task 1), so the test exercises the page's own wiring — search, category filtering,
role-gated create button — not the join logic again.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsPageClient from "./ProductsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useCatalogProductsModule from "@/lib/products/useCatalogProducts";
import type { CatalogProducts } from "@/lib/products/useCatalogProducts";

const products: CatalogProducts["all"] = [
  { product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12, reorder_level: 5, status: "ok" },
  { product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio", retail_price: 145000, wholesale_price: 112000, quantity_in_stock: 2, reorder_level: 4, status: "low_stock" },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ProductsPageClient", () => {
  beforeEach(() => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: products,
      categories: [
        { category_id: 10, name: "Televisions", code: "TV" },
        { category_id: 20, name: "Audio", code: "AUD" },
      ],
      isLoading: false,
      isError: false,
    } as CatalogProducts);
  });

  it("shows both products by default", () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("filters by search text across name, brand, and barcode", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.type(screen.getByLabelText("Search products"), "jbl");
    expect(screen.queryByText("Samsung TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("filters by category tab", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("radio", { name: "Televisions" }));
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6")).not.toBeInTheDocument();
  });

  it("shows the New product button for admin", () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByRole("button", { name: "+ New product" })).toBeInTheDocument();
  });

  it("hides the New product button for sales_staff", () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "+ New product" })).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: [], categories: [], isLoading: true, isError: false,
    } as CatalogProducts);
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText("Loading products…")).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: [], categories: [], isLoading: false, isError: true,
    } as CatalogProducts);
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText(/Couldn't load products/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- app/\(protected\)/products/page.test.tsx`
Expected: FAIL — `./ProductsPageClient` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/app/(protected)/products/ProductsPageClient.tsx` (the `"use client"` piece — kept
separate from `page.tsx` so `page.tsx` itself can stay an async server component that reads the
session, matching the `(protected)/layout.tsx` / `Providers` split already established in Phase 2):

```tsx
"use client";

import { useMemo, useState } from "react";
import { useCatalogProducts } from "@/lib/products/useCatalogProducts";
import { ProductTable } from "@/components/products/ProductTable";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Button } from "@/components/ui/Button";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

interface ProductsPageClientProps {
  role: EmployeeRole;
}

export default function ProductsPageClient({ role }: ProductsPageClientProps) {
  const catalog = useCatalogProducts();
  const isAdmin = ADMIN_ROLES.includes(role);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.all.filter((p) => {
      const matchesCategory = categoryFilter === "all" || String(p.category_id) === categoryFilter;
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [catalog.all, search, categoryFilter]);

  const categoryOptions = [
    { value: "all", label: "All" },
    ...catalog.categories.map((c) => ({ value: String(c.category_id), label: c.name })),
  ];

  if (catalog.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn't load products.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (catalog.isLoading) {
    return <p className="text-sm text-text/50">Loading products…</p>;
  }

  return (
    <div>
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
      <ProductTable products={filtered} showWholesale={isAdmin} />
      <ProductFormDialog
        open={createOpen}
        mode="create"
        categories={catalog.categories}
        onClose={() => setCreateOpen(false)}
        onSaved={() => setCreateOpen(false)}
      />
    </div>
  );
}
```

Create `frontend/app/(protected)/products/page.tsx`:

```tsx
import { getSession } from "@/lib/auth";
import ProductsPageClient from "./ProductsPageClient";

export default async function ProductsPage() {
  const session = await getSession();
  return <ProductsPageClient role={session?.role ?? "sales_staff"} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- app/\(protected\)/products/page.test.tsx`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Run the full suite and a production build**

Run: `cd frontend && npm run test && npm run build`
Expected: all tests pass; build exits 0.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(protected)/products/page.tsx" "frontend/app/(protected)/products/ProductsPageClient.tsx" "frontend/app/(protected)/products/page.test.tsx"
git commit -m "Add product list page (mockup 1d): search, category tabs, role-gated create"
```

---

## Task 11: Product detail page

**Files:**
- Create: `frontend/app/(protected)/products/[id]/page.tsx`
- Test: `frontend/app/(protected)/products/[id]/page.test.tsx`

**Interfaces:**
- Consumes: `useProductDetail` (Task 2), `StockCard`/`CatalogInfoCard` (Task 5),
  `PricingCard`/`PriceHistoryCard` (Task 6), `InfoSheetCard`/`SpecificationsCard` (Task 7),
  `ProductFormDialog` (Task 8), `SetPriceDialog` (Task 9), `getSession` (existing), `Tag`/`Button`
  (existing).
- Produces: the real `/products/[id]` page.

- [ ] **Step 1: Write the failing test**

Create `frontend/app/(protected)/products/[id]/page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductDetailPageClient from "./ProductDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useProductDetailModule from "@/lib/products/useProductDetail";
import type { ProductDetail } from "@/lib/products/useProductDetail";

const baseDetail: ProductDetail = {
  product: {
    product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker",
    brand: "JBL", model_number: "JBLFLIP6BLK", description: null, specifications: "30 W RMS",
    usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
    is_active: true, created_at: "2026-01-01T00:00:00Z",
  },
  category: { category_id: 20, name: "Audio", code: "AUD" },
  currentPricing: { price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true },
  priceHistory: [{ price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true }],
  inventory: { inventory_id: 9, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2", last_updated: "2026-08-01T00:00:00Z", is_low_stock: true },
  hasTrackedSerials: true,
  isLoading: false,
  isError: false,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ProductDetailPageClient", () => {
  beforeEach(() => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue(baseDetail);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the product name, status, and barcode", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
  });

  it("renders the Pricing card for admin", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
  });

  it("hides the Pricing card for sales_staff", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByText("Current pricing · Admin only")).not.toBeInTheDocument();
  });

  it("has a disabled Reorder button", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("button", { name: "Reorder" })).toBeDisabled();
  });

  it("hides Edit for sales_staff", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("opens the edit dialog when Edit is clicked", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByText("Edit product")).toBeInTheDocument();
  });

  it("opens the set-price dialog when Set new price is clicked", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "Set new price" }));
    expect(screen.getByText("Set new price")).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isLoading: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("Loading product…")).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isError: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText(/Couldn't load this product/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test -- "app/(protected)/products/[id]/page.test.tsx"`
Expected: FAIL — `./ProductDetailPageClient` doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/app/(protected)/products/[id]/ProductDetailPageClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useProductDetail } from "@/lib/products/useProductDetail";
import { StockCard } from "@/components/products/StockCard";
import { CatalogInfoCard } from "@/components/products/CatalogInfoCard";
import { PricingCard } from "@/components/products/PricingCard";
import { PriceHistoryCard } from "@/components/products/PriceHistoryCard";
import { InfoSheetCard } from "@/components/products/InfoSheetCard";
import { SpecificationsCard } from "@/components/products/SpecificationsCard";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { SetPriceDialog } from "@/components/products/SetPriceDialog";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import type { EmployeeRole } from "@/lib/types";

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

const STATUS_TAG = {
  ok: { label: "OK", variant: "accent" as const },
  low_stock: { label: "Low stock", variant: "outline" as const },
  out_of_stock: { label: "Out of stock", variant: "neutral" as const },
};

function deriveStatus(quantityInStock: number, reorderLevel: number): keyof typeof STATUS_TAG {
  if (quantityInStock === 0) return "out_of_stock";
  if (quantityInStock <= reorderLevel) return "low_stock";
  return "ok";
}

interface ProductDetailPageClientProps {
  productId: number;
  role: EmployeeRole;
}

export default function ProductDetailPageClient({ productId, role }: ProductDetailPageClientProps) {
  const detail = useProductDetail(productId);
  const isAdmin = ADMIN_ROLES.includes(role);
  const [editOpen, setEditOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);

  if (detail.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn't load this product.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (detail.isLoading || !detail.product) {
    return <p className="text-sm text-text/50">Loading product…</p>;
  }

  const status = deriveStatus(detail.inventory?.quantity_in_stock ?? 0, detail.product.reorder_level);
  const statusTag = STATUS_TAG[status];

  return (
    <div>
      <Link href="/products" className="text-sm">
        ← Products
      </Link>
      <div className="flex items-center gap-3 my-4">
        <h3 className="m-0">{detail.product.name}</h3>
        <Tag variant={statusTag.variant}>{statusTag.label}</Tag>
        <span className="font-mono text-xs text-text/50">{detail.product.barcode}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" disabled>
            Reorder
          </Button>
          {isAdmin && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <StockCard inventory={detail.inventory} />
        {isAdmin && <PricingCard currentPricing={detail.currentPricing} />}
        <CatalogInfoCard
          category={detail.category}
          brand={detail.product.brand}
          modelNumber={detail.product.model_number}
          warrantyMonths={detail.product.warranty_months ?? 0}
          hasTrackedSerials={detail.hasTrackedSerials}
        />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
        <div className="flex flex-col gap-4">
          <InfoSheetCard
            usageInstructions={detail.product.usage_instructions}
            onEdit={isAdmin ? () => setEditOpen(true) : undefined}
          />
          <SpecificationsCard specifications={detail.product.specifications} />
        </div>
        <PriceHistoryCard history={detail.priceHistory} onSetNewPrice={() => setPriceOpen(true)} />
      </div>
      <ProductFormDialog
        open={editOpen}
        mode="edit"
        categories={detail.category ? [detail.category] : []}
        initialProduct={detail.product}
        initialStorageLocation={detail.inventory?.storage_location ?? null}
        inventoryId={detail.inventory?.inventory_id}
        onClose={() => setEditOpen(false)}
        onSaved={() => setEditOpen(false)}
      />
      <SetPriceDialog
        open={priceOpen}
        productId={productId}
        isAdmin={isAdmin}
        onClose={() => setPriceOpen(false)}
        onSaved={() => setPriceOpen(false)}
      />
    </div>
  );
}
```

Note: `ProductFormDialog`'s `categories` prop here is intentionally just `[detail.category]` (not
the full category list) — in edit mode the category select is disabled anyway (Task 8), so it only
needs to display the current one, not offer alternatives.

Create `frontend/app/(protected)/products/[id]/page.tsx`:

```tsx
import { getSession } from "@/lib/auth";
import ProductDetailPageClient from "./ProductDetailPageClient";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  return <ProductDetailPageClient productId={Number(id)} role={session?.role ?? "sales_staff"} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm run test -- "app/(protected)/products/[id]/page.test.tsx"`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Run the full suite and a production build**

Run: `cd frontend && npm run test && npm run build`
Expected: all tests pass; build exits 0 (confirms the `[id]` dynamic route and the async
`params` handling compile correctly).

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(protected)/products/[id]/page.tsx" "frontend/app/(protected)/products/[id]/ProductDetailPageClient.tsx" "frontend/app/(protected)/products/[id]/page.test.tsx"
git commit -m "Add product detail page (mockup 1e): stock/pricing/catalog cards, price history, edit"
```

---

## Task 12: Playwright e2e smoke test

**Files:**
- Create: `frontend/e2e/products.spec.ts`

**Interfaces:**
- Consumes: the real running backend + frontend dev server, plus fixture data (reuses the same
  `PES-E2E-00001` fixture Phase 2's `checkout.spec.ts` documents and depends on — no new fixture
  needed, since this test only reads and edits an existing product, it doesn't require specific
  stock/pricing values the way checkout's total-calculation assertions did).

- [ ] **Step 1: Write the e2e test**

Create `frontend/e2e/products.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

/**
 * Requires the same fixture product Phase 2's checkout.spec.ts documents and depends on:
 * barcode PES-E2E-00001, name "E2E Test Speaker". See frontend/e2e/checkout.spec.ts's doc
 * comment for the exact creation command if it doesn't already exist in the dev database.
 */

test.describe("Products", () => {
  test("admin can browse, open, and edit a product", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("admin1");
    await page.getByLabel("Password").fill("adminpass");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/dashboard");

    await page.goto("/products");
    await page.getByLabel("Search products").fill("E2E Test Speaker");
    await expect(page.getByRole("table").getByText("E2E Test Speaker")).toBeVisible();

    await page.getByRole("link", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name: "E2E Test Speaker" })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).first().click();
    const descriptionField = page.getByLabel("Description");
    await descriptionField.fill("Updated via e2e test");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Edit product")).not.toBeVisible();
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `cd frontend && npm run test:e2e`
Expected: PASS — `login.spec.ts`, `checkout.spec.ts` (both existing, unaffected), and the new
`products.spec.ts` all green against the live backend.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/products.spec.ts
git commit -m "Add products e2e smoke test: browse, open, edit"
```

---

## Final verification

- [ ] Run the full backend suite: `docker compose exec web pytest` — no change expected (this
  phase adds no backend code), confirms nothing was accidentally touched.
- [ ] Run the full frontend suite: `cd frontend && npm run test` — all tests pass.
- [ ] Run the production build: `cd frontend && npm run build` — exits 0.
- [ ] Run the full e2e suite: `cd frontend && npm run test:e2e` — all three spec files green.
- [ ] Manually verify in a browser: the Wholesale column/Pricing card appear for an admin login and
  are absent for a sales_staff login; creating a product with a category, then trying to edit it,
  shows the category select disabled; a brand-new product (never received) shows "Not yet received"
  in its Stock card and has no Storage location field when edited.
