import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useReceivePurchase } from "./useReceivePurchase";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useReceivePurchase", () => {
  it("POSTs to purchases/<id>/receive/ and invalidates purchase + inventory caches", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toBe("/api/proxy/purchases/7/receive/");
      expect(options.method).toBe("POST");
      return Promise.resolve({
        ok: true,
        json: async () => ({
          purchase_id: 7, supplier: 1, employee: 2, invoice_number: "KE-8841",
          purchase_date: "2026-08-23", total_paid: "108000", total_invoiced: "112000",
          payment_status: "paid", status: "received", items: [],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useReceivePurchase(), { wrapper });

    result.current.mutate(7);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe("received");

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["purchases", 7]);
    expect(keys).toContainEqual(["purchases"]);
    expect(keys).toContainEqual(["inventory"]);
  });
});
