import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SetPriceDialog } from "./SetPriceDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderWithToast(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
  return { ...utils, invalidateSpy };
}

describe("SetPriceDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the wholesale price field for admins", () => {
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Wholesale price")).toBeInTheDocument();
  });

  it("hides the wholesale price field for non-admins", () => {
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={false} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.queryByLabelText("Wholesale price")).not.toBeInTheDocument();
  });

  it("posts to /api/proxy/product-pricing/ with the product id and entered values", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ price_id: 3, product: 1, retail_price: "150000.00", effective_date: "2026-08-25", is_current: true }),
    });
    const onSaved = vi.fn();
    const { invalidateSpy } = renderWithToast(
      <SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={onSaved} />
    );

    await userEvent.type(screen.getByLabelText("Retail price"), "150000");
    await userEvent.type(screen.getByLabelText("Wholesale price"), "112000");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSaved).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/product-pricing/",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"product":1'),
      })
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["product-pricing"] });
  });

  it("resets fields when the dialog is closed and reopened", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrap = (open: boolean) => (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SetPriceDialog open={open} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>
    );
    const { rerender } = render(wrap(true));

    await userEvent.type(screen.getByLabelText("Retail price"), "150000");
    expect(screen.getByLabelText("Retail price")).toHaveValue(150000);

    rerender(wrap(false));
    rerender(wrap(true));

    expect(screen.getByLabelText("Retail price")).toHaveValue(null);
  });

  it("shows an error toast and keeps the dialog open on failure", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ detail: { retail_price: ["This field is required."] } }),
    });
    renderWithToast(<SetPriceDialog open={true} productId={1} isAdmin={true} onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
  });
});
