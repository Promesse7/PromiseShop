import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddPackForm } from "./AddPackForm";
import { ToastProvider } from "@/components/layout/ToastProvider";

const decoder = {
  product_id: 6, name: "Canalbox decoder", brand: null, model_number: null, barcode: "PES-TV-00002",
  category: 1, category_name: "TV", is_active: true, in_stock: 0, retail_price: "25000.00",
  match: "barcode", score: 1,
};

let posted: unknown[] = [];

function renderForm(onAdded = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddPackForm purchaseId={9} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}

describe("AddPackForm", () => {
  beforeEach(() => {
    posted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("products/search/")) {
          return Promise.resolve({ ok: true, json: async () => ({ results: [decoder] }) });
        }
        if (url.includes("categories/")) {
          return Promise.resolve({ ok: true, json: async () => ({ count: 0, next: null, previous: null, results: [] }) });
        }
        if (url.includes("purchases/9/items/") && init?.method === "POST") {
          posted.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ purchase_item_id: 1 }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
  });

  it("shows the units the packs bring in and posts a pack line", async () => {
    const { onAdded } = renderForm();
    await userEvent.type(screen.getByRole("combobox", { name: "Product in the pack" }), "PES-TV-00002");
    expect(await screen.findByRole("button", { name: "Change" })).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Packs"));
    await userEvent.type(screen.getByLabelText("Packs"), "3");
    await userEvent.type(screen.getByLabelText("Units per pack"), "24");
    await userEvent.type(screen.getByLabelText("Paid / pack"), "480000");
    expect(screen.getByText(/3 × pack of 24 = 72 units in stock/)).toBeInTheDocument();
    expect(screen.getByText(/20,000 per unit/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add pack line" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(posted[0]).toEqual({
      line_kind: "pack", quantity: 3, units_per_pack: 24, unit_cost_paid: "480000",
      unit_cost_invoiced: "480000", price_discrepancy_note: "", product: 6,
    });
  });

  it("refuses a pack of fewer than 2 units", async () => {
    renderForm();
    await userEvent.type(screen.getByRole("combobox", { name: "Product in the pack" }), "PES-TV-00002");
    await screen.findByRole("button", { name: "Change" });
    await userEvent.type(screen.getByLabelText("Units per pack"), "1");
    await userEvent.type(screen.getByLabelText("Paid / pack"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add pack line" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A pack holds at least 2 units.");
    expect(posted).toHaveLength(0);
  });
});
