import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useExpenses } from "./useExpenses";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useExpenses", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/expenses/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { expense_id: 1, category: "rent", amount: "300000.00", expense_date: "2026-08-01", description: "August rent", recorded_by: 2 },
                { expense_id: 2, category: "utilities", amount: "42000.00", expense_date: "2026-08-15", description: null, recorded_by: 2 },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("fetches and exposes the expense list when enabled", async () => {
    const { result } = renderHook(() => useExpenses(true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all).toHaveLength(2);
    expect(result.current.all[0].category).toBe("rent");
    expect(result.current.isError).toBe(false);
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useExpenses(false), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.all).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
