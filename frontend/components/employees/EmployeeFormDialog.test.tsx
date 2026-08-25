import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { EmployeeFormDialog } from "./EmployeeFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Employee } from "@/lib/types";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("EmployeeFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ employee_id: 1 }) }))
    );
  });

  it("submits a create payload including the password", async () => {
    const onSaved = vi.fn();
    renderWithProviders(<EmployeeFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Full name"), "New Hire");
    await userEvent.selectOptions(screen.getByLabelText("Role"), "sales_staff");
    await userEvent.type(screen.getByLabelText("Username"), "n.hire");
    await userEvent.type(screen.getByLabelText("Password"), "s3cret!!");
    await userEvent.type(screen.getByLabelText("Hire date"), "2026-08-25");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/employees/");
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ full_name: "New Hire", role: "sales_staff", username: "n.hire", password: "s3cret!!", status: "active" });
  });

  it("pre-fills edit mode with a blank password and omits it from the PATCH when left blank", async () => {
    const employee: Employee = {
      employee_id: 5, full_name: "Diane Ishimwe", role: "manager", phone: null, email: null,
      username: "d.ishimwe", hire_date: "2023-09-01", status: "inactive", created_at: "2023-09-01T00:00:00Z",
    };
    const onSaved = vi.fn();
    renderWithProviders(<EmployeeFormDialog open mode="edit" initialEmployee={employee} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByLabelText("Full name")).toHaveValue("Diane Ishimwe");
    expect(screen.getByLabelText(/New password/)).toHaveValue("");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/employees/5/");
    expect(call[1].method).toBe("PATCH");
    expect(JSON.parse(call[1].body)).not.toHaveProperty("password");
  });

  it("requires full name, role, username, hire date, and (on create) password", async () => {
    renderWithProviders(<EmployeeFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Full name is required.")).toBeInTheDocument();
    expect(screen.getByText("Role is required.")).toBeInTheDocument();
    expect(screen.getByText("Username is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
