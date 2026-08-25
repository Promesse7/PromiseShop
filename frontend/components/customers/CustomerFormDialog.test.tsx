import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CustomerFormDialog } from "./CustomerFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Customer } from "@/lib/types";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("CustomerFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ customer_id: 1, name: "Grace" }) }))
    );
  });

  it("submits a create payload with trimmed values", async () => {
    const onSaved = vi.fn();
    renderWithProviders(<CustomerFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Name"), "  Grace Mukamana  ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/customers/");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({ name: "Grace Mukamana", phone: null, email: null, address: null });
  });

  it("pre-fills values in edit mode and PATCHes the existing customer", async () => {
    const customer: Customer = { customer_id: 9, name: "Existing Customer", phone: "123", email: "a@b.com", address: "Somewhere" };
    const onSaved = vi.fn();
    renderWithProviders(<CustomerFormDialog open mode="edit" initialCustomer={customer} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Existing Customer");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/customers/9/");
    expect(call[1].method).toBe("PATCH");
  });

  it("shows a validation error and does not submit when name is blank", async () => {
    renderWithProviders(<CustomerFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
