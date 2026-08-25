import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UnitDetailPageClient from "./UnitDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useEquipmentUnitDetailModule from "@/lib/stock/useEquipmentUnitDetail";
import type { EquipmentUnitDetailResult } from "@/lib/stock/useEquipmentUnitDetail";

const unit: EquipmentUnitDetailResult["unit"] = {
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
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("UnitDetailPageClient", () => {
  beforeEach(() => {
    vi.spyOn(useEquipmentUnitDetailModule, "useEquipmentUnitDetail").mockReturnValue({
      unit,
      isLoading: false,
      isError: false,
    });
  });

  it("shows the unit's serial number, status, and history", () => {
    renderWithProviders(<UnitDetailPageClient unitId={3} />);
    expect(screen.getByRole("heading", { name: /JBL6-KX2093/ })).toBeInTheDocument();
    expect(screen.getAllByText("damaged").length).toBeGreaterThan(0);
    expect(screen.getByText(/Customer return/)).toBeInTheDocument();
  });

  it("opens the change-status dialog and closes it on cancel", async () => {
    renderWithProviders(<UnitDetailPageClient unitId={3} />);
    await userEvent.click(screen.getByRole("button", { name: "Change status" }));
    expect(screen.getByText("New status")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("New status")).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useEquipmentUnitDetailModule, "useEquipmentUnitDetail").mockReturnValue({
      unit: undefined, isLoading: true, isError: false,
    });
    renderWithProviders(<UnitDetailPageClient unitId={3} />);
    expect(screen.getByText("Loading unit…")).toBeInTheDocument();
  });
});
