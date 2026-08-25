import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PosCheckout } from "./PosCheckout";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePosCatalogModule from "@/lib/pos/usePosCatalog";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";

const jbl = {
  product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
  model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("PosCheckout", () => {
  beforeEach(() => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [jbl],
      byBarcode: new Map([[jbl.barcode, jbl]]),
      isLoading: false,
      isError: false,
    } as PosCatalog);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("adds a scanned product to the cart and updates the total", async () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    expect((await screen.findAllByText("JBL Flip 6 Speaker")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("RWF 145,000").length).toBeGreaterThan(0);
  });

  it("disables Complete sale with an empty cart", () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  it("posts to /api/proxy/sales/ and shows the receipt on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(await screen.findByText("#S-841")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/sales/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ items: [{ product: 1, quantity: 1 }], payment_method: "cash" }),
      })
    );
  });

  it("shows an error toast and keeps the cart when the sale submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Insufficient stock for product 1: requested 1, available 0." }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(
      await screen.findByText("Insufficient stock for product 1: requested 1, available 0.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("JBL Flip 6 Speaker").length).toBeGreaterThan(0);
  });

  it("calls window.print when Print receipt is clicked on the receipt view", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("returns to an empty cart when New sale is clicked from the receipt", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed", items: [],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "New sale" }));

    expect(screen.getByLabelText("Scan barcode or search product")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6 Speaker")).not.toBeInTheDocument();
  });
});
