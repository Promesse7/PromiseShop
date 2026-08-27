"use client";

import { useMemo, useState } from "react";
import { useExpenses } from "@/lib/expenses/useExpenses";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/expenseForm";
import { ExpenseTable } from "@/components/expenses/ExpenseTable";
import { ExpenseFormDialog } from "@/components/expenses/ExpenseFormDialog";
import { AdminOnlyNotice } from "@/components/expenses/AdminOnlyNotice";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Card, CardKicker } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import type { Expense, ExpenseCategory } from "@/lib/types";

interface ExpensesPageClientProps {
  isAdmin: boolean;
}

const FILTER_OPTIONS = [{ value: "all", label: "All" }, ...EXPENSE_CATEGORIES];

function formatRwf(amount: number): string {
  return `RWF ${Math.round(amount).toLocaleString()}`;
}

export default function ExpensesPageClient({ isAdmin }: ExpensesPageClientProps) {
  const expenses = useExpenses(isAdmin);
  const [filter, setFilter] = useState<ExpenseCategory | "all">("all");
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; expense?: Expense } | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return expenses.all;
    return expenses.all.filter((e) => e.category === filter);
  }, [expenses.all, filter]);

  const totalFiltered = useMemo(
    () => filtered.reduce((sum, e) => sum + Number(e.amount), 0),
    [filtered]
  );

  if (!isAdmin) {
    return <AdminOnlyNotice />;
  }

  if (expenses.isError) {
    return (
      <ErrorState message="Couldn't load expenses." />
    );
  }

  if (expenses.isLoading) {
    return <p className="text-sm text-text/50">Loading expenses…</p>;
  }

  return (
    <div>
      <PageHeader title="Expenses">
        <Tag variant="outline">Admin only</Tag>
        <SegmentedToggle
          name="expense-filter"
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => setFilter(v as ExpenseCategory | "all")}
        />
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New expense
        </Button>
      </PageHeader>
      <Card variant="glass" className="mb-4 max-w-xs">
        <CardKicker>Total {filter === "all" ? "(all)" : "(filtered)"}</CardKicker>
        <span className="font-sans font-medium text-2xl">{formatRwf(totalFiltered)}</span>
      </Card>
      <ExpenseTable expenses={filtered} onEdit={(expense) => setDialog({ mode: "edit", expense })} />
      <ExpenseFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialExpense={dialog?.expense}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </div>
  );
}
