import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartCards } from "./CartCards";
import type { CartLine } from "@/lib/pos/cart";

const line: CartLine = {
  product: {
    product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
    model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
  },
  quantity: 2,
};

describe("CartCards", () => {
  it("shows an empty-cart message with no lines", () => {
    render(<CartCards lines={[]} onSetQuantity={vi.fn()} />);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, price, quantity, and subtotal", () => {
    render(<CartCards lines={[line]} onSetQuantity={vi.fn()} />);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("RWF 145,000")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("290,000")).toBeInTheDocument();
  });

  it("calls onSetQuantity with quantity + 1 when + is clicked", async () => {
    const onSetQuantity = vi.fn();
    render(<CartCards lines={[line]} onSetQuantity={onSetQuantity} />);
    await userEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 3);
  });

  it("calls onSetQuantity with quantity - 1 when − is clicked", async () => {
    const onSetQuantity = vi.fn();
    render(<CartCards lines={[line]} onSetQuantity={onSetQuantity} />);
    await userEvent.click(screen.getByRole("button", { name: "−" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 1);
  });
});
