import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsPageClient from "./ProductsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import * as useCatalogProductsModule from "@/lib/products/useCatalogProducts";
import type { CatalogProducts } from "@/lib/products/useCatalogProducts";
import { setMatchMedia } from "@/lib/test/matchMedia";

async function openMoreActions() {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
}

const products: CatalogProducts["all"] = [
  { product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12, reorder_level: 5, status: "ok", is_active: true, has_price: true, has_inventory: true },
  { product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio", retail_price: 145000, wholesale_price: 112000, quantity_in_stock: 2, reorder_level: 4, status: "low_stock", is_active: true, has_price: true, has_inventory: true },
  { product_id: 3, name: "Old Radio", brand: "Sony", model_number: "ICF-P26", barcode: "PES-AUD-00001", category_id: 20, category_name: "Audio", retail_price: 15000, wholesale_price: 9000, quantity_in_stock: 0, reorder_level: 2, status: "out_of_stock", is_active: false, has_price: true, has_inventory: true },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>{ui}</ConfirmProvider>
      </ToastProvider>
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

  it("shows both active products by default and hides inactive ones", () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
    expect(screen.queryByText("Old Radio")).not.toBeInTheDocument();
  });

  it("shows inactive products when the toggle is switched on", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Show inactive" }));
    expect(screen.getByText("Old Radio")).toBeInTheDocument();
  });

  it("filters by search text across name, brand, and barcode", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.type(screen.getByLabelText("Search products"), "jbl");
    expect(screen.queryByText("Samsung TV")).not.toBeInTheDocument();
    expect(screen.getByText("JBL Flip 6")).toBeInTheDocument();
  });

  it("matches the model number when searching", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.type(screen.getByLabelText("Search products"), "ua43");
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6")).not.toBeInTheDocument();
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
    // The page title is an h1; each product card title is an h3.
    const productNames = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
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

  it("wires the catalog through to the New product dialog so it can warn about duplicate names", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "+ New product" }));
    await userEvent.type(screen.getByLabelText("Name"), "Samsung TV");
    expect(
      await screen.findByText("A similar product already exists: Samsung TV (PES-TV-00082)")
    ).toBeInTheDocument();
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

  it("offers Manage categories to admin in the More actions menu and opens the dialog", async () => {
    renderWithProviders(<ProductsPageClient role="admin" />);
    await openMoreActions();
    await userEvent.click(screen.getByRole("menuitem", { name: "Manage categories" }));
    const dialog = within(screen.getByTestId("dialog-backdrop"));
    expect(dialog.getByText("Manage categories", { selector: "h4" })).toBeInTheDocument();
    // "Televisions" also appears as a category filter pill in the page header behind the
    // dialog, so this must be scoped to the dialog rather than a page-wide query.
    expect(dialog.getByText("Televisions")).toBeInTheDocument();
  });

  it("gives sales_staff no admin actions at all", () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New product" })).not.toBeInTheDocument();
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

  it("offers Find duplicates to an admin only", async () => {
    const { unmount } = renderWithProviders(<ProductsPageClient role="admin" />);
    await openMoreActions();
    expect(screen.getByRole("menuitem", { name: "Find duplicates" })).toBeInTheDocument();
    unmount();
    renderWithProviders(<ProductsPageClient role="manager" />);
    await openMoreActions();
    expect(screen.queryByRole("menuitem", { name: "Find duplicates" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Manage categories" })).toBeInTheDocument();
  });

  it("moves the filters into a Filters sheet on phone and counts the active ones", async () => {
    setMatchMedia({ desktop: false });
    renderWithProviders(<ProductsPageClient role="admin" />);
    expect(screen.queryByRole("radio", { name: "Televisions" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("radio", { name: "Televisions" }));
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("button", { name: "Filters (1)" })).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6")).not.toBeInTheDocument();
  });

  it("opens the New product dialog straight away when arriving from jump search (?new=1)", () => {
    renderWithProviders(<ProductsPageClient role="manager" openNew />);
    expect(screen.getByRole("heading", { name: "New product" })).toBeInTheDocument();
  });

  it("ignores ?new=1 for staff, who can't create products", () => {
    renderWithProviders(<ProductsPageClient role="sales_staff" openNew />);
    expect(screen.queryByRole("heading", { name: "New product" })).not.toBeInTheDocument();
  });
});
