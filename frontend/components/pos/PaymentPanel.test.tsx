import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PaymentPanel } from "./PaymentPanel";
import { newPaymentLine, type PaymentLine } from "@/lib/pos/payments";

function Harness({ total, initial, hasCustomer = false }: { total: number; initial: PaymentLine[]; hasCustomer?: boolean }) {
  const [lines, setLines] = useState(initial);
  const [due, setDue] = useState("2026-11-05");
  return (
    <PaymentPanel total={total} lines={lines} onChange={setLines} dueDate={due} onDueDateChange={setDue} hasCustomer={hasCustomer} />
  );
}

describe("PaymentPanel", () => {
  it("shows change for cash tendered above the amount", async () => {
    render(<Harness total={100000} initial={[newPaymentLine("cash", 100000)]} />);
    await userEvent.type(screen.getByLabelText("Payment 1 tendered"), "120000");
    expect(screen.getByText("Change").nextSibling).toHaveTextContent("RWF 20,000");
  });

  it("splits a payment and asks for a reference on MoMo", async () => {
    render(<Harness total={100000} initial={[newPaymentLine("cash", 60000)]} />);
    await userEvent.click(screen.getByRole("button", { name: "+ Split payment" }));
    expect(screen.getByLabelText("Payment 2 method")).toHaveValue("mobile_money");
    expect(screen.getByLabelText("Payment 2 amount")).toHaveValue(40000);
    expect(screen.getByText(/need a transaction reference/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Payment 2 reference"), "MP123");
    expect(screen.queryByText(/need a transaction reference/)).not.toBeInTheDocument();
  });

  it("shows the remaining credit, a due date, and asks for a customer", () => {
    render(<Harness total={100000} initial={[newPaymentLine("cash", 30000)]} />);
    expect(screen.getByText("Remaining on credit").nextSibling).toHaveTextContent("RWF 70,000");
    expect(screen.getByLabelText("Credit due date")).toHaveValue("2026-11-05");
    expect(screen.getByText(/Choose a customer/)).toBeInTheDocument();
  });

  it("does not ask for a customer once one is chosen", () => {
    render(<Harness total={100000} initial={[newPaymentLine("cash", 30000)]} hasCustomer />);
    expect(screen.queryByText(/Choose a customer/)).not.toBeInTheDocument();
  });
});
