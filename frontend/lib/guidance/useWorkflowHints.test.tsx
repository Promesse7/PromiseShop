import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useWorkflowHints } from "./useWorkflowHints";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useWorkflowHints", () => {
  it("derives hints from the catalog and purchases already loaded by the app", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/products/")) {
          return Promise.resolve({ ok: true, json: async () => paginated([
            { product_id: 1, category: 10, barcode: "PES-TV-1", name: "Samsung TV", brand: null, model_number: null, reorder_level: 5, is_active: true },
            { product_id: 2, category: 10, barcode: "PES-TV-2", name: "Unpriced TV", brand: null, model_number: null, reorder_level: 5, is_active: true },
          ]) });
        }
        if (url.includes("/categories/")) return Promise.resolve({ ok: true, json: async () => paginated([{ category_id: 10, name: "Televisions", code: "TV" }]) });
        if (url.includes("/product-pricing/")) return Promise.resolve({ ok: true, json: async () => paginated([{ price_id: 1, product: 1, retail_price: "385000.00", effective_date: "2026-01-01", is_current: true }]) });
        if (url.includes("/inventory/")) return Promise.resolve({ ok: true, json: async () => paginated([{ inventory_id: 1, product: 1, quantity_in_stock: 3, quantity_in_use: 0, quantity_damaged: 0 }]) });
        if (url.includes("/suppliers/")) return Promise.resolve({ ok: true, json: async () => paginated([{ supplier_id: 1, name: "Kigali Electronics" }]) });
        if (url.includes("/purchases/")) return Promise.resolve({ ok: true, json: async () => paginated([
          { purchase_id: 1, supplier: 1, employee: 1, invoice_number: null, purchase_date: "2026-08-01", payment_status: "paid", status: "received", items: [] },
          { purchase_id: 2, supplier: 1, employee: 1, invoice_number: null, purchase_date: "2026-09-01", payment_status: "unpaid", status: "draft", items: [] },
        ]) });
        throw new Error(`Unexpected URL: ${url}`);
      })
    );

    const { result } = renderHook(() => useWorkflowHints(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const keys = result.current.hints.map((h) => h.key);
    expect(keys).toContain("needs-price");
    expect(keys).toContain("draft-purchases");
    expect(keys).toContain("never-received");
    expect(result.current.hints.find((h) => h.key === "needs-price")?.label).toBe("1 product needs a selling price");
  });
});
