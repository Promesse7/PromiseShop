import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProductCardGrid } from "./ProductCardGrid";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const products: CatalogProduct[] = [
  { product_id: 1, name: "Samsung TV", brand: "Samsung", model_number: "UA43DU7000", barcode: "PES-TV-00082", category_id: 10, category_name: "Televisions", retail_price: 385000, wholesale_price: 318000, quantity_in_stock: 12, reorder_level: 5, status: "ok", is_active: true, has_price: true, has_inventory: true },
  { product_id: 2, name: "JBL Flip 6", brand: "JBL", model_number: "JBLFLIP6BLK", barcode: "PES-AUD-00147", category_id: 20, category_name: "Audio", retail_price: 145000, wholesale_price: 112000, quantity_in_stock: 2, reorder_level: 4, status: "low_stock", is_active: true, has_price: true, has_inventory: true },
];

describe("ProductCardGrid", () => {
  it("renders a card per product with name, category, and status tag", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.getByText("Samsung TV")).toBeInTheDocument();
    expect(screen.getByText("Televisions")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
  });

  it("shows wholesale price only when showWholesale is true", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.queryByText(/wholesale/)).not.toBeInTheDocument();
  });

  it("shows wholesale price when showWholesale is true", () => {
    render(<ProductCardGrid products={products} showWholesale />);
    expect(screen.getAllByText(/wholesale/).length).toBeGreaterThan(0);
  });

  it("links each card to its product detail page", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.getByRole("link", { name: "Samsung TV" })).toHaveAttribute("href", "/products/1");
    expect(screen.getByRole("link", { name: "JBL Flip 6" })).toHaveAttribute("href", "/products/2");
  });

  it("shows the retail price in RWF", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.getByText("RWF 385,000")).toBeInTheDocument();
  });

  it("shows an empty state when there are no products", () => {
    render(<ProductCardGrid products={[]} showWholesale={false} />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
  });

  it("renders a select checkbox and calls onToggleSelect when provided", async () => {
    const onToggleSelect = vi.fn();
    render(
      <ProductCardGrid
        products={products}
        showWholesale={false}
        selectedIds={new Set()}
        onToggleSelect={onToggleSelect}
      />
    );
    await userEvent.click(screen.getByLabelText("Select Samsung TV"));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it("renders a Print label action and calls onPrintLabel with the product when provided", async () => {
    const onPrintLabel = vi.fn();
    render(<ProductCardGrid products={products} showWholesale={false} onPrintLabel={onPrintLabel} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Print label" })[0]);
    expect(onPrintLabel).toHaveBeenCalledWith(products[0]);
  });

  it("does not render selection or print-label controls when their handlers are omitted", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print label" })).not.toBeInTheDocument();
  });

  it("shows an Inactive tag for a product with is_active false", () => {
    const inactiveProducts = [{ ...products[0], is_active: false }, products[1]];
    render(<ProductCardGrid products={inactiveProducts} showWholesale={false} />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("does not show an Inactive tag for an active product", () => {
    render(<ProductCardGrid products={products} showWholesale={false} />);
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("flags a product with no selling price instead of showing zero", () => {
    render(<ProductCardGrid products={[{ ...products[0], retail_price: 0, has_price: false }]} showWholesale={false} />);
    expect(screen.getByText("Needs price")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("says 'Not yet received' rather than 'Out of stock' for a product never received", () => {
    render(
      <ProductCardGrid
        products={[{ ...products[0], quantity_in_stock: 0, status: "out_of_stock", has_inventory: false }]}
        showWholesale={false}
      />
    );
    expect(screen.getByText("Not yet received")).toBeInTheDocument();
    expect(screen.queryByText("Out of stock")).not.toBeInTheDocument();
  });
});
