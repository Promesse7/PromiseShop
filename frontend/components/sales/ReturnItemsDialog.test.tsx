import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReturnItemsDialog } from "./ReturnItemsDialog";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 41, customer: 7, employee: 1, sale_date: "2026-10-06T10:00:00Z", payment_method: null,
  total_amount: "300.00", amount_paid: "100.00", returned_amount: "0.00", balance: "200.00", status: "completed",
  items: [
    { sale_item_id: 11, sale: 41, product: 5, product_name: "Speaker", quantity: 3, unit_price: "100.00", list_price: "100.00", subtotal: "300.00", tax_category: "B", tax_amount: "45.76" },
  ],
  returns: [],
};

function setup() {
  const onSubmit = vi.fn();
  render(<ReturnItemsDialog open sale={sale} onSubmit={onSubmit} onClose={vi.fn()} />);
  return onSubmit;
}

describe("ReturnItemsDialog", () => {
  it("refuses more units than can still be returned", async () => {
    const onSubmit = setup();
    await userEvent.clear(screen.getByLabelText("Units of Speaker to return"));
    await userEvent.type(screen.getByLabelText("Units of Speaker to return"), "4");
    await userEvent.type(screen.getByLabelText("Reason"), "Faulty");
    await userEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(screen.getByText(/only 3 can still be returned/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("on a credit sale, a small refund only reduces the balance and needs no payout method", async () => {
    const onSubmit = setup();
    await userEvent.clear(screen.getByLabelText("Units of Speaker to return"));
    await userEvent.type(screen.getByLabelText("Units of Speaker to return"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Condition of Speaker"), "damaged");
    await userEvent.type(screen.getByLabelText("Reason"), "Cracked");

    expect(screen.getByLabelText("Refund summary")).toHaveTextContent("Pay back nowRWF 0");
    expect(screen.queryByLabelText("Pay back by")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Cracked", refund_method: null, refund_reference: "",
      items: [{ sale_item: 11, quantity: 1, condition: "damaged" }],
    });
  });

  it("asks how to pay back the excess and sends a lowered refund", async () => {
    const onSubmit = setup();
    await userEvent.clear(screen.getByLabelText("Units of Speaker to return"));
    await userEvent.type(screen.getByLabelText("Units of Speaker to return"), "3");
    await userEvent.type(screen.getByLabelText("Refund for Speaker"), "280");
    await userEvent.type(screen.getByLabelText("Reason"), "Changed mind");
    expect(screen.getByLabelText("Refund summary")).toHaveTextContent("Pay back nowRWF 80");

    await userEvent.selectOptions(screen.getByLabelText("Pay back by"), "mobile_money");
    await userEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(screen.getByText(/need a transaction reference/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Transaction reference"), "MP42");
    await userEvent.click(screen.getByRole("button", { name: "Record return" }));
    expect(onSubmit).toHaveBeenCalledWith({
      reason: "Changed mind", refund_method: "mobile_money", refund_reference: "MP42",
      items: [{ sale_item: 11, quantity: 3, condition: "resellable", refund_amount: "280.00" }],
    });
  });
});
