import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChangeStatusDialog } from "./ChangeStatusDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderDialog(props: Partial<React.ComponentProps<typeof ChangeStatusDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ChangeStatusDialog open unitId={5} currentStatus="in_stock" onClose={onClose} onSaved={onSaved} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose, onSaved };
}

describe("ChangeStatusDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ unit_id: 5, status: "under_repair" }) }))
    );
  });

  it("requires a reason before submitting", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));
    expect(screen.getByText("Reason is required.")).toBeInTheDocument();
  });

  it("submits the selected status and reason", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toContain("/equipment-units/5/change-status/");
      expect(JSON.parse(options.body as string)).toEqual({
        new_status: "under_repair",
        reason: "Sent to service centre",
      });
      return Promise.resolve({ ok: true, json: async () => ({ unit_id: 5, status: "under_repair" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onSaved } = renderDialog();
    await userEvent.click(screen.getByLabelText("Under repair"));
    await userEvent.type(screen.getByLabelText("Reason (required — goes to history)"), "Sent to service centre");
    await userEvent.click(screen.getByRole("button", { name: "Save change" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
