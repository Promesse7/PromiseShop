"use client";

import { Button } from "@/components/ui/Button";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { Employee, EmployeeStatus } from "@/lib/types";

const ROLE_LABEL: Record<Employee["role"], string> = {
  admin: "Admin",
  manager: "Manager",
  sales_staff: "Sales Staff",
  technician: "Technician",
};

const STATUS_TAG: Record<EmployeeStatus, { label: string; variant: "accent" | "neutral" }> = {
  active: { label: "active", variant: "accent" },
  inactive: { label: "inactive", variant: "neutral" },
  terminated: { label: "terminated", variant: "neutral" },
};

function formatHireDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

interface EmployeeTableProps {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
}

export function EmployeeTable({ employees, onEdit }: EmployeeTableProps) {
  const columns = [
    { key: "full_name", header: "Name" },
    {
      key: "role",
      header: "Role",
      render: (e: Employee) => <Tag variant={e.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[e.role]}</Tag>,
    },
    { key: "username", header: "Username", render: (e: Employee) => <span className="font-mono text-xs">{e.username}</span> },
    { key: "phone", header: "Contact", render: (e: Employee) => e.phone ?? "—" },
    { key: "hire_date", header: "Hired", render: (e: Employee) => formatHireDate(e.hire_date) },
    {
      key: "status",
      header: "Status",
      render: (e: Employee) => {
        const tag = STATUS_TAG[e.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
    },
    {
      key: "edit",
      header: "",
      render: (e: Employee) => (
        <Button variant="ghost" className="text-xs" onClick={() => onEdit(e)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Table columns={columns} rows={employees} rowKey={(e) => String(e.employee_id)} emptyMessage="No employees found" />
  );
}
