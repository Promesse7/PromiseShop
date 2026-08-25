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
