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
                { product_id: 1, category: 10, barcode: "PES-TV-00082", name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", reorder_level: 5, is_active: true },
                { product_id: 2, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", reorder_level: 4, is_active: true },
                { product_id: 3, category: 20, barcode: "PES-AUD-00099", name: "No Stock Mic", brand: "Boya", model_number: "BY-M1", reorder_level: 5, is_active: false },
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
      reorder_level: 5, status: "ok", is_active: true,
    });
  });

  it("threads is_active through from the product", async () => {
    const { result } = renderHook(() => useCatalogProducts(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const inactive = result.current.all.find((p) => p.product_id === 3);
    expect(inactive?.is_active).toBe(false);
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
