import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useEmployees } from "./useEmployees";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useEmployees", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/employees/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { employee_id: 1, full_name: "Alice Uwase", role: "admin", phone: "111", email: "a@b.com", username: "a.uwase", hire_date: "2023-01-15", status: "active", created_at: "2023-01-15T00:00:00Z" },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("fetches and exposes the employee list when enabled", async () => {
    const { result } = renderHook(() => useEmployees(true), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all).toHaveLength(1);
    expect(result.current.all[0].full_name).toBe("Alice Uwase");
  });

  it("does not fetch when disabled", async () => {
    const { result } = renderHook(() => useEmployees(false), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.all).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
