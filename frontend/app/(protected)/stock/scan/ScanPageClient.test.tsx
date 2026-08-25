import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ScanPageClient from "./ScanPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("ScanPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () =>
            paginated([
              { unit_id: 1, product: 2, serial_number: "JBL6-KX2201", status: "in_stock", assigned_to: null, storage_location: "Shelf B2", condition_notes: null, status_changed_at: "2026-08-18T00:00:00Z" },
              { unit_id: 3, product: 2, serial_number: "JBL6-KX2093", status: "damaged", assigned_to: null, storage_location: "Repair shelf", condition_notes: null, status_changed_at: "2026-08-21T00:00:00Z" },
            ]),
        })
      )
    );
  });

  it("shows no card before a serial is entered", async () => {
    renderWithProviders(<ScanPageClient />);
    expect(screen.queryByText("Move to")).not.toBeInTheDocument();
  });

  it("finds a unit by a substring of its serial number and shows the quick status change card", async () => {
    renderWithProviders(<ScanPageClient />);
    await userEvent.type(screen.getByLabelText("Scan serial or search unit…"), "KX2093");
    expect(await screen.findByText("JBL6-KX2093")).toBeInTheDocument();
    expect(screen.getByText("Move to")).toBeInTheDocument();
  });
});
