import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { usePurchaseDetail } from "./usePurchaseDetail";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePurchaseDetail", () => {
  it("fetches a single purchase with its items embedded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/purchases/1/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              purchase_id: 1, supplier: 1, employee: 2, invoice_number: "KE-8841",
              purchase_date: "2026-08-23", total_paid: "108000", total_invoiced: "112000",
              payment_status: "paid", status: "draft",
              items: [
                { purchase_item_id: 1, purchase: 1, product: 5, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "112000", price_discrepancy_note: "bulk", subtotal_paid: "864000", subtotal_invoiced: "896000" },
              ],
            }),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const { result } = renderHook(() => usePurchaseDetail(1), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.purchase?.purchase_id).toBe(1);
    expect(result.current.purchase?.items).toHaveLength(1);
    expect(result.current.purchase?.items[0].product).toBe(5);
    expect(result.current.isError).toBe(false);
  });
});
