import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductDetailPageClient from "./ProductDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { setMatchMedia } from "@/lib/test/matchMedia";
import * as useProductDetailModule from "@/lib/products/useProductDetail";
import * as useProductProfitabilityModule from "@/lib/products/useProductProfitability";
import * as useStockMovementsModule from "@/lib/stock/useStockMovements";
import * as useOpeningStockModule from "@/lib/products/useOpeningStock";
import type { ProductDetail } from "@/lib/products/useProductDetail";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

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
  trackedSerialCount: 1,
  isLoading: false,
  isError: false,
};

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

async function openTab(name: string) {
  await userEvent.click(screen.getByRole("tab", { name }));
}

async function chooseAction(name: string) {
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(screen.getByRole("menuitem", { name }));
}

function confirmDialog() {
  return within(screen.getByRole("dialog"));
}

let openingEligible = false;

describe("ProductDetailPageClient", () => {
  beforeEach(() => {
    pushMock.mockClear();
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue(baseDetail);
    vi.spyOn(useProductProfitabilityModule, "useProductProfitability").mockReturnValue({
      row: {
        product_id: 1, product_name: "JBL Flip 6 Speaker",
        units_bought: 10, avg_cost_paid: "100000.00", avg_cost_invoiced: "110000.00",
        units_sold: 4, revenue: "560000.00", projected_revenue: "580000.00",
        cogs_paid: "400000.00", cogs_invoiced: "440000.00",
        gross_margin: "160000.00", projected_margin: "140000.00",
        margin_pct: "28.57", projected_margin_pct: "24.14",
      },
      isLoading: false,
      isError: false,
    });
    // Mocked like the other data hooks so the page's own fetch stubs only see the
    // action under test (deactivate / delete), not the stock-movements query.
    vi.spyOn(useStockMovementsModule, "useStockMovements").mockReturnValue({
      movements: [],
      count: 0,
      isLoading: false,
      isError: false,
    });
    openingEligible = false;
    vi.spyOn(useOpeningStockModule, "useOpeningStockStatus").mockImplementation(
      (_id: number, enabled: boolean) =>
        ({ data: enabled ? { eligible: openingEligible, reason: null, in_stock: 2 } : undefined }) as unknown as ReturnType<
          typeof useOpeningStockModule.useOpeningStockStatus
        >
    );
    vi.stubGlobal("fetch", vi.fn());
  });

  it("offers Set opening stock to an admin only while the product has never been received", async () => {
    openingEligible = true;
    const { unmount } = renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await chooseAction("Set opening stock");
    expect(screen.getByLabelText("Opening count in stock")).toBeInTheDocument();
    expect(screen.getByText(/2 are already recorded in stock/)).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProductDetailPageClient productId={1} role="manager" />);
    expect(screen.queryByRole("menuitem", { name: "Set opening stock" })).not.toBeInTheDocument();
  });

  it("hides Set opening stock once the product has stock history", () => {
    openingEligible = false;
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.queryByRole("menuitem", { name: "Set opening stock" })).not.toBeInTheDocument();
  });

  it("lets an admin open the Adjust stock dialog from the stock card, but not sales_staff", async () => {
    const { unmount } = renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await openTab("Stock & movements");
    await userEvent.click(screen.getByRole("button", { name: "Adjust stock" }));
    expect(screen.getByRole("heading", { name: "Adjust stock — JBL Flip 6 Speaker" })).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "Adjust stock" })).not.toBeInTheDocument();
  });

  it("offers Use in shop to every role, opening the consume / shop-asset dialog", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 0, next: null, previous: null, results: [] }) })));
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    await userEvent.click(screen.getByRole("button", { name: "Use in shop" }));
    expect(screen.getByRole("heading", { name: "Use in shop — JBL Flip 6 Speaker" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows the reorder level and links tracked serials to the stock page", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("link", { name: "On → 1 units" })).toHaveAttribute("href", "/stock?product=1");
    await openTab("Stock & movements");
    expect(within(screen.getByRole("tabpanel")).getByText("reorder at 4")).toBeInTheDocument();
  });

  it("renders the Cost & margin card for admin and manager, not for sales_staff", async () => {
    const { unmount } = renderWithProviders(<ProductDetailPageClient productId={1} role="manager" />);
    await openTab("Pricing");
    expect(screen.getByText("Cost & margin · all time")).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    await openTab("Pricing");
    expect(screen.queryByText("Cost & margin · all time")).not.toBeInTheDocument();
  });

  it("renders the product name, status, and barcode", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("heading", { level: 1, name: "JBL Flip 6 Speaker" })).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
  });

  it("renders the Pricing card for admin", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await openTab("Pricing");
    expect(screen.getByText("Current pricing · Admin only")).toBeInTheDocument();
  });

  it("hides the Pricing card for sales_staff", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    await openTab("Pricing");
    expect(screen.queryByText("Current pricing · Admin only")).not.toBeInTheDocument();
  });

  it("shows key stats in the header: stock and retail for everyone, cost and margin for admin/manager only", () => {
    const { unmount } = renderWithProviders(<ProductDetailPageClient productId={1} role="manager" />);
    const stats = within(screen.getByRole("list", { name: "Key figures" }));
    expect(stats.getByText("In stock")).toBeInTheDocument();
    expect(stats.getByText("RWF 145,000")).toBeInTheDocument();
    expect(stats.getByText("Avg cost")).toBeInTheDocument();
    expect(stats.getByText("28.57%")).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    const staffStats = within(screen.getByRole("list", { name: "Key figures" }));
    expect(staffStats.queryByText("Avg cost")).not.toBeInTheDocument();
    expect(staffStats.queryByText(/%/)).not.toBeInTheDocument();
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
    // Exactly one "Edit" (the product); the info sheet has its own, distinct name.
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Edit product")).toBeInTheDocument();
  });

  it("opens the set-price dialog when Set new price is clicked", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await openTab("Pricing");
    await userEvent.click(screen.getByRole("button", { name: "Set new price" }));
    expect(screen.getByRole("heading", { name: "Set new price" })).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isLoading: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("status", { name: "Loading product…" })).toBeInTheDocument();
  });

  it("shows an error state with a retry option", () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail, isError: true, product: undefined,
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText(/Couldn't load this product/)).toBeInTheDocument();
  });

  it("offers Deactivate to admin in the actions menu when the product is active", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("gives sales_staff no admin actions menu", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="sales_staff" />);
    expect(screen.queryByRole("button", { name: "More actions" })).not.toBeInTheDocument();
  });

  it("offers Reactivate and shows the Inactive tag when the product is inactive", async () => {
    vi.spyOn(useProductDetailModule, "useProductDetail").mockReturnValue({
      ...baseDetail,
      product: { ...baseDetail.product!, is_active: false },
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Reactivate" })).toBeInTheDocument();
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
    await chooseAction("Deactivate");

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
    await chooseAction("Deactivate");

    expect(await screen.findByText("You do not have permission to perform this action.")).toBeInTheDocument();
  });

  it("offers Delete to admin in the actions menu", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not delete when the confirmation is dismissed", async () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await chooseAction("Delete");
    await userEvent.click(confirmDialog().getByRole("button", { name: "Cancel" }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("deletes after confirmation, invalidates products, toasts, and returns to the list", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await chooseAction("Delete");
    expect(confirmDialog().getByText(/This can't be undone/)).toBeInTheDocument();
    await userEvent.click(confirmDialog().getByRole("button", { name: "Delete product" }));

    expect(await screen.findByText("Product deleted.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/proxy/products/1/", expect.objectContaining({ method: "DELETE" }));
    expect(pushMock).toHaveBeenCalledWith("/products");
  });

  it("shows the backend message when delete is blocked by purchase or sale history", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: "This product has purchase or sale history and cannot be deleted. Deactivate it instead so past records stay intact.",
      }),
    });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    await chooseAction("Delete");
    await userEvent.click(confirmDialog().getByRole("button", { name: "Delete product" }));

    expect(
      await screen.findByText(/This product has purchase or sale history and cannot be deleted/)
    ).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("opens a tab for every section, with Shop use listing what the shop took", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ count: 0, next: null, previous: null, results: [] }) })));
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Overview", "Pricing", "Stock & movements", "Shop use"]);
    await openTab("Shop use");
    expect(await screen.findByText("Nothing used in the shop yet")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("has a back link to Products", () => {
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/products");
  });

  it("keeps the main actions reachable on phone", () => {
    setMatchMedia({ desktop: false });
    renderWithProviders(<ProductDetailPageClient productId={1} role="admin" />);
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "Use in shop" })).toBeInTheDocument();
    expect(header.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });
});
