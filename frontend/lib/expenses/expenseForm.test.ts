import { describe, expect, it } from "vitest";
import {
  emptyExpenseFormValues,
  expenseFormValuesFromExpense,
  buildExpensePayload,
  validateExpenseForm,
} from "./expenseForm";

describe("expenseForm", () => {
  it("builds empty values with today's date and no category", () => {
    const values = emptyExpenseFormValues();
    expect(values.category).toBe("");
    expect(values.amount).toBe("");
    expect(values.description).toBe("");
    expect(values.expense_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("maps an Expense to form values, defaulting a null description to an empty string", () => {
    const values = expenseFormValuesFromExpense({
      expense_id: 1, category: "rent", amount: "150000.00", expense_date: "2026-08-01",
      description: null, recorded_by: 2,
    });
    expect(values).toEqual({
      category: "rent", amount: "150000.00", expense_date: "2026-08-01", description: "",
    });
  });

  it("builds a payload trimming whitespace and nulling a blank description", () => {
    const payload = buildExpensePayload({
      category: "utilities", amount: " 42000 ", expense_date: "2026-08-20", description: "  ",
    });
    expect(payload).toEqual({
      category: "utilities", amount: "42000", expense_date: "2026-08-20", description: null,
    });
  });

  it("requires a category, a positive amount, and a date", () => {
    expect(validateExpenseForm(emptyExpenseFormValues())).toEqual({
      category: "Category is required.",
      amount: "Enter an amount greater than 0.",
    });
    expect(
      validateExpenseForm({ category: "rent", amount: "0", expense_date: "2026-08-20", description: "" })
    ).toEqual({ amount: "Enter an amount greater than 0." });
    expect(
      validateExpenseForm({ category: "rent", amount: "5000", expense_date: "2026-08-20", description: "" })
    ).toEqual({});
    expect(
      validateExpenseForm({ category: "rent", amount: "5000", expense_date: "", description: "" })
    ).toEqual({ expense_date: "Date is required." });
  });
});
