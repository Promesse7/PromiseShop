import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LowStockTable } from "./LowStockTable";
import { setMatchMedia } from "@/lib/test/matchMedia";
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
    has_price: true,
    has_inventory: true,
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

  it("links each row's Reorder action to a prefilled new purchase for that product", () => {
    render(<LowStockTable rows={[makeRow()]} />);
    expect(screen.getByRole("link", { name: "Reorder" })).toHaveAttribute(
      "href",
      "/purchases?open=new&reorder_product=1&reorder_name=JBL%20Flip%206%20Speaker"
    );
  });

  it("links the product name to its page", () => {
    render(<LowStockTable rows={[makeRow()]} />);
    expect(screen.getByRole("link", { name: "JBL Flip 6 Speaker" })).toHaveAttribute("href", "/products/1");
  });

  it("is a list of cards on phone, keeping the Reorder link", () => {
    setMatchMedia({ desktop: false });
    render(<LowStockTable rows={[makeRow(), makeRow({ product_id: 2, name: "Boya Mic", quantity_in_stock: 0 })]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Low stock" }).querySelectorAll(":scope > li")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Reorder" })).toHaveLength(2);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });
});
