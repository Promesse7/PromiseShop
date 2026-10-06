import { fireEvent, render, screen } from "@testing-library/react";
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
  unitPrice: 145000,
};

function renderCards(lines: CartLine[], handlers: Partial<{ onSetQuantity: () => void; onSetUnitPrice: () => void }> = {}) {
  return render(
    <CartCards
      lines={lines}
      onSetQuantity={handlers.onSetQuantity ?? vi.fn()}
      onSetUnitPrice={handlers.onSetUnitPrice ?? vi.fn()}
    />
  );
}

describe("CartCards", () => {
  it("shows an empty-cart message with no lines", () => {
    renderCards([]);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, an editable price, quantity, and subtotal", () => {
    renderCards([line]);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit price")).toHaveValue(145000);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("RWF 290,000")).toBeInTheDocument();
  });

  it("calls onSetUnitPrice when the price input changes", () => {
    const onSetUnitPrice = vi.fn();
    renderCards([line], { onSetUnitPrice });
    // The input is controlled by the line's price, so a single change event with the
    // whole value is how a keyed-in price reaches the handler.
    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "120000" } });
    expect(onSetUnitPrice).toHaveBeenCalledWith(1, 120000);
  });

  it("shows the catalog price beside a line whose price was changed", () => {
    renderCards([{ ...line, unitPrice: 120000 }]);
    expect(screen.getByText(/list RWF 145,000/)).toBeInTheDocument();
  });

  it("calls onSetQuantity with quantity + 1 when + is clicked", async () => {
    const onSetQuantity = vi.fn();
    renderCards([line], { onSetQuantity });
    await userEvent.click(screen.getByRole("button", { name: "+" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 3);
  });

  it("calls onSetQuantity with quantity - 1 when − is clicked", async () => {
    const onSetQuantity = vi.fn();
    renderCards([line], { onSetQuantity });
    await userEvent.click(screen.getByRole("button", { name: "−" }));
    expect(onSetQuantity).toHaveBeenCalledWith(1, 1);
  });
});
