import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePurchases } from "./usePurchases";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("usePurchases", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/purchases/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                {
                  purchase_id: 1, supplier: 1, employee: 2, invoice_number: "KE-8841",
                  purchase_date: "2026-08-23", total_paid: "3002000", total_invoiced: "3034000",
                  payment_status: "paid", status: "draft", items: [],
                },
              ]),
          });
        }
        if (url.includes("/suppliers/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([{ supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: null, phone: null, email: null, address: null }]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("joins purchases with their supplier name", async () => {
    const { result } = renderHook(() => usePurchases(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.rows).toEqual([
      {
        purchase_id: 1,
        supplier_name: "Kigali Electronics Ltd",
        invoice_number: "KE-8841",
        purchase_date: "2026-08-23",
        payment_status: "paid",
        status: "draft",
        total_paid: "3002000",
        total_invoiced: "3034000",
      },
    ]);
  });
});
