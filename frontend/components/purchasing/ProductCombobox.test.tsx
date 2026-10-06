import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProductCombobox } from "./ProductCombobox";
import type { ProductSearchResult } from "@/lib/types";

function hit(overrides: Partial<ProductSearchResult>): ProductSearchResult {
  return {
    product_id: 1, name: "JBL Flip 6", brand: "JBL", model_number: "", barcode: "PES-AUD-00001",
    category: 1, category_name: "Audio", is_active: true, in_stock: 3, retail_price: "145000.00",
    match: "similar", score: 0.4, ...overrides,
  };
}

let searchResults: ProductSearchResult[] = [];

function Harness({ onPick, onCreateNew }: { onPick: (p: ProductSearchResult) => void; onCreateNew: (n: string) => void }) {
  const [text, setText] = useState("");
  return <ProductCombobox value={text} onChange={setText} onPick={onPick} onCreateNew={onCreateNew} />;
}

function renderBox() {
  const onPick = vi.fn();
  const onCreateNew = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Harness onPick={onPick} onCreateNew={onCreateNew} />
    </QueryClientProvider>
  );
  return { onPick, onCreateNew, input: screen.getByRole("combobox", { name: "Product" }) };
}

describe("ProductCombobox", () => {
  beforeEach(() => {
    searchResults = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        expect(url).toContain("/api/proxy/products/search/?q=");
        return Promise.resolve({ ok: true, json: async () => ({ results: searchResults }) });
      })
    );
  });

  it("auto-selects an exact barcode hit", async () => {
    searchResults = [hit({ match: "barcode", score: 1 })];
    const { input, onPick } = renderBox();
    await userEvent.type(input, "PES-AUD-00001");
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ product_id: 1 })));
  });

  it("lists fuzzy matches with Create new last, and never auto-selects them", async () => {
    searchResults = [hit({ product_id: 1, name: "JBL Flip 6" }), hit({ product_id: 2, name: "JBL Flip 5", barcode: "PES-AUD-00002" })];
    const { input, onPick } = renderBox();
    await userEvent.type(input, "flip");
    const options = await screen.findAllByRole("option");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    expect(screen.getAllByRole("option")[2]).toHaveTextContent('+ Create new "flip"');
    expect(options.length).toBeGreaterThan(0);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("picks the highlighted match on Enter", async () => {
    searchResults = [hit({ product_id: 1 }), hit({ product_id: 2, name: "JBL Flip 5", barcode: "PES-AUD-00002" })];
    const { input, onPick } = renderBox();
    await userEvent.type(input, "flip");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(3));
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ product_id: 2 }));
  });

  it("creates new straight away when nothing is close", async () => {
    searchResults = [hit({ score: 0.35 })];
    const { input, onCreateNew } = renderBox();
    await userEvent.type(input, "Earbuds");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getByRole("option", { name: '+ Create new "Earbuds"' }));
    expect(onCreateNew).toHaveBeenCalledWith("Earbuds");
  });

  it("asks Did you mean…? before creating a near-duplicate", async () => {
    searchResults = [hit({ name: "JBL Flip 6", score: 0.8 })];
    const { input, onCreateNew, onPick } = renderBox();
    await userEvent.type(input, "JBL Flip6");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getByRole("option", { name: '+ Create new "JBL Flip6"' }));

    expect(onCreateNew).not.toHaveBeenCalled();
    expect(screen.getByText("Did you mean…?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /JBL Flip 6/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ product_id: 1 }));
  });

  it("still lets the user create after Did you mean…?", async () => {
    searchResults = [hit({ score: 0.8 })];
    const { input, onCreateNew } = renderBox();
    await userEvent.type(input, "JBL Flip6");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    await userEvent.click(screen.getByRole("option", { name: '+ Create new "JBL Flip6"' }));
    await userEvent.click(screen.getByRole("button", { name: 'No, create new "JBL Flip6"' }));
    expect(onCreateNew).toHaveBeenCalledWith("JBL Flip6");
  });
});
