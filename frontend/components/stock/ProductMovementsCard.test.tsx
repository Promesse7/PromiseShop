import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductMovementsCard } from "./ProductMovementsCard";

function renderCard(showCost = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductMovementsCard productId={9} showCost={showCost} />
    </QueryClientProvider>
  );
}

describe("ProductMovementsCard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            count: 20, next: "x", previous: null,
            results: [
              { movement_id: 2, product: 9, product_name: "Speaker", movement_type: "to_damaged", bucket: "damaged", quantity_delta: 1, balance_after: 1, unit_cost: "50000.00", source_type: "adjustment", source_id: 3, reason: "Dropped", created_by: 1, created_by_name: "Manager One", created_at: "2026-10-06T10:00:00Z" },
            ],
          }),
        })
      )
    );
  });

  it("lists the latest movements and links to the full list", async () => {
    renderCard();
    expect(await screen.findByText("Dropped")).toBeInTheDocument();
    expect(screen.getByText("To damaged")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All 20 movements →" })).toHaveAttribute(
      "href", "/stock/movements?product=9"
    );
  });

  it("asks for the product's movements only", async () => {
    renderCard();
    await screen.findByText("Dropped");
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/proxy/stock/movements/?product=9&page_size=8");
  });

  it("hides cost for staff", async () => {
    renderCard(false);
    await screen.findByText("Dropped");
    expect(screen.queryByText("Unit cost")).not.toBeInTheDocument();
  });

  it("names the product on rows that came from a product merged into this one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            count: 1, next: null, previous: null,
            results: [
              { movement_id: 5, product: 4, product_name: "[merged into Speaker]", movement_type: "merge_out", bucket: "in_stock", quantity_delta: -2, balance_after: 0, unit_cost: null, source_type: "product_merge", source_id: 1, reason: "Merged", created_by: 1, created_by_name: "Admin", created_at: "2026-10-06T10:00:00Z" },
            ],
          }),
        })
      )
    );
    renderCard();
    expect(await screen.findByRole("link", { name: "[merged into Speaker]" })).toHaveAttribute("href", "/products/4");
  });
});

