import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LowStockTable } from "./LowStockTable";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

function makeRow(overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    product_id: 1,
    name: "JBL Flip 6 Speaker",
    brand: "JBL",
    model_number: "FLIP6",
    barcode: "PES-1",
    category_id: 1,
    category_name: "Audio",
    retail_price: 145000,
    wholesale_price: null,
    quantity_in_stock: 2,
    reorder_level: 4,
    status: "low_stock",
    is_active: true,
    ...overrides,
  };
}

describe("LowStockTable", () => {
  it("renders a row per low/out-of-stock product", () => {
    render(<LowStockTable rows={[makeRow()]} />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows an empty message when nothing is low on stock", () => {
    render(<LowStockTable rows={[]} />);
    expect(screen.getByText("Nothing low on stock")).toBeInTheDocument();
  });
});
