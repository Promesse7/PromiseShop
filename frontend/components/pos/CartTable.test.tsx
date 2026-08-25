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
    const qtyInput = screen.getByDisplayValue("2") as HTMLInputElement;
    qtyInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("5");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 5);
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={vi.fn()} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("calls onSetQuantity with 0 when quantity input is set to 0", async () => {
    const onSetQuantity = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />);
    const qtyInput = screen.getByDisplayValue("2") as HTMLInputElement;
    qtyInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("0");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 0);
  });

  it("does not call onSetQuantity or remove the row when the quantity input is cleared", async () => {
    const onSetQuantity = vi.fn();
    render(<CartTable lines={[line]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />);
    const qtyInput = screen.getByDisplayValue("2");
    await userEvent.clear(qtyInput);
    expect(onSetQuantity).not.toHaveBeenCalled();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("updates the quantity input value when the lines prop changes", () => {
    const onSetQuantity = vi.fn();
    const { rerender } = render(
      <CartTable lines={[line]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />
    );
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();

    const updatedLine: CartLine = {
      ...line,
      quantity: 5,
    };
    rerender(<CartTable lines={[updatedLine]} onSetQuantity={onSetQuantity} onRemove={vi.fn()} />);
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
  });
});
