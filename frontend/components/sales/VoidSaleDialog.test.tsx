import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VoidSaleDialog } from "./VoidSaleDialog";
import type { Sale } from "@/lib/types";

const sale: Sale = {
  sale_id: 9, customer: null, employee: 1, sale_date: "2026-10-06T10:00:00Z", payment_method: "cash",
  total_amount: "500.00", amount_paid: "500.00", status: "completed", items: [],
};

describe("VoidSaleDialog", () => {
  it("needs a reason, then sends it", async () => {
    const onSubmit = vi.fn();
    render(<VoidSaleDialog open sale={sale} onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(screen.getByText(/RWF 500 to hand back/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Void sale" }));
    expect(screen.getByText("Say why the sale is being voided.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Reason"), "Rang up twice");
    await userEvent.click(screen.getByRole("button", { name: "Void sale" }));
    expect(onSubmit).toHaveBeenCalledWith("Rang up twice");
  });
});
