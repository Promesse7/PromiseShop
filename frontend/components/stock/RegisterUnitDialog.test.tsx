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
        <RegisterUnitDialog
          open
          productId={2}
          productName="JBL Flip 6 Speaker"
          onClose={onClose}
          onSaved={onSaved}
          {...props}
        />
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
          return Promise.resolve({
            ok: true,
            json: async () => ({ unit_id: 9, product: 2, serial_number: "JBL6-NEW01", status: "in_stock" }),
          });
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

  it("offers to print a label after a successful save, without auto-closing", async () => {
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    // The serial number appears twice — once in the confirmation text, once in the
    // (CSS-hidden, but still DOM-present in jsdom) printable label's barcode — so assert
    // presence via findAllByText rather than the single-match findByText, matching the
    // established pattern for visible+print duplicate text (see PosCheckout.test.tsx).
    expect((await screen.findAllByText(/JBL6-NEW01/)).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Print label now" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes the dialog when Done is clicked after saving", async () => {
    const { onClose } = renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Print label now" });

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls window.print when Print label now is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderDialog();
    await userEvent.type(screen.getByLabelText("Serial number"), "JBL6-NEW01");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(await screen.findByRole("button", { name: "Print label now" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
