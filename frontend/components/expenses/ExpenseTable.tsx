"use client";

import { Receipt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ExpenseTable({ expenses, onEdit }: ExpenseTableProps) {
  const columns: DataColumn<Expense>[] = [
    {
      key: "category",
      header: "Category",
      primary: true,
      render: (e) => <Tag>{categoryLabel(e.category)}</Tag>,
      sortValue: (e) => categoryLabel(e.category),
    },
    {
      key: "expense_date",
      header: "Date",
      mobile: true,
      render: (e) => formatDate(e.expense_date),
      sortValue: (e) => e.expense_date,
    },
    { key: "amount", header: "Amount", money: true, mobile: true, sortValue: (e) => Number(e.amount) },
    { key: "description", header: "Description", mobile: true, render: (e) => e.description || "—" },
    {
      key: "recorded_by",
      header: "Recorded by",
      render: (e) => <span className="text-xs text-text/50">Employee #{e.recorded_by}</span>,
    },
    {
      key: "edit",
      header: "",
      mobile: true,
      render: (e) => (
        <Button variant="ghost" className="text-xs" onClick={() => onEdit(e)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      label="Expenses"
      columns={columns}
      rows={expenses}
      rowKey={(e) => String(e.expense_id)}
      empty={
        <EmptyState
          icon={Receipt}
          title="No expenses recorded yet"
          message="Rent, utilities, salaries and repairs you record show up here."
        />
      }
    />
  );
}
