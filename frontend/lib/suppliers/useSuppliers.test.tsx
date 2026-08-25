import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSuppliers } from "./useSuppliers";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useSuppliers", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/suppliers/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: "J. Habimana", phone: "+250781234567", email: "sales@kigalielec.rw", address: "KG 11 Ave, Kigali" },
                { supplier_id: 2, name: "Dubai Traders FZE", contact_person: null, phone: null, email: null, address: null },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("fetches and exposes the supplier list", async () => {
    const { result } = renderHook(() => useSuppliers(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all).toHaveLength(2);
    expect(result.current.all[0].name).toBe("Kigali Electronics Ltd");
    expect(result.current.isError).toBe(false);
  });
});
