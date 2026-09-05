import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AdjustStockDialog } from "./AdjustStockDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderDialog(props: Partial<React.ComponentProps<typeof AdjustStockDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdjustStockDialog
          open={true}
          inventoryId={9}
          productName="JBL Flip 6"
          quantities={{ in_stock: 10, in_use: 1, damaged: 2 }}
          onClose={onClose}
          onSaved={onSaved}
          {...props}
        />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onSaved, onClose };
}

describe("AdjustStockDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the product, current buckets, and the adjustment types", () => {
    renderDialog();
    expect(screen.getByRole("heading", { name: "Adjust stock — JBL Flip 6" })).toBeInTheDocument();
    expect(screen.getByText("10 in stock · 1 in use · 2 damaged")).toBeInTheDocument();
    for (const label of ["Count correction", "To damaged", "From damaged", "To in use", "From in use"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("posts the adjustment, toasts, and calls onSaved", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ adjustment_id: 1, inventory: 9, adjustment_type: "to_damaged", quantity: 3, reason: "Dropped", before_in_stock: 10, after_in_stock: 7, before_in_use: 1, after_in_use: 1, before_damaged: 2, after_damaged: 5, changed_by: 1, created_at: "2026-09-05T10:00:00Z" }),
    });
    const { onSaved } = renderDialog();

    await userEvent.click(screen.getByText("To damaged"));
    await userEvent.type(screen.getByLabelText("Quantity"), "3");
    await userEvent.type(screen.getByLabelText(/Reason/), "Dropped");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/inventory/9/adjust/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ adjustment_type: "to_damaged", quantity: 3, reason: "Dropped" }),
      })
    );
    expect(await screen.findByText("Stock adjusted.")).toBeInTheDocument();
  });

  it("labels the quantity as the new count for a count correction and sends it as is", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, json: async () => ({}) });
    renderDialog();

    expect(screen.getByLabelText("New count in stock")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New count in stock"), "7");
    await userEvent.type(screen.getByLabelText(/Reason/), "Stock take");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/proxy/inventory/9/adjust/",
        expect.objectContaining({ body: JSON.stringify({ adjustment_type: "count_correction", quantity: 7, reason: "Stock take" }) })
      )
    );
  });

  it("requires a reason and a quantity before submitting", async () => {
    renderDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(screen.getByText("Enter a quantity.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("New count in stock"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));
    expect(screen.getByText("Reason is required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the backend's message when the move exceeds the source bucket", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: ["Cannot move 30 to damaged: only 10 in stock."] }),
    });
    renderDialog();
    await userEvent.click(screen.getByText("To damaged"));
    await userEvent.type(screen.getByLabelText("Quantity"), "30");
    await userEvent.type(screen.getByLabelText(/Reason/), "Flood");
    await userEvent.click(screen.getByRole("button", { name: "Save adjustment" }));

    expect(await screen.findByText("Cannot move 30 to damaged: only 10 in stock.")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("heading", { name: /Adjust stock/ })).not.toBeInTheDocument();
  });
});
