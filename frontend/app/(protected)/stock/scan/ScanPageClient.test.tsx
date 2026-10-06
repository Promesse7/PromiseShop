import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ScanPageClient from "./ScanPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));

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
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          json: async () =>
            url.includes("operations/assets/")
              ? paginated(url.includes("serial=SHOP-PRINTER-1") ? [{ asset_id: 7, name: "Office printer" }] : [])
              : paginated([
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

  it("opens the shop asset when the scanned serial belongs to one", async () => {
    pushMock.mockClear();
    renderWithProviders(<ScanPageClient />);
    await userEvent.type(screen.getByLabelText("Scan serial or search unit…"), "SHOP-PRINTER-1");
    await vi.waitFor(() => expect(pushMock).toHaveBeenCalledWith("/shop-use/assets/7"));
  });

  it("is a page with a back link to Stock and a focused scan box", () => {
    renderWithProviders(<ScanPageClient />);
    expect(screen.getByRole("heading", { level: 1, name: "Quick status change" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/stock");
    expect(screen.getByLabelText("Scan serial or search unit…")).toHaveFocus();
  });
});
