import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddBundleForm } from "./AddBundleForm";
import { ToastProvider } from "@/components/layout/ToastProvider";

const template = {
  template_id: 4, name: "Canalbox TV kit", supplier: 2, created_by: 1, created_at: "2026-10-01T00:00:00Z",
  components: [
    { template_component_id: 1, product: 7, product_name: "Canal TV 43", product_barcode: "PES-TV-00001", qty_per_bundle: 1 },
    { template_component_id: 2, product: 6, product_name: "Canalbox decoder", product_barcode: "PES-TV-00002", qty_per_bundle: 20 },
  ],
};

let posted: Record<string, unknown>[] = [];

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderForm(onAdded = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddBundleForm purchaseId={9} supplierId={2} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}

describe("AddBundleForm", () => {
  beforeEach(() => {
    posted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("bundle-templates/")) return Promise.resolve({ ok: true, json: async () => page([template]) });
        if (url.includes("categories/")) return Promise.resolve({ ok: true, json: async () => page([]) });
        if (url.includes("bundle-split-preview/")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              components: [
                { product: 7, qty_per_bundle: 1, retail_price: "500000.00", allocated_paid_cost: "400000.00",
                  allocated_invoiced_cost: "400000.00", unit_paid_cost: "400000.00", unit_invoiced_cost: "400000.00" },
                { product: 6, qty_per_bundle: 20, retail_price: "25000.00", allocated_paid_cost: "400000.00",
                  allocated_invoiced_cost: "400000.00", unit_paid_cost: "20000.00", unit_invoiced_cost: "20000.00" },
              ],
            }),
          });
        }
        if (url.includes("purchases/9/items/") && init?.method === "POST") {
          posted.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ purchase_item_id: 1 }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ results: [] }) });
      })
    );
  });

  it("fills components from a template, takes the default split and posts the bundle", async () => {
    const { onAdded } = renderForm();
    await userEvent.selectOptions(await screen.findByLabelText("Start from a template"), "4");
    expect(screen.getByText("Canal TV 43")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantity per bundle for component 2")).toHaveValue(20);

    await userEvent.type(screen.getByLabelText("Paid / bundle"), "800000");
    expect(screen.getByText(/Paid: RWF 800,000 left to allocate/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Default split" }));
    await waitFor(() => expect(screen.getByLabelText("Paid share for component 1")).toHaveValue(400000));
    expect(screen.getByText(/Paid: fully allocated/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add bundle line" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(posted[0]).toMatchObject({
      line_kind: "bundle", bundle_name: "Canalbox TV kit", quantity: 1, unit_cost_paid: "800000",
      unit_cost_invoiced: "800000",
      components: [
        { product: 7, qty_per_bundle: 1, allocated_paid_cost: "400000.00", allocated_invoiced_cost: "400000.00" },
        { product: 6, qty_per_bundle: 20, allocated_paid_cost: "400000.00", allocated_invoiced_cost: "400000.00" },
      ],
    });
  });

  it("sends no shares when they're left blank, so the backend splits by retail price", async () => {
    renderForm();
    await userEvent.selectOptions(await screen.findByLabelText("Start from a template"), "4");
    await userEvent.type(screen.getByLabelText("Paid / bundle"), "800000");
    await userEvent.click(screen.getByRole("button", { name: "Add bundle line" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0].components).toEqual([
      { product: 7, qty_per_bundle: 1 },
      { product: 6, qty_per_bundle: 20 },
    ]);
  });

  it("refuses shares that don't add up to the bundle price", async () => {
    renderForm();
    await userEvent.selectOptions(await screen.findByLabelText("Start from a template"), "4");
    await userEvent.type(screen.getByLabelText("Paid / bundle"), "100");
    await userEvent.type(screen.getByLabelText("Paid share for component 1"), "60");
    await userEvent.type(screen.getByLabelText("Paid share for component 2"), "30");
    await userEvent.click(screen.getByRole("button", { name: "Add bundle line" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Shares must add up to the bundle price (RWF 10 left to allocate).");
    expect(posted).toHaveLength(0);
  });
});
