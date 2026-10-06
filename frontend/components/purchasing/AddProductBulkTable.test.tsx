import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddProductBulkTable } from "./AddProductBulkTable";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { ProductSearchResult } from "@/lib/types";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function hit(overrides: Partial<ProductSearchResult>): ProductSearchResult {
  return {
    product_id: 3, name: "Boya BY-M1 Microphone", brand: null, model_number: null, barcode: "PES-AUD-00121",
    category: 2, category_name: "Audio", is_active: true, in_stock: 4, retail_price: "25000.00",
    match: "exact_name", score: 1, ...overrides,
  };
}

const boya = hit({});
const scales = hit({ product_id: 4, name: "Scales 60kg", barcode: "PES-HOM-00060", category: 3, match: "similar", score: 0.4 });

interface Recorded {
  bulkBodies: Array<{ items: Array<Record<string, unknown>> }>;
}

function setupFetch({
  search = (q: string): ProductSearchResult[] => (q.toLowerCase().includes("boya") ? [boya] : []),
  bulk = (body: { items: Array<Record<string, unknown>> }) => ({
    ok: true,
    status: 201,
    json: async () => ({
      items: body.items.map((row, i) => ({
        purchase_item_id: 100 + i, purchase: 7, product: (row.product as number) ?? 50 + i, quantity: row.quantity,
        price_discrepancy_note: "", product_name: (row.new_product as { name?: string } | undefined)?.name ?? "Boya BY-M1 Microphone",
        product_barcode: `PES-AUD-0090${i}`, product_retail_price: "15.00",
      })),
    }),
  }),
  recent = [] as unknown[],
}: {
  search?: (q: string) => ProductSearchResult[];
  bulk?: (body: { items: Array<Record<string, unknown>> }) => unknown;
  recent?: unknown[];
} = {}): Recorded {
  const recorded: Recorded = { bulkBodies: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url.includes("/products/search/")) {
        const q = new URL(url, "http://x").searchParams.get("q") ?? "";
        return Promise.resolve({ ok: true, json: async () => ({ results: search(q) }) });
      }
      if (url.includes("/categories/")) {
        return Promise.resolve({
          ok: true,
          json: async () => paginated([{ category_id: 2, name: "Audio", code: "AUD", description: null }]),
        });
      }
      if (url.includes("/recent-products/")) {
        return Promise.resolve({ ok: true, json: async () => ({ results: recent }) });
      }
      if (url.includes("/purchases/7/items/bulk/")) {
        const body = JSON.parse(options?.body as string);
        recorded.bulkBodies.push(body);
        return Promise.resolve(bulk(body));
      }
      throw new Error(`Unexpected URL: ${url}`);
    })
  );
  return recorded;
}

function renderTable({ supplierId }: { supplierId?: number } = {}) {
  const onAdded = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddProductBulkTable purchaseId={7} supplierId={supplierId} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded };
}

async function fillNumbers(index: number, quantity: string, paid: string, invoiced: string) {
  await userEvent.type(screen.getAllByLabelText("Quantity")[index], quantity);
  await userEvent.type(screen.getAllByLabelText("Buy price paid")[index], paid);
  await userEvent.type(screen.getAllByLabelText("Buy price invoiced")[index], invoiced);
}

describe("AddProductBulkTable", () => {
  beforeEach(() => {
    Object.assign(window, { print: vi.fn() });
  });

  it("auto-selects an exact name match and saves the row through the bulk endpoint", async () => {
    const recorded = setupFetch();
    const { onAdded } = renderTable();

    await userEvent.type(screen.getByRole("combobox", { name: "Product name" }), "Boya BY-M1 Microphone");
    expect(await screen.findByText("Existing · PES-AUD-00121")).toBeInTheDocument();
    await fillNumbers(0, "2", "18000", "18000");
    await userEvent.click(screen.getByRole("button", { name: "Save 1 row" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(recorded.bulkBodies).toEqual([
      { items: [{ product: 3, quantity: 2, unit_cost_paid: "18000", unit_cost_invoiced: "18000", price_discrepancy_note: "" }] },
    ]);
  });

  it("refuses to save a row with no product chosen, and sends nothing", async () => {
    const recorded = setupFetch({ search: () => [scales] });
    renderTable();

    await userEvent.type(screen.getByRole("combobox", { name: "Product name" }), "scales");
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(0));
    await fillNumbers(0, "1", "10", "10");
    await userEvent.click(screen.getByRole("button", { name: "Save 1 row" }));

    expect(await screen.findByText("Choose a product from the list, or create a new one.")).toBeInTheDocument();
    expect(recorded.bulkBodies).toHaveLength(0);
  });

  it("creates a new product only when chosen explicitly, with category and selling price", async () => {
    const recorded = setupFetch({ search: () => [] });
    renderTable();

    await userEvent.type(screen.getByRole("combobox", { name: "Product name" }), "Earbuds");
    await userEvent.click(await screen.findByRole("option", { name: '+ Create new "Earbuds"' }));
    expect(screen.getByText("New product")).toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText("Category"), "2");
    await userEvent.type(screen.getAllByLabelText("Sell price")[0], "15");
    await fillNumbers(0, "3", "10", "10");
    await userEvent.click(screen.getByRole("button", { name: "Save 1 row" }));

    await waitFor(() => expect(recorded.bulkBodies).toHaveLength(1));
    expect(recorded.bulkBodies[0].items[0]).toEqual({
      new_product: { category: 2, name: "Earbuds", selling_price: "15" },
      quantity: 3, unit_cost_paid: "10", unit_cost_invoiced: "10", price_discrepancy_note: "",
    });
    // labels for the 3 new units
    expect(await screen.findByRole("button", { name: "Print all new labels (3)" })).toBeEnabled();
  });

  it("shows the backend's per-row errors and keeps every row when the save is refused", async () => {
    setupFetch({
      bulk: () => ({
        ok: false,
        status: 400,
        json: async () => ({
          detail: "1 row(s) have errors; nothing was saved.",
          row_errors: { "0": { price_discrepancy_note: ["Required when unit_cost_paid differs."] } },
        }),
      }),
    });
    const { onAdded } = renderTable();

    await userEvent.type(screen.getByRole("combobox", { name: "Product name" }), "Boya BY-M1 Microphone");
    await screen.findByText("Existing · PES-AUD-00121");
    await fillNumbers(0, "1", "5", "5");
    await userEvent.click(screen.getByRole("button", { name: "Save 1 row" }));

    expect(await screen.findByText("price discrepancy note: Required when unit_cost_paid differs.")).toBeInTheDocument();
    expect(screen.getByText("Existing · PES-AUD-00121")).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("moves through qty → paid → invoiced → next row with Enter", async () => {
    setupFetch();
    renderTable();

    await userEvent.type(screen.getByRole("combobox", { name: "Product name" }), "Boya BY-M1 Microphone");
    await screen.findByText("Existing · PES-AUD-00121");
    await waitFor(() => expect(screen.getAllByLabelText("Quantity")[0]).toHaveFocus());
    await userEvent.keyboard("2{Enter}");
    await waitFor(() => expect(screen.getAllByLabelText("Buy price paid")[0]).toHaveFocus());
    await userEvent.keyboard("5{Enter}");
    await waitFor(() => expect(screen.getAllByLabelText("Buy price invoiced")[0]).toHaveFocus());
    await userEvent.keyboard("5{Enter}");
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Product name" })).toHaveFocus());
  });

  it("adds a recent product from the supplier as a row", async () => {
    setupFetch({
      recent: [{ product_id: 9, name: "Kettle", brand: null, model_number: null, barcode: "PES-HOM-00009", last_purchase_date: "2026-09-01", last_quantity: 2 }],
    });
    renderTable({ supplierId: 5 });

    await userEvent.click(await screen.findByRole("button", { name: "Kettle" }));
    expect(screen.getByText("Existing · PES-HOM-00009")).toBeInTheDocument();
  });

  it("pastes rows from Excel, matching them for review before saving", async () => {
    const recorded = setupFetch();
    renderTable();

    await userEvent.click(screen.getByRole("button", { name: "Paste from Excel" }));
    const box = screen.getByLabelText(/Paste rows from Excel/);
    await userEvent.click(box);
    await userEvent.paste("Boya BY-M1 Microphone\t2\t18000\t18000\nMystery thing\t1\t5\t5");
    await userEvent.click(screen.getByRole("button", { name: "Match pasted rows" }));

    expect(await screen.findByText("Existing · PES-AUD-00121")).toBeInTheDocument();
    expect(screen.getByText("Not matched — choose a product or create a new one.")).toBeInTheDocument();
    expect(recorded.bulkBodies).toHaveLength(0);
  });
});
