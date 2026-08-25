import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddProductSingleForm } from "./AddProductSingleForm";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderForm(onAdded = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddProductSingleForm purchaseId={7} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}

describe("AddProductSingleForm", () => {
  let addItemCalls: { url: string; body: unknown }[];

  beforeEach(() => {
    addItemCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/")) {
          return Promise.resolve({
            ok: true,
            json: async () => paginated([{ product_id: 3, category: 2, barcode: "PES-AUD-00121", name: "Boya BY-M1 Microphone", brand: "Boya", model_number: null, description: null, specifications: null, usage_instructions: null, warranty_months: 12, reorder_level: 5, unit: "pcs", is_active: true, created_at: "2026-01-01" }]),
          });
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 2, name: "Audio", code: "AUD", description: null }]) });
        }
        if (url.includes("/purchases/7/items/")) {
          addItemCalls.push({ url, body: options?.body ? JSON.parse(options.body as string) : null });
          return Promise.resolve({
            ok: true,
            json: async () => ({ purchase_item_id: 1, purchase: 7, product: 3, quantity: 8, unit_cost_paid: "108000", unit_cost_invoiced: "108000", price_discrepancy_note: "", subtotal_paid: "864000", subtotal_invoiced: "864000" }),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("collapses to a quantity + prices form when an existing product is picked", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Search catalog first — reuse if it exists…"), "boya");
    await screen.findByText(/Boya BY-M1 Microphone/);
    await userEvent.click(screen.getByText(/Boya BY-M1 Microphone/));

    expect(screen.getByLabelText("Quantity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Product name")).not.toBeInTheDocument();
  });

  it("shows the full new-product form, pre-filled with the searched name, via the add-as-new link", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Search catalog first — reuse if it exists…"), "JBL Flip 6 Speaker");
    await userEvent.click(screen.getByText(/Add "JBL Flip 6 Speaker" as a new product/));

    expect(screen.getByLabelText("Product name")).toHaveValue("JBL Flip 6 Speaker");
    expect(screen.getByLabelText("Selling price / unit")).toBeInTheDocument();
  });

  it("submits an existing-product item with the collapsed fields and calls onAdded", async () => {
    const { onAdded } = renderForm();
    await userEvent.type(screen.getByLabelText("Search catalog first — reuse if it exists…"), "boya");
    await userEvent.click(await screen.findByText(/Boya BY-M1 Microphone/));

    await userEvent.type(screen.getByLabelText("Quantity"), "20");
    await userEvent.type(screen.getByLabelText("Buying price — paid / unit"), "11500");
    await userEvent.type(screen.getByLabelText("Buying price — on invoice / unit"), "11500");
    await userEvent.click(screen.getByRole("button", { name: "Add to purchase" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(addItemCalls[0].body).toEqual({
      product: 3, quantity: 20, unit_cost_paid: "11500", unit_cost_invoiced: "11500", price_discrepancy_note: "",
    });
  });

  it("requires a discrepancy note when paid and invoiced prices differ, and blocks submission until provided", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Search catalog first — reuse if it exists…"), "boya");
    await userEvent.click(await screen.findByText(/Boya BY-M1 Microphone/));

    await userEvent.type(screen.getByLabelText("Quantity"), "20");
    await userEvent.type(screen.getByLabelText("Buying price — paid / unit"), "10000");
    await userEvent.type(screen.getByLabelText("Buying price — on invoice / unit"), "11500");
    await userEvent.click(screen.getByRole("button", { name: "Add to purchase" }));

    expect(await screen.findByText("Required when paid and invoiced prices differ.")).toBeInTheDocument();
    expect(addItemCalls).toHaveLength(0);
  });
});
