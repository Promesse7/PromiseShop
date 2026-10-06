import { fireEvent, render, screen } from "@testing-library/react";
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
  unitPrice: 145000,
};

function renderTable(lines: CartLine[], handlers: Partial<{ onSetQuantity: () => void; onSetUnitPrice: () => void; onRemove: () => void }> = {}) {
  return render(
    <CartTable
      lines={lines}
      onSetQuantity={handlers.onSetQuantity ?? vi.fn()}
      onSetUnitPrice={handlers.onSetUnitPrice ?? vi.fn()}
      onRemove={handlers.onRemove ?? vi.fn()}
    />
  );
}

describe("CartTable", () => {
  it("scrolls a long cart inside its card, with the header pinned", () => {
    renderTable([line]);
    const area = screen.getByRole("table").closest("[data-at-start]") as HTMLElement | null;
    expect(area).not.toBeNull();
    expect(area?.style.maxHeight).toBe("55vh");
    for (const header of screen.getAllByRole("columnheader")) expect(header.className).toContain("sticky");
  });

  it("shows an empty-cart message with no lines", () => {
    renderTable([]);
    expect(screen.getByText("No items scanned yet")).toBeInTheDocument();
  });

  it("renders product name, barcode, an editable price, quantity, and subtotal", () => {
    renderTable([line]);
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
    expect(screen.getByText("PES-AUD-00147")).toBeInTheDocument();
    expect(screen.getByLabelText("Unit price")).toHaveValue(145000);
    expect(screen.getByText("RWF 290,000")).toBeInTheDocument();
  });

  it("calls onSetUnitPrice when the price input changes", () => {
    const onSetUnitPrice = vi.fn();
    renderTable([line], { onSetUnitPrice });
    // The input is controlled by the line's price, so a single change event with the
    // whole value is how a keyed-in price reaches the handler.
    fireEvent.change(screen.getByLabelText("Unit price"), { target: { value: "120000" } });
    expect(onSetUnitPrice).toHaveBeenCalledWith(1, 120000);
  });

  it("does not call onSetUnitPrice when the price input is cleared", async () => {
    const onSetUnitPrice = vi.fn();
    renderTable([line], { onSetUnitPrice });
    await userEvent.clear(screen.getByLabelText("Unit price"));
    expect(onSetUnitPrice).not.toHaveBeenCalled();
  });

  it("shows the catalog price beside a line whose price was changed", () => {
    renderTable([{ ...line, unitPrice: 120000 }]);
    expect(screen.getByText(/list RWF 145,000/)).toBeInTheDocument();
    expect(screen.getByText("RWF 240,000")).toBeInTheDocument();
  });

  it("does not show a catalog-price hint when the price is unchanged", () => {
    renderTable([line]);
    expect(screen.queryByText(/list RWF 145,000/)).not.toBeInTheDocument();
  });

  it("calls onSetQuantity when the quantity input changes", async () => {
    const onSetQuantity = vi.fn();
    renderTable([line], { onSetQuantity });
    const qtyInput = screen.getByLabelText("Quantity") as HTMLInputElement;
    qtyInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("5");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 5);
  });

  it("calls onRemove when Remove is clicked", async () => {
    const onRemove = vi.fn();
    renderTable([line], { onRemove });
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("calls onSetQuantity with 0 when quantity input is set to 0", async () => {
    const onSetQuantity = vi.fn();
    renderTable([line], { onSetQuantity });
    const qtyInput = screen.getByLabelText("Quantity") as HTMLInputElement;
    qtyInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("0");
    expect(onSetQuantity).toHaveBeenCalledWith(1, 0);
  });

  it("does not call onSetQuantity or remove the row when the quantity input is cleared", async () => {
    const onSetQuantity = vi.fn();
    renderTable([line], { onSetQuantity });
    await userEvent.clear(screen.getByLabelText("Quantity"));
    expect(onSetQuantity).not.toHaveBeenCalled();
    expect(screen.getByText("JBL Flip 6 Speaker")).toBeInTheDocument();
  });

  it("updates the quantity input value when the lines prop changes", () => {
    const { rerender } = renderTable([line]);
    expect(screen.getByLabelText("Quantity")).toHaveValue(2);

    rerender(
      <CartTable lines={[{ ...line, quantity: 5 }]} onSetQuantity={vi.fn()} onSetUnitPrice={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getByLabelText("Quantity")).toHaveValue(5);
  });
});
