import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartTable } from "./CartTable";
import type { CartLine } from "@/lib/pos/cart";

const line: CartLine = {
  product: {
    product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
    model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
  },
  quantity: 2,
};

describe("CartTable", () => {
  it("shows an empty-cart message with no lines", () => {
    render(<CartTable lines={[]} onSetQuantity={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, barcode, price, quantity, and subtotal", () => {
    render(<CartTable lines={[line]} onSetQuantity={vi.fn()} onRemove={vi.fn()} />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
    expect(screen.getByText("145,000")).toBeInTheDocument();
    expect(screen.getByText("290,000")).toBeInTheDocument();
  });

  it("calls onSetQuantity when the quantity input changes", async () => {
    const onSetQuantity = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />);
    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    await userEvent.type(qtyInput, "5");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 5);
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={vi.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
