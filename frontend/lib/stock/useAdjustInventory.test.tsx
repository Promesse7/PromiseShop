import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useAdjustInventory } from "./useAdjustInventory";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useAdjustInventory", () => {
  it("POSTs to inventory/<id>/adjust/ and refreshes inventory and the adjustment history", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/inventory/9/adjust/");
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({ adjustment_id: 1, inventory: 9, adjustment_type: "count_correction", quantity: 7, reason: "Stock take", before_in_stock: 10, after_in_stock: 7, before_in_use: 0, after_in_use: 0, before_damaged: 0, after_damaged: 0, changed_by: 1, created_at: "2026-09-05T10:00:00Z" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAdjustInventory(), { wrapper });
    result.current.mutate({ inventoryId: 9, adjustment_type: "count_correction", quantity: 7, reason: "Stock take" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["inventory"]);
    expect(keys).toContainEqual(["stock-movements"]);
  });
});
