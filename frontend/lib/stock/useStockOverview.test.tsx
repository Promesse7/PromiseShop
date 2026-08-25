import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useStockOverview } from "./useStockOverview";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useStockOverview", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { product_id: 1, name: "Samsung 43\" Crystal UHD TV", reorder_level: 5 },
                { product_id: 2, name: "JBL Flip 6 Speaker", reorder_level: 4 },
                { product_id: 3, name: "HP 65W Laptop Charger", reorder_level: 5 },
                { product_id: 4, name: "Never Received Product", reorder_level: 5 },
              ]),
          });
        }
        if (url.includes("/inventory/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { inventory_id: 1, product: 1, quantity_in_stock: 12, quantity_in_use: 1, quantity_damaged: 0, storage_location: "Shelf A1" },
                { inventory_id: 2, product: 2, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2" },
                { inventory_id: 3, product: 3, quantity_in_stock: 0, quantity_in_use: 0, quantity_damaged: 0, storage_location: "Drawer C4" },
              ]),
          });
        }
        if (url.includes("/equipment-units/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { unit_id: 1, product: 2, serial_number: "JBL6-KX2201", status: "in_stock" },
                { unit_id: 2, product: 2, serial_number: "JBL6-KX2202", status: "in_stock" },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("joins inventory with product name and equipment-unit counts", async () => {
    const { result } = renderHook(() => useStockOverview(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toHaveLength(3);
    const jbl = result.current.rows.find((r) => r.product_id === 2);
    expect(jbl).toEqual({
      product_id: 2,
      name: "JBL Flip 6 Speaker",
      quantity_in_stock: 2,
      quantity_in_use: 1,
      quantity_damaged: 1,
      storage_location: "Shelf B2",
      flag: "low_stock",
      unit_count: 2,
    });
  });

  it("excludes products with no Inventory row", async () => {
    const { result } = renderHook(() => useStockOverview(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows.some((r) => r.product_id === 4)).toBe(false);
  });

  it("flags zero stock as out_of_stock even with a higher reorder level", async () => {
    const { result } = renderHook(() => useStockOverview(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const charger = result.current.rows.find((r) => r.product_id === 3);
    expect(charger?.flag).toBe("out_of_stock");
  });

  it("flags healthy stock above reorder level as ok, with zero unit_count", async () => {
    const { result } = renderHook(() => useStockOverview(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const tv = result.current.rows.find((r) => r.product_id === 1);
    expect(tv?.flag).toBe("ok");
    expect(tv?.unit_count).toBe(0);
  });
});
