import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllPages, extractErrorMessage } from "./api-client";

describe("fetchAllPages", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("asks for large pages and returns all results when the response fits on one page", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 2, next: null, previous: null, results: [{ id: 1 }, { id: 2 }] }),
    });

    const results = await fetchAllPages<{ id: number }>("products/");

    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/products/?page=1&page_size=200",
      expect.anything()
    );
  });

  it("fetches the remaining pages in parallel after the first, keeping page order", async () => {
    const page = (n: number, results: { id: number }[], next: string | null) => ({
      ok: true,
      json: async () => ({ count: 450, next, previous: null, results, page: n }),
    });
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    const resolvers: Record<string, () => void> = {};
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("page=1&")) return Promise.resolve(page(1, [{ id: 1 }], "http://backend:8000/api/products/?page=2&page_size=200"));
      // Pages 2 and 3 resolve only when released, page 3 first — the results must still
      // come back in page order.
      return new Promise((resolve) => {
        resolvers[url] = () =>
          resolve(url.includes("page=2") ? page(2, [{ id: 2 }], "…") : page(3, [{ id: 3 }], null));
      });
    });

    const pending = fetchAllPages<{ id: number }>("products/");
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
    expect(mockFetch).toHaveBeenCalledWith("/api/proxy/products/?page=2&page_size=200", expect.anything());
    expect(mockFetch).toHaveBeenCalledWith("/api/proxy/products/?page=3&page_size=200", expect.anything());

    resolvers["/api/proxy/products/?page=3&page_size=200"]();
    resolvers["/api/proxy/products/?page=2&page_size=200"]();

    expect(await pending).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("appends page params after an existing query string", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 1, next: null, previous: null, results: [{ id: 1 }] }),
    });

    await fetchAllPages<{ id: number }>("product-pricing/?is_current=true");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/product-pricing/?is_current=true&page=1&page_size=200",
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
