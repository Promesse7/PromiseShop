import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductDetailPageClient from "./ProductDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as useProductDetailModule from "@/lib/products/useProductDetail";
import type { ProductDetail } from "@/lib/products/useProductDetail";

const baseDetail: ProductDetail = {
  product: {
    product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker",
    brand: "JBL", model_number: "JBLFLIP6BLK", description: null, specifications: "30 W RMS",
    usage_instructions: "Hold power 2s.", warranty_months: 12, reorder_level: 4, unit: "pcs",
    tax_category: "B", is_active: true, created_at: "2026-01-01T00:00:00Z",
  },
  category: { category_id: 20, name: "Audio", code: "AUD", description: null },
  currentPricing: { price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true },
  priceHistory: [{ price_id: 2, product: 1, wholesale_price: "112000.00", retail_price: "145000.00", effective_date: "2026-07-01", is_current: true }],
  inventory: { inventory_id: 9, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2", last_updated: "2026-08-01T00:00:00Z", is_low_stock: true },
  hasTrackedSerials: true,
  isLoading: false,
  isError: false,
};

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ProductDetailPageClient", () => {
  beforeEach(() => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue(baseDetail);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders the product name, status, and barcode", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
  });

  it("renders the Pricing card for admin", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
  });

  it("hides the Pricing card for sales_staff", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByText("Current pricing · Admin only")).not.toBeInTheDocument();
  });

  it("has a Reorder link that opens a prefilled new purchase for this product", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("link", { name: "Reorder" })).toHaveAttribute(
      "href",
      "/purchases?open=new&reorder_product=1&reorder_name=JBL%20Flip%206%20Speaker"
    );
  });

  it("hides Edit for sales_staff", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("opens the edit dialog when Edit is clicked", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByText("Edit product")).toBeInTheDocument();
  });

  it("opens the set-price dialog when Set new price is clicked", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "Set new price" }));
    expect(screen.getByRole("heading", { name: "Set new price" })).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isLoading: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("Loading product…")).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isError: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText(/Couldn't load this product/)).toBeInTheDocument();
  });

  it("shows a Deactivate button for admin when the product is active", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("hides the Deactivate/Reactivate button for sales_staff", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate" })).not.toBeInTheDocument();
  });

  it("shows a Reactivate button and the Inactive tag when the product is inactive", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail,
      product: { ...baseDetail.product!, is_active: false },
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("does not show the Inactive tag when the product is active", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("posts to set-active, shows a success toast, and invalidates products on Deactivate", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...baseDetail.product, is_active: false }),
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Product deactivated.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/1/set-active/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ is_active: false }) })
    );
  });

  it("shows an error toast when the set-active request fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: "You do not have permission to perform this action." }),
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("You do not have permission to perform this action.")).toBeInTheDocument();
  });
});
