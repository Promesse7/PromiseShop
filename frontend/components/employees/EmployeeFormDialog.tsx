"use client";

import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/layout/ToastProvider";
import { apiFetch, ApiError, extractErrorMessage } from "@/lib/api-client";
import {
  emptyEmployeeFormValues,
  employeeFormValuesFromEmployee,
  buildEmployeeCreatePayload,
  buildEmployeeUpdatePayload,
  validateEmployeeForm,
  type EmployeeFormValues,
  type EmployeeFormErrors,
} from "@/lib/employees/employeeForm";
import type { Employee, EmployeeRole, EmployeeStatus } from "@/lib/types";

const ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "sales_staff", label: "Sales Staff" },
  { value: "technician", label: "Technician" },
];

const STATUS_OPTIONS: { value: EmployeeStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "terminated", label: "Terminated" },
];

interface EmployeeFormDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialEmployee?: Employee;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeFormDialog({ open, mode, initialEmployee, onClose, onSaved }: EmployeeFormDialogProps) {
  const roleId = useId();
  const statusId = useId();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<EmployeeFormValues>(emptyEmployeeFormValues());
  const [errors, setErrors] = useState<EmployeeFormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (mode === "edit" && initialEmployee) {
      setValues(employeeFormValuesFromEmployee(initialEmployee));
    } else {
      setValues(emptyEmployeeFormValues());
    }
    setErrors({});
  }, [mode, initialEmployee?.employee_id, open]);

  function setField<K extends keyof EmployeeFormValues>(key: K, value: EmployeeFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit() {
    const validationErrors = validateEmployeeForm(values, mode);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      if (mode === "create") {
        await apiFetch<Employee>("employees/", {
          method: "POST",
          body: JSON.stringify(buildEmployeeCreatePayload(values)),
        });
      } else if (initialEmployee) {
        await apiFetch<Employee>(`employees/${initialEmployee.employee_id}/`, {
          method: "PATCH",
          body: JSON.stringify(buildEmployeeUpdatePayload(values)),
        });
      }
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      show(mode === "create" ? "Employee created." : "Employee saved.", "success");
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
    <Dialog open={open} onClose={onClose} title={mode === "create" ? "New employee" : "Edit employee"}>
      <div className="flex flex-col gap-3 min-w-[360px]">
        <Field label="Full name" name="full_name" value={values.full_name} onChange={(v) => setField("full_name", v)} error={errors.full_name} />
        <div className="flex flex-col gap-1">
          <label htmlFor={roleId} className="block text-xs text-text/70">
            Role
          </label>
          <select
            id={roleId}
            value={values.role}
            onChange={(e) => setField("role", e.target.value as EmployeeRole)}
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          >
            <option value="">Select a role…</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {errors.role && <p className="text-xs text-red-400">{errors.role}</p>}
        </div>
        <Field label="Username" name="username" value={values.username} onChange={(v) => setField("username", v)} error={errors.username} />
        <Field
          label={mode === "create" ? "Password" : "New password (leave blank to keep current)"}
          name="password"
          type="password"
          value={values.password}
          onChange={(v) => setField("password", v)}
          error={errors.password}
        />
        <Field label="Phone" name="phone" value={values.phone} onChange={(v) => setField("phone", v)} />
        <Field label="Email" name="email" type="email" value={values.email} onChange={(v) => setField("email", v)} />
        <Field label="Hire date" name="hire_date" type="date" value={values.hire_date} onChange={(v) => setField("hire_date", v)} error={errors.hire_date} />
        <div className="flex flex-col gap-1">
          <label htmlFor={statusId} className="block text-xs text-text/70">
            Status
          </label>
          <select
            id={statusId}
            value={values.status}
            onChange={(e) => setField("status", e.target.value as EmployeeStatus)}
            className="w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface border border-divider rounded-md"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
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
    </Dialog>
  );
}
