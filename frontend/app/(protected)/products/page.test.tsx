import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsPageClient from "./ProductsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useCatalogProductsModule from "@/lib/products/useCatalogProducts";
import type { CatalogProducts } from "@/lib/products/useCatalogProducts";

const products: CatalogProducts["all"] = [
  { product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12, reorder_level: 5, status: "ok", is_active: true },
  { product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio", retail_price: 145000, wholesale_price: 112000, quantity_in_stock: 2, reorder_level: 4, status: "low_stock", is_active: true },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ProductsPageClient", () => {
  beforeEach(() => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: products,
      categories: [
        { category_id: 10, name: "Televisions", code: "TV", description: null },
        { category_id: 20, name: "Audio", code: "AUD", description: null },
      ],
      isLoading: false,
      isError: false,
    } satisfies CatalogProducts);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows both products by default", () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("filters by search text across name, brand, and barcode", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.type(screen.getByLabelText("Search products"), "jbl");
    expect(screen.queryByText("Samsung TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("filters by category tab", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("radio", { name: "Televisions" }));
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6")).not.toBeInTheDocument();
  });

  it("filters by stock status", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("radio", { name: "Low stock" }));
    expect(screen.queryByText("Samsung TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("sorts by price low to high", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "price");
    // "Products" (the PageHeader title) is also an h3, so it's the first heading in document order.
    const [, ...productNames] = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(productNames).toEqual(["JBL Flip 6", "Samsung TV"]);
  });

  it("shows the New product button for admin", () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByRole("button", { name: "+ New product" })).toBeInTheDocument();
  });

  it("hides the New product button for sales_staff", () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "+ New product" })).not.toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: [], categories: [], isLoading: true, isError: false,
    } satisfies CatalogProducts);
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByRole("status", { name: "Loading products…" })).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(useCatalogProductsModule, "useCatalogProducts").mockReturnValue({
      all: [], categories: [], isLoading: false, isError: true,
    } satisfies CatalogProducts);
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText(/Couldn't load products/)).toBeInTheDocument();
  });

  it("selecting products shows a bulk print bar and prints their labels", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print 1 labels" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("prints a single product's label from its card", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("unmounts the label sheet once the print dialog closes", async () => {
    vi.spyOn(window, "print").mockImplementation(() => {});
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(screen.getByRole("img", { name: "Barcode for PES-TV-00082" })).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });

    expect(screen.queryByRole("img", { name: "Barcode for PES-TV-00082" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("shows the Manage categories button for admin and opens the dialog", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    const button = screen.getByRole("button", { name: "Manage categories" });
    expect(button).toBeInTheDocument();
    await userEvent.click(button);
    const dialog = within(screen.getByTestId("dialog-backdrop"));
    expect(dialog.getByText("Manage categories", { selector: "h4" })).toBeInTheDocument();
    // "Televisions" also appears as a category filter pill in the page header behind the
    // dialog, so this must be scoped to the dialog rather than a page-wide query.
    expect(dialog.getByText("Televisions")).toBeInTheDocument();
  });

  it("hides the Manage categories button for sales_staff", () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Manage categories" })).not.toBeInTheDocument();
  });

  it("shows a Deactivate N products button for admin once products are selected", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(screen.getByRole("button", { name: "Deactivate 1 products" })).toBeInTheDocument();
  });

  it("hides the bulk Deactivate button for sales_staff", async () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" />);
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(screen.queryByText(/Deactivate \d+ products/)).not.toBeInTheDocument();
  });

  it("bulk-deactivates the selected products, clears the selection, and shows a summary toast", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...products[0], is_active: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...products[1], is_active: false }) });
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    await userEvent.click(screen.getByLabelText("Select JBL Flip 6"));
    await userEvent.click(screen.getByRole("button", { name: "Deactivate 2 products" }));

    expect(await screen.findByText("2 products deactivated.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/1/set-active/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ is_active: false }) })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/2/set-active/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ is_active: false }) })
    );
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });
});
