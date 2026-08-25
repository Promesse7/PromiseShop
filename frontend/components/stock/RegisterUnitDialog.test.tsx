import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RegisterUnitDialog } from "./RegisterUnitDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderDialog(props: Partial<React.ComponentProps<typeof RegisterUnitDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RegisterUnitDialog open productId={2} onClose={onClose} onSaved={onSaved} {...props} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onClose, onSaved };
}

describe("RegisterUnitDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("change-status")) {
          return Promise.resolve({ ok: true, json: async () => ({ unit_id: 9, status: "in_stock" }) });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ unit_id: 9, product: 2, serial_number: "JBL6-NEW01", status: "" }),
        });
      })
    );
  });

  it("requires a serial number before submitting", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Serial number is required.")).toBeInTheDocument();
  });

  it("submits product, serial number, storage location and condition notes", async () => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.includes("change-status")) {
        return Promise.resolve({ ok: true, json: async () => ({ unit_id: 9, status: "in_stock" }) });
      }
      const body = JSON.parse((options?.body as string) ?? "{}");
      expect(body).toEqual({
        product: 2,
        serial_number: "JBL6-NEW01",
        storage_location: "Shelf B2",
        condition_notes: null,
      });
      return Promise.resolve({
        ok: true,
        json: async () => ({ unit_id: 9, product: 2, serial_number: "JBL6-NEW01", status: "" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onSaved } = renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.type(screen.getByLabelText("Storage location"), "Shelf B2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
  });
});
