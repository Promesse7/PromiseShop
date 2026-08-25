import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useChangeEquipmentStatus } from "./useChangeEquipmentStatus";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useChangeEquipmentStatus", () => {
  it("POSTs to change-status with new_status and reason, then invalidates equipment-units queries", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toContain("/equipment-units/5/change-status/");
      expect(JSON.parse(options.body as string)).toEqual({
        new_status: "under_repair",
        reason: "Sent for repair",
      });
      return Promise.resolve({
        ok: true,
        json: async () => ({ unit_id: 5, status: "under_repair" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useChangeEquipmentStatus(), { wrapper });

    result.current.mutate({ unitId: 5, new_status: "under_repair", reason: "Sent for repair" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["equipment-units"] });
  });
});
