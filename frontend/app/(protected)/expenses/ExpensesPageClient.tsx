"use client";

import { useMemo, useState } from "react";
import { useExpenses } from "@/lib/expenses/useExpenses";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/expenseForm";
import { ExpenseTable } from "@/components/expenses/ExpenseTable";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { AdminOnlyNotice } from "@/components/expenses/AdminOnlyNotice";
import { Button } from "@/components/ui/Button";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Card, CardKicker } from "@/components/ui/Card";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import { formatRwf } from "@/lib/format";
import type { Expense, ExpenseCategory } from "@/lib/types";

interface ExpensesPageClientProps {
  isAdmin: boolean;
}

const FILTER_OPTIONS = [{ value: "all", label: "All" }, ...EXPENSE_CATEGORIES];

export default function ExpensesPageClient({ isAdmin }: ExpensesPageClientProps) {
  const expenses = useExpenses(isAdmin);
  const [filter, setFilter] = useState<ExpenseCategory | "all">("all");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; expense?: Expense } | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return expenses.all;
    return expenses.all.filter((e) => e.category === filter);
  }, [expenses.all, filter]);

  const totalFiltered = useMemo(() => filtered.reduce((sum, e) => sum + Number(e.amount), 0), [filtered]);

  if (!isAdmin) {
    return (
      <Page title="Expenses">
        <AdminOnlyNotice />
      </Page>
    );
  }

  return (
    <Page
      title="Expenses"
      description="Money the shop spends to run: rent, utilities, salaries, repairs."
      primaryAction={<Button onClick={() => setDialog({ mode: "create" })}>+ New expense</Button>}
      toolbar={
        <Toolbar
          activeFilterCount={filter === "all" ? 0 : 1}
          filters={
            <SegmentedToggle
              name="expense-filter"
              options={FILTER_OPTIONS}
              value={filter}
              onChange={(v) => setFilter(v as ExpenseCategory | "all")}
            />
          }
        />
      }
    >
      {expenses.isError ? (
        <ErrorState message="Couldn't load expenses." onRetry={expenses.refetch} />
      ) : expenses.isLoading ? (
        <LoadingState variant="table" label="Loading expenses…" />
      ) : (
        <div className="flex flex-col gap-4">
          <Card variant="glass" className="max-w-xs">
            <CardKicker>Total {filter === "all" ? "(all)" : "(filtered)"}</CardKicker>
            <span className="font-sans text-2xl font-medium tabular-nums">{formatRwf(totalFiltered)}</span>
          </Card>
          <ExpenseTable expenses={filtered} onEdit={(expense) => setDialog({ mode: "edit", expense })} />
        </div>
      )}
      <ExpenseFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialExpense={dialog?.expense}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </Page>
  );
}
