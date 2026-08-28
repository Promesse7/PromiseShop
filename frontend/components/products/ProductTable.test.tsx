import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductTable } from "./ProductTable";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const products: CatalogProduct[] = [
  {
    product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000",
    barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions",
    retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12,
    reorder_level: 5, status: "ok", is_active: true,
  },
  {
    product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK",
    barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio",
    retail_price: 145000, wholesale_price: null, quantity_in_stock: 2,
    reorder_level: 4, status: "low_stock", is_active: true,
  },
];

describe("ProductTable", () => {
  it("shows an empty-state message with no products", () => {
    render(<ProductTable products={[]} showWholesale={false} />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });

  it("renders product name, category, barcode, retail price, stock, and status", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("Televisions")).toBeInTheDocument();
    expect(screen.getByText("PES-TV-00082")).toBeInTheDocument();
    expect(screen.getByText("385,000")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });

  it("hides the Wholesale column when showWholesale is false", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.queryByRole("columnheader", { name: "Wholesale" })).not.toBeInTheDocument();
    expect(screen.queryByText("318,000")).not.toBeInTheDocument();
  });

  it("shows the Wholesale column with a dash for a missing price when showWholesale is true", () => {
    render(<ProductTable products={products} showWholesale={true} />);
    expect(screen.getByRole("columnheader", { name: "Wholesale" })).toBeInTheDocument();
    expect(screen.getByText("318,000")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("links each row to its product detail page", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/products/1");
  });

  it("shows an Inactive tag for a product with is_active false", () => {
    const inactiveProducts = [{ ...products[0], is_active: false }, products[1]];
    render(<ProductTable products={inactiveProducts} showWholesale={false} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("does not show an Inactive tag for an active product", () => {
    render(<ProductTable products={products} showWholesale={false} />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });
});
