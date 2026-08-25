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

function renderList(editable = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PurchaseItemsList purchaseId={7} items={items} editable={editable} />
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
});
