import { render, screen } from "@testing-library/react";
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
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
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

  it("shows a loading message and hides the scan field while the catalog is loading", () => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [],
      byBarcode: new Map(),
      isLoading: true,
      isError: false,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByText("Loading catalog…")).toBeInTheDocument();
    expect(screen.queryByLabelText("Scan barcode or search product")).not.toBeInTheDocument();
  });

  it("shows an error message and hides the scan field when the catalog fails to load", () => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [],
      byBarcode: new Map(),
      isLoading: false,
      isError: true,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByText(/Couldn't load the product catalog/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Scan barcode or search product")).not.toBeInTheDocument();
  });

  it("posts to /api/proxy/sales/ and shows the receipt on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
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

  it("lets the cashier change a line price: totals, discount line, and payload follow", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 842, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "120000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 842, product: 1, quantity: 1, unit_price: "120000.00", list_price: "145000.00", subtotal: "120000.00", tax_category: "B", tax_amount: "18305.08" },
        ],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-AUD-00147{Enter}");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("120000");

    expect(screen.getByText("Discount vs catalog")).toBeInTheDocument();
    expect(screen.getByText("− RWF 25,000")).toBeInTheDocument();
    expect(screen.getAllByText("RWF 120,000").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("#S-842")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/sales/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [{ product: 1, quantity: 1, unit_price: "120000.00" }],
          payment_method: "cash",
        }),
      })
    );
  });

  it("shows a markup line when a price is raised above the catalog price", async () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-AUD-00147{Enter}");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("150000");

    expect(screen.getByText("Markup vs catalog")).toBeInTheDocument();
    expect(screen.getByText("+ RWF 5,000")).toBeInTheDocument();
  });

  it("holds Complete sale until a product with no catalog price is given one", async () => {
    const unpriced = { ...jbl, product_id: 2, barcode: "PES-NEW-00001", name: "Unpriced Gadget", retail_price: 0 };
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [unpriced],
      byBarcode: new Map([[unpriced.barcode, unpriced]]),
      isLoading: false,
      isError: false,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-NEW-00001{Enter}");

    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    expect(screen.getByText(/Set a price for/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unpriced Gadget" })).toHaveAttribute("href", "/products/2");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("5000");

    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
    expect(screen.queryByText(/Set a price for/)).not.toBeInTheDocument();
  });

  it("invalidates the inventory and pricing queries after a successful sale", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
      }),
    });
    const { queryClient } = renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    await screen.findByText("#S-841");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["inventory"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["product-pricing", "current"] });
  });

  it("shows an error toast and keeps the cart when the sale submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: ["Insufficient stock for product 1: requested 1, available 0."],
        code: "invalid",
      }),
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
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
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
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
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
