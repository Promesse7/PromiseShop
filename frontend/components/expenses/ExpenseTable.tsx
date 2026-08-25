"use client";

import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import { EXPENSE_CATEGORIES } from "@/lib/expenses/expenseForm";
import type { Expense } from "@/lib/types";

interface ExpenseTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
}

function categoryLabel(category: Expense["category"]): string {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function formatRwf(amount: string): string {
  return `RWF ${Math.round(Number(amount)).toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ExpenseTable({ expenses, onEdit }: ExpenseTableProps) {
  const columns = [
    { key: "expense_date", header: "Date", render: (e: Expense) => formatDate(e.expense_date) },
    {
      key: "category",
      header: "Category",
      render: (e: Expense) => <Tag>{categoryLabel(e.category)}</Tag>,
    },
    {
      key: "amount",
      header: "Amount",
      render: (e: Expense) => <span className="font-mono">{formatRwf(e.amount)}</span>,
    },
    { key: "description", header: "Description", render: (e: Expense) => e.description || "—" },
    {
      key: "recorded_by",
      header: "Recorded by",
      render: (e: Expense) => <span className="text-xs text-text/50">Employee #{e.recorded_by}</span>,
    },
    {
      key: "edit",
      header: "",
      render: (e: Expense) => (
        <Button variant="ghost" className="text-xs" onClick={() => onEdit(e)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Table columns={columns} rows={expenses} rowKey={(e) => String(e.expense_id)} emptyMessage="No expenses recorded yet" />
  );
}
