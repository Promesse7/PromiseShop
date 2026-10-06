import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SaleDetailPageClient from "./SaleDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import * as useShopProfileModule from "@/lib/settings/useShopProfile";

const baseSale = {
  sale_id: 41, customer: null, customer_name: null, employee: 3, employee_name: "Staff One",
  sale_date: "2026-10-06T08:30:00Z", payment_method: "cash", total_amount: "300.00", amount_paid: "300.00",
  balance: "0.00", returned_amount: "0.00", discount_total: "0.00", status: "completed", can_void: true,
  void_reason: "", voided_by_name: null, voided_at: null,
  items: [
    { sale_item_id: 11, sale: 41, product: 5, product_name: "Speaker", quantity: 3, unit_price: "100.00", list_price: "100.00", subtotal: "300.00", tax_category: "B", tax_amount: "45.76", cost_at_sale: "60.00" },
  ],
  payments: [], returns: [],
  movements: [
    { movement_id: 1, product: 5, product_name: "Speaker", movement_type: "sale", bucket: "in_stock", quantity_delta: -3, balance_after: 47, reason: "Sale #41", created_at: "2026-10-06T08:30:00Z", created_by_name: "Staff One" },
  ],
};

let sale: Record<string, unknown> = baseSale;
let notFound = false;
const fetchMock = vi.fn((url: string, options?: RequestInit) => {
  if (notFound) return Promise.resolve({ ok: false, status: 404, json: async () => ({ detail: "Not found." }) });
  if (url.endsWith("sales/41/void/") && options?.method === "POST") {
    return Promise.resolve({ ok: true, json: async () => ({ ...baseSale, status: "voided" }) });
  }
  if (url.endsWith("sales/41/")) return Promise.resolve({ ok: true, json: async () => sale });
  return Promise.resolve({ ok: true, json: async () => ({}) });
});

function renderPage(canManage: boolean, saleId = 41) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <SaleDetailPageClient saleId={saleId} canManage={canManage} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("SaleDetailPageClient", () => {
  beforeEach(() => {
    sale = baseSale;
    notFound = false;
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(useShopProfileModule, "useShopProfile").mockReturnValue({
      data: { business_name: "Promise Electronic Shop" }, isLoading: false, isError: false,
    } as ReturnType<typeof useShopProfileModule.useShopProfile>);
  });

  it("shows lines with catalog price and cost, and the stock movements", async () => {
    renderPage(true);
    expect(await screen.findByRole("heading", { name: "Sale #S-41" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Movements/ }));
    expect(screen.getByText("Sold · Speaker", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("-3 → 47")).toBeInTheDocument();
  });

  it("lets a manager void today's sale with a reason", async () => {
    renderPage(true);
    await userEvent.click(await screen.findByRole("button", { name: "Void" }));
    await userEvent.type(screen.getByLabelText("Reason"), "Rang up twice");
    await userEvent.click(screen.getByRole("button", { name: "Void sale" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/proxy/sales/41/void/",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ reason: "Rang up twice" }) })
      )
    );
  });

  it("hides void once the day has passed but still offers a return", async () => {
    sale = { ...baseSale, can_void: false };
    renderPage(true);
    expect(await screen.findByRole("button", { name: "Return items" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
  });

  it("gives staff a reprint only, without cost or catalog columns", async () => {
    renderPage(false);
    await screen.findByRole("heading", { name: "Sale #S-41" });
    expect(screen.queryByRole("button", { name: "Void" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return items" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Cost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Catalog" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reprint receipt" }));
    expect(screen.getByText("REPRINT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New sale" })).not.toBeInTheDocument();
  });

  it("leads with a summary strip and a back link to the sales list", async () => {
    renderPage(true);
    const strip = await screen.findByRole("list", { name: "Sale summary" });
    expect(strip).toHaveTextContent("Total");
    expect(strip).toHaveTextContent("RWF 300");
    expect(strip).toHaveTextContent("Completed");
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/sales");
  });

  it("groups the detail into tabs", async () => {
    renderPage(true);
    await screen.findByRole("heading", { name: "Sale #S-41" });
    expect(screen.getByRole("tab", { name: /Lines/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: /Payments/ }));
    expect(screen.getByText("No payments")).toBeInTheDocument();
  });

  it("shows a not-found state for a sale that doesn't exist", async () => {
    notFound = true;
    renderPage(true, 999);
    expect(await screen.findByText("Sale #S-999 not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to sales" })).toHaveAttribute("href", "/sales");
  });
});
