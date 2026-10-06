import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReceivedLabelsDialog } from "./ReceivedLabelsDialog";
import type { PurchaseItem } from "@/lib/types";

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const items: PurchaseItem[] = [
  { purchase_item_id: 1, purchase: 9, product: 6, line_kind: "pack", units_per_pack: 24, quantity: 1,
    units_received: 24, price_discrepancy_note: null },
  { purchase_item_id: 2, purchase: 9, product: null, line_kind: "bundle", units_per_pack: 1, quantity: 1,
    bundle_name: "Canalbox TV kit", units_received: 21, price_discrepancy_note: null,
    components: [
      { component_id: 1, product: 7, product_name: "Canal TV 43", product_barcode: "PES-TV-00001", qty_per_bundle: 1, units: 1 },
      { component_id: 2, product: 6, product_name: "Canalbox decoder", product_barcode: "PES-TV-00002", qty_per_bundle: 20, units: 20 },
    ] },
];

let registered: unknown[] = [];

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReceivedLabelsDialog open onClose={vi.fn()} items={items} />
    </QueryClientProvider>
  );
}

describe("ReceivedLabelsDialog", () => {
  beforeEach(() => {
    registered = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes("/products/")) {
          return Promise.resolve({ ok: true, json: async () => page([
            { product_id: 6, name: "Canalbox decoder", barcode: "PES-TV-00002", category: 1, brand: null, model_number: null, reorder_level: 5, is_active: true },
            { product_id: 7, name: "Canal TV 43", barcode: "PES-TV-00001", category: 1, brand: null, model_number: null, reorder_level: 5, is_active: true },
          ]) });
        }
        if (url.includes("categories/")) return Promise.resolve({ ok: true, json: async () => page([{ category_id: 1, name: "TV", code: "TV" }]) });
        if (url.includes("product-pricing/")) {
          return Promise.resolve({ ok: true, json: async () => page([
            { price_id: 1, product: 6, retail_price: "25000.00", effective_date: "2026-01-01", is_current: true },
            { price_id: 2, product: 7, retail_price: "500000.00", effective_date: "2026-01-01", is_current: true },
          ]) });
        }
        if (url.includes("inventory/")) return Promise.resolve({ ok: true, json: async () => page([]) });
        if (url.endsWith("/equipment-units/") && init?.method === "POST") {
          registered.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ unit_id: 50 }) });
        }
        if (url.includes("equipment-units/")) {
          return Promise.resolve({ ok: true, json: async () => page([{ unit_id: 1, product: 7, serial_number: "OLD-1", status: "in_stock" }]) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      })
    );
  });

  it("offers one label per received unit across packs and bundles", async () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Print labels — 45 labels for the units just received" })).toBeInTheDocument();
    expect(await screen.findByText("Canalbox decoder × 44")).toBeInTheDocument();
    expect(screen.getByText("Canal TV 43 × 1")).toBeInTheDocument();
  });

  it("offers serial entry only for serialised products", async () => {
    renderDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Scan serials now" }));
    expect(screen.getByLabelText("Serial for Canal TV 43")).toBeInTheDocument();
    expect(screen.queryByLabelText("Serial for Canalbox decoder")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Serial for Canal TV 43"), "TV-SN-1{Enter}");
    await waitFor(() => expect(registered).toHaveLength(1));
    expect(registered[0]).toMatchObject({ product: 7, serial_number: "TV-SN-1" });
    expect(await screen.findByText("TV-SN-1")).toBeInTheDocument();
  });
});
