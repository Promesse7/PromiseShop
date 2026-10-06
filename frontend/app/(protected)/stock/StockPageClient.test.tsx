import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StockPageClient from "./StockPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useStockOverviewModule from "@/lib/stock/useStockOverview";
import * as useEquipmentUnitsModule from "@/lib/stock/useEquipmentUnits";
import type { StockOverview } from "@/lib/stock/useStockOverview";
import { setMatchMedia } from "@/lib/test/matchMedia";

let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

const rows: StockOverview["rows"] = [
  { product_id: 1, inventory_id: 11, name: "Samsung 43\" Crystal UHD TV", quantity_in_stock: 12, quantity_in_use: 1, quantity_damaged: 0, storage_location: "Shelf A1", flag: "ok", unit_count: 0 },
  { product_id: 2, inventory_id: 12, name: "JBL Flip 6 Speaker", quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2", flag: "low_stock", unit_count: 4 },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("StockPageClient", () => {
  beforeEach(() => {
    // Employees (for resolving "Assigned to") load through fetch for admin viewers.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ count: 0, next: null, previous: null, results: [] }) }))
    );
    vi.spyOn(useStockOverviewModule, "useStockOverview").mockReturnValue({
      rows,
      isLoading: false,
      isError: false,
    });
    vi.spyOn(useEquipmentUnitsModule, "useEquipmentUnits").mockReturnValue({
      units: [
        { unit_id: 1, product: 2, serial_number: "JBL6-KX2201", status: "in_stock", assigned_to: null, storage_location: "Shelf B2", condition_notes: null, status_changed_at: "2026-08-18T00:00:00Z" },
      ],
      isLoading: false,
      isError: false,
    });
  });

  it("shows both rows by default", () => {
    mockSearchParams = new URLSearchParams();
    renderWithProviders(<StockPageClient />);
    expect(screen.getByText("Samsung 43\" Crystal UHD TV")).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("filters rows by a search box", async () => {
    mockSearchParams = new URLSearchParams();
    renderWithProviders(<StockPageClient />);
    await userEvent.type(screen.getByLabelText("Search stock"), "jbl");
    expect(screen.queryByText("Samsung 43\" Crystal UHD TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("preselects the product named in the URL so the catalog can deep-link to its units", () => {
    mockSearchParams = new URLSearchParams("product=2");
    renderWithProviders(<StockPageClient />);
    expect(screen.getByText(/Serialized units — JBL Flip 6 Speaker/)).toBeInTheDocument();
    expect(screen.getByText("JBL6-KX2201")).toBeInTheDocument();
  });

  it("lets an admin open the Adjust stock dialog from a card, but not sales staff", async () => {
    mockSearchParams = new URLSearchParams();
    const { unmount } = renderWithProviders(<StockPageClient role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Adjust" })[1]);
    expect(screen.getByRole("heading", { name: "Adjust stock — JBL Flip 6 Speaker" })).toBeInTheDocument();
    unmount();

    renderWithProviders(<StockPageClient role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Adjust" })).not.toBeInTheDocument();
  });

  it("filters to low/out-of-stock rows", async () => {
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("radio", { name: "Low / out" }));
    expect(screen.queryByText("Samsung 43\" Crystal UHD TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("filters to serialized-only rows", async () => {
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("radio", { name: "Serialized only" }));
    expect(screen.queryByText("Samsung 43\" Crystal UHD TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("shows a prompt before any product is selected", () => {
    renderWithProviders(<StockPageClient />);
    expect(screen.getByText("Select a product above to view its serialized units")).toBeInTheDocument();
  });

  it("selecting a product's unit count shows its serialized units and a Register unit button", async () => {
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    expect(screen.getByText(/Serialized units — JBL Flip 6 Speaker/)).toBeInTheDocument();
    expect(screen.getByText("JBL6-KX2201")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Register unit" })).toBeInTheDocument();
  });

  it("links to the tablet quick status-change screen", () => {
    renderWithProviders(<StockPageClient />);
    expect(screen.getByRole("link", { name: /Quick status change/ })).toHaveAttribute("href", "/stock/scan");
  });

  it("selecting units shows a bulk print bar and prints their labels", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    await userEvent.click(screen.getByLabelText("Select JBL6-KX2201"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print 1 labels" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("prints a single unit's label from its row", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("unmounts the label sheet once the print dialog closes", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<StockPageClient />);
    await userEvent.click(screen.getByRole("button", { name: "4 units" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(screen.getByRole("img", { name: "Barcode for JBL6-KX2201" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });

    expect(screen.queryByRole("img", { name: "Barcode for JBL6-KX2201" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("puts the stock filter in a Filters sheet on phone", async () => {
    mockSearchParams = new URLSearchParams();
    setMatchMedia({ desktop: false });
    renderWithProviders(<StockPageClient />);
    expect(screen.queryByRole("radio", { name: "Low / out" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("radio", { name: "Low / out" }));
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    expect(screen.queryByText("Samsung 43\" Crystal UHD TV")).not.toBeInTheDocument();
  });

  it("links to the movements log", () => {
    mockSearchParams = new URLSearchParams();
    renderWithProviders(<StockPageClient />);
    expect(screen.getByRole("link", { name: /Movements/ })).toHaveAttribute("href", "/stock/movements");
  });
});
