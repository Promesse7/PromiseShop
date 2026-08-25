import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useEquipmentUnits } from "./useEquipmentUnits";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useEquipmentUnits", () => {
  it("fetches units for the given product", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain("/equipment-units/?product=2");
      return Promise.resolve({
        ok: true,
        json: async () =>
          paginated([{ unit_id: 1, product: 2, serial_number: "JBL6-KX2201", status: "in_stock" }]),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEquipmentUnits(2), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.units).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when productId is null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEquipmentUnits(null), { wrapper });

    expect(result.current.units).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
