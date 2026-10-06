"use client";

import { UserCog } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
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
  // Admin and manager accounts can have a PIN to approve discounts at the till.
  onSetPin?: (employee: Employee) => void;
}

export function EmployeeTable({ employees, onEdit, onSetPin }: EmployeeTableProps) {
  const columns: DataColumn<Employee>[] = [
    { key: "full_name", header: "Name", primary: true, sortValue: (e) => e.full_name },
    {
      key: "role",
      header: "Role",
      mobile: true,
      render: (e) => <Tag variant={e.role === "admin" ? "accent" : "neutral"}>{ROLE_LABEL[e.role]}</Tag>,
      sortValue: (e) => ROLE_LABEL[e.role],
    },
    {
      key: "username",
      header: "Username",
      mobile: true,
      render: (e) => <span className="font-mono text-xs">{e.username}</span>,
    },
    { key: "phone", header: "Contact", render: (e) => e.phone ?? "—" },
    { key: "hire_date", header: "Hired", render: (e) => formatHireDate(e.hire_date), sortValue: (e) => e.hire_date },
    {
      key: "status",
      header: "Status",
      mobile: true,
      render: (e) => {
        const tag = STATUS_TAG[e.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
    },
    {
      key: "edit",
      header: "",
      mobile: true,
      render: (e) => (
        <div className="flex flex-wrap justify-end gap-1">
          {onSetPin && (e.role === "admin" || e.role === "manager") && (
            <Button variant="ghost" className="text-xs" onClick={() => onSetPin(e)}>
              {e.has_approval_pin ? "Change approval PIN" : "Set approval PIN"}
            </Button>
          )}
          <Button variant="ghost" className="text-xs" onClick={() => onEdit(e)}>
            Edit
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      label="Employees"
      columns={columns}
      rows={employees}
      rowKey={(e) => String(e.employee_id)}
      empty={<EmptyState icon={UserCog} title="No employees found" message="Add the people who use the shop's tills." />}
    />
  );
}
