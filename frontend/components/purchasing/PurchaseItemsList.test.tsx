import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PurchaseItemsList } from "./PurchaseItemsList";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { PurchaseItem } from "@/lib/types";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const items: PurchaseItem[] = [
  { purchase_item_id: 1, purchase: 7, product: 3, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "112000", price_discrepancy_note: "bulk discount", subtotal_paid: "864000", subtotal_invoiced: "896000" },
];

function renderList(editable = true, showCosts = false, rows: PurchaseItem[] = items) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PurchaseItemsList purchaseId={7} items={rows} editable={editable} showCosts={showCosts} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("PurchaseItemsList", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ product_id: 3, category: 2, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL", model_number: null, description: null, specifications: null, usage_instructions: null, warranty_months: 12, reorder_level: 4, unit: "pcs", is_active: true, created_at: "2026-01-01" }]),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 2, name: "Audio", code: "AUD", description: null }]) });
        }
        if (url.includes("/items/1/") && options?.method === "DELETE") {
          return Promise.resolve({ ok: true, json: async () => { throw new Error("no body"); } });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("shows the product name and the real assigned shop barcode", async () => {
    renderList();
    expect(await screen.findByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
  });

  it("shows a disabled Regenerate button with an explanatory title", async () => {
    renderList();
    await screen.findByText("JBL Flip 6 Speaker");
    const regenerate = screen.getByRole("button", { name: "Regenerate" });
    expect(regenerate).toBeDisabled();
    expect(regenerate).toHaveAttribute("title", "Not available — barcodes are shop-assigned once, at entry.");
  });

  it("opens the reused ProductFormDialog, pre-filled, when Edit product is clicked", async () => {
    renderList();
    await userEvent.click(await screen.findByRole("button", { name: "Edit product" }));
    expect(await screen.findByRole("heading", { name: "Edit product" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("removes an item and calls the delete endpoint when editable", async () => {
    renderList(true);
    await userEvent.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/proxy/purchases/7/items/1/", expect.objectContaining({ method: "DELETE" })));
  });

  it("hides Remove once the purchase is no longer editable (received)", async () => {
    renderList(false);
    await screen.findByText("JBL Flip 6 Speaker");
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows paid, invoiced, difference and the note per line when costs are visible", async () => {
    renderList(true, true);
    await screen.findByText("JBL Flip 6 Speaker");
    expect(screen.getByRole("columnheader", { name: "Paid" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Invoiced" })).toBeInTheDocument();
    expect(screen.getByText("108,000")).toBeInTheDocument();
    expect(screen.getByText("112,000")).toBeInTheDocument();
    // 8 × (112,000 − 108,000): the supplier billed more than was paid.
    expect(screen.getByText("+32,000")).toBeInTheDocument();
    expect(screen.getByText("bulk discount")).toBeInTheDocument();
  });

  it("hides the cost columns when costs are not visible", async () => {
    renderList(true, false);
    await screen.findByText("JBL Flip 6 Speaker");
    expect(screen.queryByRole("columnheader", { name: "Paid" })).not.toBeInTheDocument();
    expect(screen.queryByText("108,000")).not.toBeInTheDocument();
  });

  it("shows dashes when the API omitted the cost fields", async () => {
    renderList(true, true, [{ purchase_item_id: 1, purchase: 7, product: 3, quantity: 8, price_discrepancy_note: null }]);
    await screen.findByText("JBL Flip 6 Speaker");
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows a pack as packs of single units, priced per pack and per unit", async () => {
    renderList(true, true, [{
      purchase_item_id: 1, purchase: 7, product: 3, line_kind: "pack", units_per_pack: 24, quantity: 3,
      units_received: 72, unit_cost_paid: "480000", unit_cost_invoiced: "480000",
      unit_cost_paid_per_unit: "20000.00", price_discrepancy_note: null,
    }]);
    expect(await screen.findByText("JBL Flip 6 Speaker — 3 × pack of 24 = 72 units")).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("20,000 / unit")).toBeInTheDocument();
  });

  it("shows a bundle with its components and their barcodes, without Edit product", async () => {
    renderList(true, false, [{
      purchase_item_id: 1, purchase: 7, product: null, line_kind: "bundle", units_per_pack: 1, quantity: 1,
      bundle_name: "Canalbox TV kit", units_received: 21, price_discrepancy_note: null,
      components: [
        { component_id: 1, product: 8, product_name: "Canal TV 43", product_barcode: "PES-TV-00001", qty_per_bundle: 1, units: 1 },
        { component_id: 2, product: 9, product_name: "Canalbox decoder", product_barcode: "PES-TV-00002", qty_per_bundle: 20, units: 20 },
      ],
    }]);
    expect(await screen.findByText("Canalbox TV kit — 1 bundle = 21 units")).toBeInTheDocument();
    expect(screen.getByText("Canalbox decoder × 20 per bundle = 20")).toBeInTheDocument();
    expect(screen.getByText("PES-TV-00001, PES-TV-00002")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit product" })).not.toBeInTheDocument();
  });
});
