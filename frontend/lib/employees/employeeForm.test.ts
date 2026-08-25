import { describe, expect, it } from "vitest";
import {
  emptyEmployeeFormValues,
  employeeFormValuesFromEmployee,
  buildEmployeeCreatePayload,
  buildEmployeeUpdatePayload,
  validateEmployeeForm,
} from "./employeeForm";
import type { Employee } from "@/lib/types";

const employee: Employee = {
  employee_id: 1,
  full_name: "Alice Uwase",
  role: "admin",
  phone: "111",
  email: "a@b.com",
  username: "a.uwase",
  hire_date: "2023-01-15",
  status: "active",
  created_at: "2023-01-15T00:00:00Z",
};

describe("employeeForm", () => {
  it("maps an Employee to form values with a blank password", () => {
    expect(employeeFormValuesFromEmployee(employee)).toEqual({
      full_name: "Alice Uwase", role: "admin", phone: "111", email: "a@b.com",
      username: "a.uwase", password: "", hire_date: "2023-01-15", status: "active",
    });
  });

  it("builds a create payload including the password", () => {
    const payload = buildEmployeeCreatePayload({
      ...emptyEmployeeFormValues(),
      full_name: "New Hire", role: "sales_staff", username: "n.hire", password: "s3cret!", hire_date: "2026-08-25",
    });
    expect(payload).toEqual({
      full_name: "New Hire", role: "sales_staff", phone: null, email: null,
      username: "n.hire", hire_date: "2026-08-25", status: "active", password: "s3cret!",
    });
  });

  it("builds an update payload omitting password when left blank", () => {
    const values = employeeFormValuesFromEmployee(employee);
    const payload = buildEmployeeUpdatePayload(values);
    expect(payload).not.toHaveProperty("password");
    expect(payload.full_name).toBe("Alice Uwase");
  });

  it("builds an update payload including password when a new one is typed", () => {
    const values = { ...employeeFormValuesFromEmployee(employee), password: "newpass1" };
    const payload = buildEmployeeUpdatePayload(values);
    expect(payload.password).toBe("newpass1");
  });

  it("requires full_name, role, username, hire_date always; password only on create", () => {
    expect(validateEmployeeForm(emptyEmployeeFormValues(), "create")).toEqual({
      full_name: "Full name is required.",
      role: "Role is required.",
      username: "Username is required.",
      hire_date: "Hire date is required.",
      password: "Password is required.",
    });
    expect(validateEmployeeForm(emptyEmployeeFormValues(), "edit")).toEqual({
      full_name: "Full name is required.",
      role: "Role is required.",
      username: "Username is required.",
      hire_date: "Hire date is required.",
    });
  });

  it("passes validation with all required fields present", () => {
    expect(
      validateEmployeeForm(
        { ...emptyEmployeeFormValues(), full_name: "A", role: "admin", username: "a", hire_date: "2026-01-01", password: "x" },
        "create"
      )
    ).toEqual({});
  });
});
