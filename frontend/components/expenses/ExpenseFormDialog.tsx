"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  EXPENSE_CATEGORIES,
  emptyExpenseFormValues,
  expenseFormValuesFromExpense,
  buildExpensePayload,
  validateExpenseForm,
  type ExpenseFormValues,
  type ExpenseFormErrors,
} from "@/lib/expenses/expenseForm";
import type { Expense } from "@/lib/types";

interface ExpenseFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialExpense?: Expense;
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseFormDialog({ open, onClose, ...rest }: ExpenseFormDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title={rest.mode === "create" ? "New expense" : "Edit expense"}>
      {open && (
        <ExpenseFormFields
          key={`${rest.mode}-${rest.initialExpense?.expense_id ?? "new"}`}
          onClose={onClose}
          {...rest}
        />
      )}
    </Dialog>
  );
}

function ExpenseFormFields({
  mode,
  initialExpense,
  onClose,
  onSaved,
}: Omit<ExpenseFormDialogProps, "open">) {
  const categoryId = useId();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    mode === "edit" && initialExpense ? expenseFormValuesFromExpense(initialExpense) : emptyExpenseFormValues()
  );
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateExpenseForm(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const payload = buildExpensePayload(values);
      if (mode === "create") {
        await apiFetch<Expense>("expenses/", { method: "POST", body: JSON.stringify(payload) });
      } else if (initialExpense) {
        await apiFetch<Expense>(`expenses/${initialExpense.expense_id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      show(mode === "create" ? "Expense recorded." : "Expense saved.", "success");
      onSaved();
    } catch (error) {
      const message =
        error instanceof ApiError ? extractErrorMessage(error.body) : "Something went wrong — try again.";
      show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 min-w-[360px]">
      <div className="flex flex-col gap-1">
        <label htmlFor={categoryId} className="block text-xs text-text/70">
          Category
        </label>
        <select
          id={categoryId}
          value={values.category}
          onChange={(e) => setField("category", e.target.value as ExpenseFormValues["category"])}
          className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        >
          <option value="">Select a category…</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        {errors.category && <p className="text-xs text-red-400">{errors.category}</p>}
      </div>
      <Field label="Amount (RWF)" name="amount" type="number" value={values.amount} onChange={(v) => setField("amount", v)} error={errors.amount} />
      <Field label="Date" name="expense_date" type="date" value={values.expense_date} onChange={(v) => setField("expense_date", v)} error={errors.expense_date} />
      <div className="flex flex-col gap-1">
        <label className="block text-xs text-text/70">Description</label>
        <textarea
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
          className="w-full min-h-[56px] py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
        />
      </div>
      <div className="flex gap-2 justify-end mt-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
