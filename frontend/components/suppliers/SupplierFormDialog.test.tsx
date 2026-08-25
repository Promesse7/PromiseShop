import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SupplierFormDialog } from "./SupplierFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Supplier } from "@/lib/types";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
}

describe("SupplierFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ supplier_id: 1, name: "Acme" }) }))
    );
  });

  it("submits a create payload with trimmed values", async () => {
    const onSaved = vi.fn();
    renderWithProviders(<SupplierFormDialog open mode="create" onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Name"), "  Acme Supplies  ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/suppliers/");
    expect(call[1].method).toBe("POST");
    expect(JSON.parse(call[1].body)).toEqual({
      name: "Acme Supplies", contact_person: null, phone: null, email: null, address: null,
    });
  });

  it("pre-fills values in edit mode and PATCHes the existing supplier", async () => {
    const supplier: Supplier = {
      supplier_id: 7, name: "Existing Co", contact_person: "A. Person", phone: "123", email: "a@b.com", address: "Somewhere",
    };
    const onSaved = vi.fn();
    renderWithProviders(<SupplierFormDialog open mode="edit" initialSupplier={supplier} onClose={vi.fn()} onSaved={onSaved} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Existing Co");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("/api/proxy/suppliers/7/");
    expect(call[1].method).toBe("PATCH");
  });

  it("shows a validation error and does not submit when name is blank", async () => {
    renderWithProviders(<SupplierFormDialog open mode="create" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
