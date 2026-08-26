import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsPageClient from "./ProductsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useCatalogProductsModule from "@/lib/products/useCatalogProducts";
import type { CatalogProducts } from "@/lib/products/useCatalogProducts";

const products: CatalogProducts["all"] = [
  { product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12, reorder_level: 5, status: "ok" },
  { product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio", retail_price: 145000, wholesale_price: 112000, quantity_in_stock: 2, reorder_level: 4, status: "low_stock" },
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
});
