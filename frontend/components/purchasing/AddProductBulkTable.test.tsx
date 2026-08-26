import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddProductBulkTable } from "./AddProductBulkTable";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderTable(onAdded = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddProductBulkTable purchaseId={7} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}

describe("AddProductBulkTable", () => {
  let itemPosts: unknown[];

  beforeEach(() => {
    itemPosts = [];
    Object.assign(window, { print: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ product_id: 3, category: 2, barcode: "PES-AUD-00121", name: "Boya BY-M1 Microphone", brand: null, model_number: null, description: null, specifications: null, usage_instructions: null, warranty_months: null, reorder_level: 5, unit: "pcs", is_active: true, created_at: "2026-01-01" }]),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 2, name: "Audio", code: "AUD", description: null }]) });
        }
        if (url.includes("/purchases/7/items/")) {
          const body = options?.body ? JSON.parse(options.body as string) : null;
          itemPosts.push(body);
          if (body?.product === 3) {
            return Promise.resolve({ ok: true, json: async () => ({ purchase_item_id: 1, purchase: 7, product: 3, quantity: 20, unit_cost_paid: "11500", unit_cost_invoiced: "11500", price_discrepancy_note: "", subtotal_paid: "230000", subtotal_invoiced: "230000" }) });
          }
          return Promise.resolve({ ok: false, status: 400, json: async () => ({ category: ["Required when not referencing an existing product."] }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("keeps a trailing empty row as the last row grows a name", async () => {
    renderTable();
    const nameInputs = () => screen.getAllByLabelText("Product name");
    expect(nameInputs()).toHaveLength(1);
    await userEvent.type(nameInputs()[0], "Boya BY-M1 Microphone");
    await waitFor(() => expect(nameInputs()).toHaveLength(2));
  });

  it("matches an existing product by name and marks the row reused, disabling selling price", async () => {
    renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    expect(await screen.findByText(/PES-AUD-00121 \(existing\)/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Sell price")[0]).toBeDisabled();
  });

  it("submits matched rows as existing-product items and calls onAdded", async () => {
    const { onAdded } = renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    await screen.findByText(/PES-AUD-00121/);
    await userEvent.type(screen.getAllByLabelText("Quantity")[0], "20");
    await userEvent.type(screen.getAllByLabelText("Buy price paid")[0], "11500");
    await userEvent.type(screen.getAllByLabelText("Buy price invoiced")[0], "11500");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(itemPosts).toEqual([{ product: 3, quantity: 20, unit_cost_paid: "11500", unit_cost_invoiced: "11500", price_discrepancy_note: "" }]);
  });

  it("clicking Print all new labels triggers window.print", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Print all new labels" }));
    expect(window.print).toHaveBeenCalled();
  });

  it("blocks a row with paid ≠ invoiced until a discrepancy note is entered, then submits it", async () => {
    renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    await screen.findByText(/PES-AUD-00121/);
    await userEvent.type(screen.getAllByLabelText("Quantity")[0], "20");
    await userEvent.type(screen.getAllByLabelText("Buy price paid")[0], "10000");
    await userEvent.type(screen.getAllByLabelText("Buy price invoiced")[0], "11500");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    expect(await screen.findByText("Required when paid and invoiced prices differ.")).toBeInTheDocument();
    expect(itemPosts).toHaveLength(0);

    await userEvent.type(screen.getAllByLabelText("Discrepancy note")[0], "Verbal bulk discount");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    await waitFor(() => expect(itemPosts).toHaveLength(1));
    expect(itemPosts).toEqual([
      { product: 3, quantity: 20, unit_cost_paid: "10000", unit_cost_invoiced: "11500", price_discrepancy_note: "Verbal bulk discount" },
    ]);
  });
});
