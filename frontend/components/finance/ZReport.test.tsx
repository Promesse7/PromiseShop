import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZReport } from "./ZReport";
import type { DailyClose, DayFigures } from "@/lib/types";

const empty = { in: "0.00", out: "0.00", net: "0.00", references: [] };
const figures: DayFigures = {
  cashier: 3, cashier_name: "Staff One", business_date: "2026-10-06", opening_float: "5000.00",
  expected_cash: "5300.00",
  by_method: {
    cash: { in: "390.00", out: "90.00", net: "300.00", references: [] },
    mobile_money: { in: "100.00", out: "0.00", net: "100.00", references: [{ payment_id: 4, sale_id: 12, reference: "MP9", amount: "100.00" }] },
    card: empty, bank_transfer: empty,
  },
  sales_count: 2, sales_total: "400.00", voided_count: 1, discounts_given: "10.00", returns_count: 1,
  returns_refunded: "90.00", returns_paid_out: "90.00", debt_collected: "100.00", new_credit: "0.00",
  already_closed: false,
};

describe("ZReport", () => {
  it("shows the day's figures, each method with its references, and expected cash", () => {
    render(<ZReport figures={figures} />);
    expect(screen.getByText("Staff One · 2026-10-06")).toBeInTheDocument();
    expect(screen.getByText("2 · RWF 400")).toBeInTheDocument();
    expect(screen.getByText("Voided sales").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Debt collected").nextSibling).toHaveTextContent("RWF 100");
    expect(screen.getByText("#S-12 · MP9")).toBeInTheDocument();
    expect(screen.getByText("Expected cash").nextSibling).toHaveTextContent("RWF 5,300");
    expect(screen.queryByText("Variance")).not.toBeInTheDocument();
    expect(screen.queryByText("Card")).not.toBeInTheDocument();
  });

  it("adds counted cash, variance and approver once closed", () => {
    const close = {
      close_id: 1, cashier: 3, cashier_name: "Staff One", business_date: "2026-10-06", opening_float: "5000.00",
      expected_cash: "5300.00", expected_by_method: figures.by_method, summary: figures,
      counted_cash: "5280.00", variance: "-20.00", note: "Short", closed_by: 2, closed_by_name: "Manager One",
      closed_at: "2026-10-06T18:00:00Z",
    } as DailyClose;
    render(<ZReport figures={figures} close={close} />);
    expect(screen.getByText("Variance").nextSibling).toHaveTextContent("RWF -20");
    expect(screen.getByText("Confirmed by").nextSibling).toHaveTextContent("Manager One");
  });
});
