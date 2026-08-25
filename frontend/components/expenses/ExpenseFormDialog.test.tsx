import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExpenseFormDialog } from "./ExpenseFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Expense } from "@/lib/types";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("ExpenseFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ expense_id: 1, category: "rent", amount: "50000.00", expense_date: "2026-08-20", description: null, recorded_by: 2 }),
        })
      )
    );
  });

  it("submits a create payload with the selected category and trimmed amount", async () => {
    const onSaved = vi.fn();
    renderWithProviders(<ExpenseFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.selectOptions(screen.getByLabelText("Category"), "rent");
    await userEvent.type(screen.getByLabelText("Amount (RWF)"), "50000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/expenses/");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.category).toBe("rent");
    expect(body.amount).toBe("50000");
    expect(body.description).toBeNull();
  });

  it("pre-fills values in edit mode and PATCHes the existing expense", async () => {
    const expense: Expense = {
      expense_id: 7, category: "utilities", amount: "42000.00", expense_date: "2026-08-15", description: "Water bill", recorded_by: 2,
    };
    const onSaved = vi.fn();
    renderWithProviders(<ExpenseFormDialog open mode="edit" initialExpense={expense} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByLabelText("Category")).toHaveValue("utilities");
    expect(screen.getByLabelText("Amount (RWF)")).toHaveValue(42000);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/expenses/7/");
    expect(call[1].method).toBe("PATCH");
  });

  it("shows validation errors and does not submit when category and amount are missing", async () => {
    renderWithProviders(<ExpenseFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Category is required.")).toBeInTheDocument();
    expect(screen.getByText("Enter an amount greater than 0.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
