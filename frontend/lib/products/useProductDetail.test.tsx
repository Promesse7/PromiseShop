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
