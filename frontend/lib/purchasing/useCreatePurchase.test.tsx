import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useCreatePurchase } from "./useCreatePurchase";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useCreatePurchase", () => {
  it("POSTs the header payload and invalidates the purchases list", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          purchase_id: 5, supplier: 1, employee: 2, invoice_number: "KE-8841",
          purchase_date: "2026-08-23", total_paid: "0", total_invoiced: "0",
          payment_status: "paid", status: "draft", items: [],
        }),
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useCreatePurchase(), { wrapper });

    result.current.mutate({
      supplier: 1, invoice_number: "KE-8841", purchase_date: "2026-08-23", payment_status: "paid",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/proxy/purchases/",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.current.data?.purchase_id).toBe(5);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["purchases"] });
  });
});
