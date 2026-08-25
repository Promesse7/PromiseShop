import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useRemovePurchaseItem } from "./useRemovePurchaseItem";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useRemovePurchaseItem", () => {
  it("DELETEs the item and invalidates the purchase caches", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toBe("/api/proxy/purchases/7/items/3/");
      expect(options.method).toBe("DELETE");
      return Promise.resolve({ ok: true, json: async () => { throw new Error("no body"); } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useRemovePurchaseItem(), { wrapper });

    result.current.mutate({ purchaseId: 7, itemId: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["purchases", 7]);
    expect(keys).toContainEqual(["purchases"]);
  });
});
