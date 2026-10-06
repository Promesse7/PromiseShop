import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { OpeningStockDialog } from "./OpeningStockDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

function renderDialog(currentInStock = 0) {
  const onSaved = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <OpeningStockDialog open productId={4} productName="Kettle" currentInStock={currentInStock} onClose={vi.fn()} onSaved={onSaved} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return { onSaved };
}

describe("OpeningStockDialog", () => {
  it("posts the opening count and unit cost", async () => {
    const fetchMock = vi.fn((url: string, options: RequestInit) => {
      expect(url).toBe("/api/proxy/products/4/opening-stock/");
      expect(JSON.parse(options.body as string)).toEqual({ quantity: 6, unit_cost: "250", reason: "" });
      return Promise.resolve({ ok: true, status: 201, json: async () => ({ eligible: false, reason: "x", in_stock: 6, movement_id: 1 }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { onSaved } = renderDialog();

    await userEvent.type(screen.getByLabelText("Opening count in stock"), "6");
    await userEvent.type(screen.getByLabelText("Cost per unit (RWF)"), "250");
    await userEvent.click(screen.getByRole("button", { name: "Set opening stock" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("validates before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderDialog(3);

    await userEvent.type(screen.getByLabelText("Opening count in stock"), "3");
    await userEvent.type(screen.getByLabelText("Cost per unit (RWF)"), "10");
    await userEvent.click(screen.getByRole("button", { name: "Set opening stock" }));
    expect(screen.getByText(/already 3 in stock/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Opening count in stock"));
    await userEvent.type(screen.getByLabelText("Opening count in stock"), "5");
    await userEvent.clear(screen.getByLabelText("Cost per unit (RWF)"));
    await userEvent.click(screen.getByRole("button", { name: "Set opening stock" }));
    expect(screen.getByText("Enter what one unit cost the shop.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the backend's refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 400, json: async () => ({ detail: ["This product has already been received on a purchase."] }) })
      )
    );
    renderDialog();
    await userEvent.type(screen.getByLabelText("Opening count in stock"), "2");
    await userEvent.type(screen.getByLabelText("Cost per unit (RWF)"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Set opening stock" }));
    expect(await screen.findByText("This product has already been received on a purchase.")).toBeInTheDocument();
  });
});
