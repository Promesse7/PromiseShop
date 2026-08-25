import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QuickStatusChangeCard } from "./QuickStatusChangeCard";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { EquipmentUnit } from "@/lib/types";

const unit: EquipmentUnit = {
  unit_id: 3,
  product: 2,
  serial_number: "JBL6-KX2093",
  status: "damaged",
  assigned_to: null,
  storage_location: "Repair shelf",
  condition_notes: null,
  status_changed_at: "2026-08-21T16:40:00Z",
};

function renderCard(onSaved = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <QuickStatusChangeCard unit={unit} onSaved={onSaved} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onSaved };
}

describe("QuickStatusChangeCard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ unit_id: 3, status: "in_stock" }) }))
    );
  });

  it("shows every status except the unit's current one", () => {
    renderCard();
    expect(screen.getByRole("button", { name: "In stock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "In use" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Under repair" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sold" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Damaged" })).not.toBeInTheDocument();
  });

  it("selecting a status, entering a reason, and saving calls the change-status API", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toContain("/equipment-units/3/change-status/");
      expect(JSON.parse(options.body as string)).toEqual({
        new_status: "under_repair",
        reason: "Sent to service centre",
      });
      return Promise.resolve({ ok: true, json: async () => ({ unit_id: 3, status: "under_repair" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onSaved } = renderCard();
    await userEvent.click(screen.getByRole("button", { name: "Under repair" }));
    await userEvent.type(screen.getByLabelText("Reason (goes to history)"), "Sent to service centre");
    await userEvent.click(screen.getByRole("button", { name: "Save — writes audit row" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
