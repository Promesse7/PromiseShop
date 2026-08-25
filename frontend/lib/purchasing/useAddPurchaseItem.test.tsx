import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useAddPurchaseItem } from "./useAddPurchaseItem";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useAddPurchaseItem", () => {
  it("POSTs to purchases/<id>/items/ and invalidates purchase, product, and pricing caches", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/purchases/7/items/");
      return Promise.resolve({
        ok: true,
        json: async () => ({
          purchase_item_id: 1, purchase: 7, product: 9, quantity: 8,
          unit_cost_paid: "108000", unit_cost_invoiced: "112000",
          price_discrepancy_note: "bulk", subtotal_paid: "864000", subtotal_invoiced: "896000",
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useAddPurchaseItem(), { wrapper });

    result.current.mutate({
      purchaseId: 7,
      payload: { product: 9, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "112000", price_discrepancy_note: "bulk" },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["purchases", 7]);
    expect(keys).toContainEqual(["purchases"]);
    expect(keys).toContainEqual(["products"]);
    expect(keys).toContainEqual(["product-pricing"]);
  });
});
