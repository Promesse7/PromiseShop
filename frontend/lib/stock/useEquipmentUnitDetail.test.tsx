import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useEquipmentUnitDetail } from "./useEquipmentUnitDetail";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useEquipmentUnitDetail", () => {
  it("fetches one unit including its embedded status_history, as returned by the API", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toContain("/equipment-units/3/");
      return Promise.resolve({
        ok: true,
        json: async () => ({
          unit_id: 3,
          product: 2,
          serial_number: "JBL6-KX2093",
          status: "damaged",
          assigned_to: null,
          storage_location: "Repair shelf",
          condition_notes: "USB-C port loose",
          status_changed_at: "2026-08-21T16:40:00Z",
          status_history: [
            { history_id: 2, previous_status: "in_stock", new_status: "damaged", changed_by: 3, change_date: "2026-08-21T16:40:00Z", notes: "Customer return" },
            { history_id: 1, previous_status: "", new_status: "in_stock", changed_by: 1, change_date: "2026-07-28T09:05:00Z", notes: "Received" },
          ],
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useEquipmentUnitDetail(3), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.unit?.serial_number).toBe("JBL6-KX2093");
    expect(result.current.unit?.status_history.map((h) => h.history_id)).toEqual([2, 1]);
  });
});
