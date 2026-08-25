import type { Expense, ExpenseCategory } from "@/lib/types";

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: "rent", label: "Rent" },
  { value: "utilities", label: "Utilities" },
  { value: "salaries", label: "Salaries" },
  { value: "repairs", label: "Repairs" },
  { value: "other", label: "Other" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface ExpenseFormValues {
  category: ExpenseCategory | "";
  amount: string;
  expense_date: string;
  description: string;
}

export function emptyExpenseFormValues(): ExpenseFormValues {
  return { category: "", amount: "", expense_date: today(), description: "" };
}

export function expenseFormValuesFromExpense(expense: Expense): ExpenseFormValues {
  return {
    category: expense.category,
    amount: expense.amount,
    expense_date: expense.expense_date,
    description: expense.description ?? "",
  };
}

export interface ExpensePayload {
  category: ExpenseCategory;
  amount: string;
  expense_date: string;
  description: string | null;
}

export function buildExpensePayload(values: ExpenseFormValues): ExpensePayload {
  return {
    category: values.category as ExpenseCategory,
    amount: values.amount.trim(),
    expense_date: values.expense_date,
    description: values.description.trim() || null,
  };
}

export type ExpenseFormErrors = Partial<Record<"category" | "amount" | "expense_date", string>>;

export function validateExpenseForm(values: ExpenseFormValues): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  if (!values.category) {
    errors.category = "Category is required.";
  }
  const amount = Number(values.amount);
  if (!values.amount.trim() || Number.isNaN(amount) || amount <= 0) {
    errors.amount = "Enter an amount greater than 0.";
  }
  if (!values.expense_date) {
    errors.expense_date = "Date is required.";
  }
  return errors;
}
