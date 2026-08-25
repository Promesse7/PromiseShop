import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExpenseTable } from "./ExpenseTable";
import type { Expense } from "@/lib/types";

const expenses: Expense[] = [
  { expense_id: 1, category: "rent", amount: "300000.00", expense_date: "2026-08-01", description: "August rent", recorded_by: 2 },
  { expense_id: 2, category: "utilities", amount: "42000.00", expense_date: "2026-08-15", description: null, recorded_by: 2 },
];

describe("ExpenseTable", () => {
  it("renders each expense row with its category label, formatted amount, and a fallback for a missing description", () => {
    render(<ExpenseTable expenses={expenses} onEdit={vi.fn()} />);
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Utilities")).toBeInTheDocument();
    expect(screen.getByText("RWF 300,000")).toBeInTheDocument();
    expect(screen.getByText("August rent")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an empty state when there are no expenses", () => {
    render(<ExpenseTable expenses={[]} onEdit={vi.fn()} />);
    expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument();
  });

  it("calls onEdit with the expense when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<ExpenseTable expenses={expenses} onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(onEdit).toHaveBeenCalledWith(expenses[0]);
  });
});
