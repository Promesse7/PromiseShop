import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

function renderDialog(onSubmit = vi.fn()) {
  render(
    <RecordPaymentDialog open title="Record payment" subject="Aline" maxAmount={50000} onSubmit={onSubmit} onClose={vi.fn()} />
  );
  return onSubmit;
}

describe("RecordPaymentDialog", () => {
  it("starts at the full balance and records a cash payment", async () => {
    const onSubmit = renderDialog();
    expect(screen.getByLabelText("Amount (RWF)")).toHaveValue(50000);
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(onSubmit).toHaveBeenCalledWith({ amount: "50000.00", method: "cash", reference: "", note: "" });
  });

  it("refuses more than is owed", async () => {
    const onSubmit = renderDialog();
    await userEvent.clear(screen.getByLabelText("Amount (RWF)"));
    await userEvent.type(screen.getByLabelText("Amount (RWF)"), "60000");
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(screen.getByText(/more than is owed/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("needs a reference for MoMo", async () => {
    const onSubmit = renderDialog();
    await userEvent.selectOptions(screen.getByLabelText("Method"), "mobile_money");
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(screen.getByText(/need a transaction reference/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Transaction reference"), "MP42");
    await userEvent.click(screen.getByRole("button", { name: "Record payment" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ method: "mobile_money", reference: "MP42" }));
  });
});
