import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmployeeTable } from "./EmployeeTable";
import type { Employee } from "@/lib/types";

const employees: Employee[] = [
  { employee_id: 1, full_name: "Alice Uwase", role: "admin", phone: "111", email: "a@b.com", username: "a.uwase", hire_date: "2023-01-15", status: "active", created_at: "2023-01-15T00:00:00Z" },
  { employee_id: 2, full_name: "Diane Ishimwe", role: "manager", phone: null, email: null, username: "d.ishimwe", hire_date: "2023-09-01", status: "inactive", created_at: "2023-09-01T00:00:00Z" },
];

describe("EmployeeTable", () => {
  it("renders name, role label, username, formatted hire date, and status", () => {
    render(<EmployeeTable employees={employees} onEdit={vi.fn()} />);
    expect(screen.getByText("Alice Uwase")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("a.uwase")).toBeInTheDocument();
    expect(screen.getByText("Jan 2023")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("inactive")).toBeInTheDocument();
  });

  it("shows an empty state when there are no employees", () => {
    render(<EmployeeTable employees={[]} onEdit={vi.fn()} />);
    expect(screen.getByText("No employees found")).toBeInTheDocument();
  });

  it("calls onEdit with the employee when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<EmployeeTable employees={employees} onEdit={onEdit} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(onEdit).toHaveBeenCalledWith(employees[0]);
  });
});
