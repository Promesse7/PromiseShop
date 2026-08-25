import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllPages, extractErrorMessage } from "./api-client";

describe("fetchAllPages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns all results when the response fits on one page", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 2, next: null, previous: null, results: [{ id: 1 }, { id: 2 }] }),
    });

    const results = await fetchAllPages<{ id: number }>("products/");

    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/?page=1",
      expect.anything()
    );
  });

  it("follows next pages until next is null", async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 3, next: "http://backend:8000/api/products/?page=2", previous: null,
        results: [{ id: 1 }, { id: 2 }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 3, next: null, previous: null, results: [{ id: 3 }] }),
    });

    const results = await fetchAllPages<{ id: number }>("products/");

    expect(results).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/proxy/products/?page=2", expect.anything());
  });

  it("appends page as an additional query param when the path already has one", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 1, next: null, previous: null, results: [{ id: 1 }] }),
    });

    await fetchAllPages<{ id: number }>("product-pricing/?is_current=true");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/product-pricing/?is_current=true&page=1",
      expect.anything()
    );
  });
});

describe("extractErrorMessage", () => {
  it("returns a string detail directly", () => {
    expect(extractErrorMessage({ detail: "Insufficient stock." })).toBe("Insufficient stock.");
  });

  it("joins an array detail into one string", () => {
    expect(extractErrorMessage({ detail: ["Insufficient stock.", "Try again."] })).toBe(
      "Insufficient stock. Try again."
    );
  });

  it("flattens a nested field-error object detail", () => {
    expect(
      extractErrorMessage({ detail: { items: ["At least one line item is required."] } })
    ).toBe("At least one line item is required.");
  });

  it("falls back to a generic message when body has no detail", () => {
    expect(extractErrorMessage(null)).toBe("Something went wrong — try again.");
    expect(extractErrorMessage({})).toBe("Something went wrong — try again.");
  });
});
