import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AddProductBulkTable } from "./AddProductBulkTable";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const boya = { product_id: 3, category: 2, barcode: "PES-AUD-00121", name: "Boya BY-M1 Microphone", brand: null, model_number: null, description: null, specifications: null, usage_instructions: null, warranty_months: null, reorder_level: 5, unit: "pcs", is_active: true, created_at: "2026-01-01" };
const scales60 = { ...boya, product_id: 4, category: 3, barcode: "PES-HOM-00060", name: "Scales 60kg" };
const scales300 = { ...boya, product_id: 5, category: 3, barcode: "PES-HOM-00300", name: "Scales 300kg" };

function renderTable(onAdded = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AddProductBulkTable purchaseId={7} onAdded={onAdded} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onAdded, invalidateSpy };
}

async function fillRow(index: number, quantity: string, paid: string, invoiced: string) {
  await userEvent.type(screen.getAllByLabelText("Quantity")[index], quantity);
  await userEvent.type(screen.getAllByLabelText("Buy price paid")[index], paid);
  await userEvent.type(screen.getAllByLabelText("Buy price invoiced")[index], invoiced);
}

describe("AddProductBulkTable", () => {
  let itemPosts: unknown[];
  let productsResponse: () => Promise<unknown>;

  beforeEach(() => {
    itemPosts = [];
    productsResponse = () => Promise.resolve({ ok: true, json: async () => paginated([boya, scales60, scales300]) });
    Object.assign(window, { print: vi.fn() });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/")) {
          return productsResponse();
        }
        if (url.includes("/categories/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 2, name: "Audio", code: "AUD", description: null }, { category_id: 3, name: "Home", code: "HOM", description: null }]) });
        }
        if (url.includes("/purchases/7/items/")) {
          const body = options?.body ? JSON.parse(options.body as string) : null;
          itemPosts.push(body);
          if (typeof body?.product === "number") {
            return Promise.resolve({ ok: true, json: async () => ({ purchase_item_id: 1, purchase: 7, product: body.product, quantity: body.quantity, unit_cost_paid: body.unit_cost_paid, unit_cost_invoiced: body.unit_cost_invoiced, price_discrepancy_note: "", subtotal_paid: "0", subtotal_invoiced: "0" }) });
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

  it("locks a row to an existing product when its full name is typed, disabling selling price", async () => {
    renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    expect(await screen.findByText(/Existing · PES-AUD-00121/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Sell price")[0]).toBeDisabled();
  });

  it("locks a row to an existing product when its barcode is typed", async () => {
    renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "pes-hom-00060");
    expect(await screen.findByText(/Existing · PES-HOM-00060/)).toBeInTheDocument();
  });

  it("lists every catalog match for a partial name and locks the row to the one picked", async () => {
    const { onAdded } = renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "sc");

    expect(await screen.findByRole("button", { name: /Scales 60kg/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scales 300kg/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Scales 300kg/ }));
    expect(screen.getAllByLabelText("Product name")[0]).toHaveValue("Scales 300kg");
    expect(screen.getByText(/Existing · PES-HOM-00300/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Scales 60kg/ })).not.toBeInTheDocument();

    await fillRow(0, "3", "9000", "9000");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(itemPosts).toEqual([{ product: 5, quantity: 3, unit_cost_paid: "9000", unit_cost_invoiced: "9000", price_discrepancy_note: "" }]);
  });

  it("treats an unmatched name as a new product and keeps category and selling price editable", async () => {
    renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Brand new thing");
    expect(await screen.findByText("New product")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Category")[0]).toBeInTheDocument();
    expect(screen.getAllByLabelText("Sell price")[0]).toBeEnabled();
  });

  it("shows a loading state and holds submit until the catalog has loaded", async () => {
    productsResponse = () => new Promise(() => {});
    renderTable();
    expect(await screen.findByText("Loading catalog…")).toBeInTheDocument();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    expect(screen.getByRole("button", { name: "Add all rows" })).toBeDisabled();
    expect(screen.queryByText("New product")).not.toBeInTheDocument();
  });

  it("submits matched rows as existing-product items and calls onAdded", async () => {
    const { onAdded } = renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    await screen.findByText(/PES-AUD-00121/);
    await fillRow(0, "20", "11500", "11500");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(itemPosts).toEqual([{ product: 3, quantity: 20, unit_cost_paid: "11500", unit_cost_invoiced: "11500", price_discrepancy_note: "" }]);
  });

  it("refreshes the product and purchase caches once after the batch, not once per row", async () => {
    const { onAdded, invalidateSpy } = renderTable();
    await userEvent.type(screen.getAllByLabelText("Product name")[0], "Boya BY-M1 Microphone");
    await screen.findByText(/PES-AUD-00121/);
    await fillRow(0, "1", "100", "100");
    await userEvent.type(screen.getAllByLabelText("Product name")[1], "Scales 60kg");
    await screen.findByText(/PES-HOM-00060/);
    await fillRow(1, "2", "200", "200");
    await userEvent.click(screen.getByRole("button", { name: "Add all rows" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(itemPosts).toHaveLength(2);
    const productInvalidations = invalidateSpy.mock.calls.filter(
      (c) => JSON.stringify((c[0] as { queryKey: unknown[] }).queryKey) === JSON.stringify(["products"])
    );
    expect(productInvalidations).toHaveLength(1);
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
    await fillRow(0, "20", "10000", "11500");
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
