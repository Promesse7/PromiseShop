import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useInventoryAdjustments } from "./useInventoryAdjustments";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useInventoryAdjustments", () => {
  it("fetches the adjustment history for an inventory row", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/inventory/9/adjustments/");
      return Promise.resolve({
        ok: true,
        json: async () => [
          { adjustment_id: 2, inventory: 9, adjustment_type: "to_damaged", quantity: 1, reason: "Dropped", before_in_stock: 9, after_in_stock: 8, before_in_use: 0, after_in_use: 0, before_damaged: 0, after_damaged: 1, changed_by: 1, created_at: "2026-09-05T11:00:00Z" },
          { adjustment_id: 1, inventory: 9, adjustment_type: "count_correction", quantity: 9, reason: "Stock take", before_in_stock: 10, after_in_stock: 9, before_in_use: 0, after_in_use: 0, before_damaged: 0, after_damaged: 0, changed_by: 1, created_at: "2026-09-05T10:00:00Z" },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInventoryAdjustments(9), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.adjustments.map((a) => a.reason)).toEqual(["Dropped", "Stock take"]);
  });

  it("does not fetch without an inventory id", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useInventoryAdjustments(undefined), { wrapper });
    expect(result.current.adjustments).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
