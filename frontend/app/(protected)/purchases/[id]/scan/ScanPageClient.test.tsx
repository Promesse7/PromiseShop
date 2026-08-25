import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ScanPageClient from "./ScanPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import * as usePurchaseDetailModule from "@/lib/purchasing/usePurchaseDetail";
import type { PurchaseDetail } from "@/lib/purchasing/usePurchaseDetail";
import type { Purchase } from "@/lib/types";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function purchase(overrides: Partial<Purchase> = {}): Purchase {
  return {
    purchase_id: 7, supplier: 1, employee: 2, invoice_number: "KE-8841", purchase_date: "2026-08-23",
    total_paid: "3002000", total_invoiced: "3034000", payment_status: "paid", status: "draft",
    items: [
      { purchase_item_id: 1, purchase: 7, product: 3, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "112000", price_discrepancy_note: "bulk", subtotal_paid: "864000", subtotal_invoiced: "896000" },
      { purchase_item_id: 2, purchase: 7, product: 4, quantity: 6, unit_cost_paid: "50000", unit_cost_invoiced: "50000", price_discrepancy_note: "", subtotal_paid: "300000", subtotal_invoiced: "300000" },
    ],
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ScanPageClient purchaseId={7} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ScanPageClient", () => {
  let itemPosts: unknown[];

  beforeEach(() => {
    itemPosts = [];
    vi.spyOn(usePurchaseDetailModule, "usePurchaseDetail").mockReturnValue({
      purchase: purchase(), isLoading: false, isError: false,
    } satisfies PurchaseDetail);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ product_id: 3, category: 2, barcode: "6925281998768", name: "JBL Flip 6 Speaker", brand: "JBL", model_number: null, description: null, specifications: null, usage_instructions: null, warranty_months: 12, reorder_level: 4, unit: "pcs", is_active: true, created_at: "2026-01-01" }]),
          });
        }
        if (url.includes("/purchases/7/items/")) {
          const body = options?.body ? JSON.parse(options.body as string) : null;
          itemPosts.push(body);
          return Promise.resolve({ ok: true, json: async () => ({ purchase_item_id: 3, purchase: 7, product: 3, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "108000", price_discrepancy_note: "", subtotal_paid: "864000", subtotal_invoiced: "864000" }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("shows the received-so-far summary from the purchase's own server totals", () => {
    renderPage();
    expect(screen.getByText(/2 products · 14 units · paid RWF 3,002,000 \/ invoiced RWF 3,034,000/)).toBeInTheDocument();
  });

  it("finds a product by barcode search and shows the just-scanned card", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Scan received item…"), "6925281998768");
    await userEvent.click(await screen.findByText(/JBL Flip 6 Speaker/));
    expect(screen.getByText("Just scanned")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
  });

  it("adds the scanned item to the purchase with touch-sized fields", async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText("Scan received item…"), "JBL");
    await userEvent.click(await screen.findByText(/JBL Flip 6 Speaker/));

    expect(screen.getByLabelText("Quantity")).toHaveAttribute("class", expect.stringContaining("min-h-11"));
    await userEvent.type(screen.getByLabelText("Quantity"), "8");
    await userEvent.type(screen.getByLabelText("Unit cost paid"), "108000");
    await userEvent.type(screen.getByLabelText("Unit cost invoiced"), "108000");
    await userEvent.click(screen.getByRole("button", { name: "Add to purchase #P-7" }));

    await waitFor(() => expect(itemPosts).toEqual([{ product: 3, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "108000", price_discrepancy_note: "" }]));
  });
});
