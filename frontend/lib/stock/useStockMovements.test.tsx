import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useStockMovements } from "./useStockMovements";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useStockMovements", () => {
  it("fetches the filtered ledger page", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/stock/movements/?product=9&type=sale&page_size=8");
      return Promise.resolve({
        ok: true,
        json: async () => ({
          count: 12, next: "x", previous: null,
          results: [
            { movement_id: 2, product: 9, product_name: "Speaker", movement_type: "sale", bucket: "in_stock", quantity_delta: -1, balance_after: 4, source_type: "sale_item", source_id: 5, reason: "Sale #3", created_by: 1, created_by_name: "Staff One", created_at: "2026-10-06T10:00:00Z" },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useStockMovements({ product: 9, type: "sale" }, 8), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.count).toBe(12);
    expect(result.current.movements.map((m) => m.balance_after)).toEqual([4]);
  });

  it("does not fetch when disabled", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useStockMovements({}, 8, false), { wrapper });
    expect(result.current.movements).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
