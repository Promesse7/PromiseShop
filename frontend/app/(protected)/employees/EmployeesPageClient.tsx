"use client";

import { useState } from "react";
import { useEmployees } from "@/lib/employees/useEmployees";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { EmployeeFormDialog } from "@/components/employees/EmployeeFormDialog";
import { AdminOnlyNotice } from "@/components/employees/AdminOnlyNotice";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErrorState } from "@/components/ui/ErrorState";
import type { Employee } from "@/lib/types";

interface EmployeesPageClientProps {
  isAdmin: boolean;
}

export default function EmployeesPageClient({ isAdmin }: EmployeesPageClientProps) {
  const employees = useEmployees(isAdmin);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; employee?: Employee } | null>(null);

  if (!isAdmin) {
    return <AdminOnlyNotice />;
  }

  if (employees.isError) {
    return (
      <ErrorState message="Couldn't load employees." />
    );
  }

  if (employees.isLoading) {
    return <p className="text-sm text-text/50">Loading employees…</p>;
  }

  return (
    <div>
      <PageHeader title="Employees">
        <Tag variant="outline">Admin only</Tag>
        <Button onClick={() => setDialog({ mode: "create" })} className="ml-auto">
          + New employee
        </Button>
      </PageHeader>
      <EmployeeTable employees={employees.all} onEdit={(employee) => setDialog({ mode: "edit", employee })} />
      <p className="text-xs text-text/50 mt-3">
        Every purchase, sale and equipment status change is stamped with the employee who did it.
      </p>
      <EmployeeFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialEmployee={dialog?.employee}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </div>
  );
}
