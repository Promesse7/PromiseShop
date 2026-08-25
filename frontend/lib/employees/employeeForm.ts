import type { Employee, EmployeeRole, EmployeeStatus } from "@/lib/types";

export interface EmployeeFormValues {
  full_name: string;
  role: EmployeeRole | "";
  phone: string;
  email: string;
  username: string;
  password: string;
  hire_date: string;
  status: EmployeeStatus;
}

export function emptyEmployeeFormValues(): EmployeeFormValues {
  return {
    full_name: "",
    role: "",
    phone: "",
    email: "",
    username: "",
    password: "",
    hire_date: "",
    status: "active",
  };
}

export function employeeFormValuesFromEmployee(employee: Employee): EmployeeFormValues {
  return {
    full_name: employee.full_name,
    role: employee.role,
    phone: employee.phone ?? "",
    email: employee.email ?? "",
    username: employee.username,
    password: "",
    hire_date: employee.hire_date,
    status: employee.status,
  };
}

interface EmployeeBasePayload {
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  username: string;
  hire_date: string;
  status: EmployeeStatus;
}

export interface EmployeeCreatePayload extends EmployeeBasePayload {
  password: string;
}

export interface EmployeeUpdatePayload extends EmployeeBasePayload {
  password?: string;
}

function basePayload(values: EmployeeFormValues): EmployeeBasePayload {
  return {
    full_name: values.full_name.trim(),
    role: values.role as EmployeeRole,
    phone: values.phone.trim() || null,
    email: values.email.trim() || null,
    username: values.username.trim(),
    hire_date: values.hire_date,
    status: values.status,
  };
}

export function buildEmployeeCreatePayload(values: EmployeeFormValues): EmployeeCreatePayload {
  return { ...basePayload(values), password: values.password };
}

/** Password is only included when the admin actually typed a new one — matches the backend's
 * update() which leaves the existing password hash untouched when the field is omitted. */
export function buildEmployeeUpdatePayload(values: EmployeeFormValues): EmployeeUpdatePayload {
  const payload: EmployeeUpdatePayload = basePayload(values);
  if (values.password.trim() !== "") {
    payload.password = values.password;
  }
  return payload;
}

export type EmployeeFormErrors = Partial<
  Record<"full_name" | "role" | "username" | "password" | "hire_date", string>
>;

export function validateEmployeeForm(values: EmployeeFormValues, mode: "create" | "edit"): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {};
  if (!values.full_name.trim()) errors.full_name = "Full name is required.";
  if (!values.role) errors.role = "Role is required.";
  if (!values.username.trim()) errors.username = "Username is required.";
  if (!values.hire_date) errors.hire_date = "Hire date is required.";
  if (mode === "create" && !values.password.trim()) errors.password = "Password is required.";
  return errors;
}
