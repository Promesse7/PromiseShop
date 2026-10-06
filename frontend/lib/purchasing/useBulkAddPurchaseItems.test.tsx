import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-client";
import { bulkRowErrors, describeRowError, useBulkAddPurchaseItems } from "./useBulkAddPurchaseItems";
import { useUpdatePurchaseItem } from "./useUpdatePurchaseItem";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

describe("useBulkAddPurchaseItems", () => {
  it("POSTs every row in one request and refreshes the purchase", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toBe("/api/proxy/purchases/7/items/bulk/");
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({
        items: [{ product: 1, quantity: 2, unit_cost_paid: "5", unit_cost_invoiced: "5", price_discrepancy_note: "" }],
      });
      return Promise.resolve({ ok: true, json: async () => ({ items: [] }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useBulkAddPurchaseItems(), { wrapper });

    result.current.mutate({
      purchaseId: 7,
      rows: [{ product: 1, quantity: 2, unit_cost_paid: "5", unit_cost_invoiced: "5", price_discrepancy_note: "" }],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["purchases", 7]);
  });
});

describe("bulkRowErrors / describeRowError", () => {
  it("reads row_errors from a 400 and ignores other errors", () => {
    const err = new ApiError(400, { detail: "1 row(s)", row_errors: { "2": { quantity: ["Too small."] } } });
    expect(bulkRowErrors(err)).toEqual({ "2": { quantity: ["Too small."] } });
    expect(bulkRowErrors(new ApiError(500, null))).toBeNull();
    expect(bulkRowErrors(new Error("x"))).toBeNull();
  });

  it("flattens DRF errors into a sentence", () => {
    expect(describeRowError({ price_discrepancy_note: ["Required."] })).toBe("price discrepancy note: Required.");
    expect(describeRowError({ new_product: { category: ["This field is required."] } })).toBe(
      "new product: category: This field is required."
    );
    expect(describeRowError({ non_field_errors: ["Nope."] })).toBe("Nope.");
  });
});

describe("useUpdatePurchaseItem", () => {
  it("PATCHes the line", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toBe("/api/proxy/purchases/7/items/3/");
      expect(options.method).toBe("PATCH");
      expect(JSON.parse(options.body as string)).toEqual({ quantity: 4 });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdatePurchaseItem(), { wrapper });

    result.current.mutate({ purchaseId: 7, itemId: 3, changes: { quantity: 4 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
