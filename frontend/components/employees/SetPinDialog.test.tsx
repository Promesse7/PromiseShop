import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SetPinDialog } from "./SetPinDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Employee } from "@/lib/types";

const manager: Employee = {
  employee_id: 2, full_name: "Diane Ishimwe", role: "manager", phone: null, email: null, username: "d.ishimwe",
  hire_date: "2023-09-01", status: "active", created_at: "2023-09-01T00:00:00Z",
};

function renderDialog(onClose = vi.fn()) {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SetPinDialog employee={manager} onClose={onClose} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return onClose;
}

describe("SetPinDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ ...manager, has_approval_pin: true }) })));
  });

  it("checks the PIN is 4-6 digits and typed twice the same", async () => {
    renderDialog();
    await userEvent.type(screen.getByLabelText("New PIN"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(screen.getByText("The PIN must be 4 to 6 digits.")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("New PIN"));
    await userEvent.type(screen.getByLabelText("New PIN"), "2468");
    await userEvent.type(screen.getByLabelText("Repeat PIN"), "2469");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(screen.getByText("The two PINs don't match.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the PIN to set-pin", async () => {
    const onClose = renderDialog();
    await userEvent.type(screen.getByLabelText("New PIN"), "2468");
    await userEvent.type(screen.getByLabelText("Repeat PIN"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Save PIN" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/employees/2/set-pin/",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ pin: "2468" }) })
    );
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
