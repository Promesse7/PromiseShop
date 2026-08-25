import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useCustomers } from "./useCustomers";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useCustomers", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/customers/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { customer_id: 1, name: "Grace Mukamana", phone: "+250781234567", email: "grace.m@gmail.com", address: null },
                { customer_id: 2, name: null, phone: null, email: null, address: null },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("fetches and exposes the customer list", async () => {
    const { result } = renderHook(() => useCustomers(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all).toHaveLength(2);
    expect(result.current.all[0].name).toBe("Grace Mukamana");
    expect(result.current.isError).toBe(false);
  });
});
