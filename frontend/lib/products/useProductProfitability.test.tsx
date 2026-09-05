import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useProductProfitability } from "./useProductProfitability";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const row = {
  product_id: 7, product_name: "JBL Flip 6",
  units_bought: 10, avg_cost_paid: "100000.00", avg_cost_invoiced: "110000.00",
  units_sold: 4, revenue: "560000.00", projected_revenue: "580000.00",
  cogs_paid: "400000.00", cogs_invoiced: "440000.00",
  gross_margin: "160000.00", projected_margin: "140000.00",
  margin_pct: "28.57", projected_margin_pct: "24.14",
};

describe("useProductProfitability", () => {
  it("fetches the all-time profitability row for one product", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/dashboard/profitability/?period=all&product=7");
      return Promise.resolve({ ok: true, json: async () => ({ period: "all", products: [row], totals: row }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProductProfitability(7), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.row?.avg_cost_paid).toBe("100000.00");
    expect(result.current.isError).toBe(false);
  });

  it("does not fetch when disabled (non-admin viewers)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useProductProfitability(7, false), { wrapper });
    expect(result.current.row).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({ detail: "boom" }) })));
    const { result } = renderHook(() => useProductProfitability(7), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
