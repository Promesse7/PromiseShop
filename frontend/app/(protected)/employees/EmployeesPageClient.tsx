"use client";

import { useState } from "react";
import { useEmployees } from "@/lib/employees/useEmployees";
import { EmployeeTable } from "@/components/employees/EmployeeTable";
import { SetPinDialog } from "@/components/employees/SetPinDialog";
import { EmployeeFormDialog } from "@/components/employees/EmployeeFormDialog";
import { AdminOnlyNotice } from "@/components/employees/AdminOnlyNotice";
import { Button } from "@/components/ui/Button";
import { Page } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
import type { Employee } from "@/lib/types";

interface EmployeesPageClientProps {
  isAdmin: boolean;
}

export default function EmployeesPageClient({ isAdmin }: EmployeesPageClientProps) {
  const employees = useEmployees(isAdmin);
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; employee?: Employee } | null>(null);
  const [pinFor, setPinFor] = useState<Employee | null>(null);

  if (!isAdmin) {
    return (
      <Page title="Employees">
        <AdminOnlyNotice />
      </Page>
    );
  }

  return (
    <Page
      title="Employees"
      description="Everyone who signs in. Every purchase, sale and stock change is stamped with who did it."
      primaryAction={<Button onClick={() => setDialog({ mode: "create" })}>+ New employee</Button>}
    >
      {employees.isError ? (
        <ErrorState message="Couldn't load employees." onRetry={employees.refetch} />
      ) : employees.isLoading ? (
        <LoadingState variant="table" label="Loading employees…" />
      ) : (
        <EmployeeTable
          employees={employees.all}
          onEdit={(employee) => setDialog({ mode: "edit", employee })}
          onSetPin={setPinFor}
        />
      )}
      <SetPinDialog employee={pinFor} onClose={() => setPinFor(null)} />
      <EmployeeFormDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "create"}
        initialEmployee={dialog?.employee}
        onClose={() => setDialog(null)}
        onSaved={() => setDialog(null)}
      />
    </Page>
  );
}
