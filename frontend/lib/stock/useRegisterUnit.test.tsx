import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useRegisterUnit } from "./useRegisterUnit";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useRegisterUnit", () => {
  it("creates the unit, then seeds its status via change-status, in order (Decision 1)", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      calls.push({ url, body: options.body ? JSON.parse(options.body as string) : null });
      if (url.includes("/equipment-units/") && !url.includes("change-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ unit_id: 9, product: 2, serial_number: "JBL6-NEW01", status: "" }),
        });
      }
      if (url.includes("/equipment-units/9/change-status/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ unit_id: 9, product: 2, serial_number: "JBL6-NEW01", status: "in_stock" }),
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useRegisterUnit(), { wrapper });

    result.current.mutate({
      product: 2,
      serial_number: "JBL6-NEW01",
      storage_location: "Shelf B2",
      condition_notes: null,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/equipment-units/");
    expect(calls[0].url).not.toContain("change-status");
    expect(calls[0].body).toEqual({
      product: 2,
      serial_number: "JBL6-NEW01",
      storage_location: "Shelf B2",
      condition_notes: null,
    });
    expect(calls[1].url).toContain("/equipment-units/9/change-status/");
    expect(calls[1].body).toEqual({ new_status: "in_stock", reason: "Unit registered" });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment-units"] });
  });
});
