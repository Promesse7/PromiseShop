import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { PosCheckout } from "./PosCheckout";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { setMatchMedia } from "@/lib/test/matchMedia";
import * as usePosCatalogModule from "@/lib/pos/usePosCatalog";
import * as chromeModule from "@/lib/scroll/chrome";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";

const jbl = {
  product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
  model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
};

// Answers fetches by URL so background requests (price-check) don't eat the sale's mock.
function routeFetch(handlers: { sale?: () => { ok: boolean; body: unknown }; priceCheck?: unknown }) {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes("sales/price-check/")) {
      return Promise.resolve({ ok: true, json: async () => handlers.priceCheck ?? { max_staff_discount_pct: "10.00", lines: [] } });
    }
    if (url.endsWith("/sales/") && handlers.sale) {
      const { ok, body } = handlers.sale();
      return Promise.resolve({ ok, status: ok ? 201 : 400, json: async () => body });
    }
    return Promise.resolve({ ok: true, json: async () => ({ count: 0, next: null, previous: null, results: [] }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function saleCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/sales/"));
}

const saleBody = (overrides: Record<string, unknown> = {}) => ({
  sale_id: 842, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
  payment_method: "cash", total_amount: "145000.00", status: "completed",
  items: [{ sale_item_id: 1, sale: 842, product: 1, quantity: 1, unit_price: "145000.00", list_price: "145000.00", subtotal: "145000.00", tax_category: "B", tax_amount: "22118.64" }],
  ...overrides,
});

async function scanJbl() {
  await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-AUD-00147{Enter}");
}

async function typePrice(value: string) {
  const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
  priceInput.focus();
  await userEvent.keyboard("{Control>}a{/Control}");
  await userEvent.keyboard(value);
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
  return { ...view, queryClient };
}

describe("PosCheckout", () => {
  beforeEach(() => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [jbl],
      byBarcode: new Map([[jbl.barcode, jbl]]),
      isLoading: false,
      isError: false,
    } as PosCatalog);
    vi.stubGlobal("fetch", vi.fn());
  });

  it("adds a scanned product to the cart and updates the total", async () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    expect((await screen.findAllByText("JBL Flip 6 Speaker")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("RWF 145,000").length).toBeGreaterThan(0);
  });

  it("disables Complete sale with an empty cart", () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  it("shows a loading message and hides the scan field while the catalog is loading", () => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [],
      byBarcode: new Map(),
      isLoading: true,
      isError: false,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByRole("status", { name: "Loading catalog…" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Scan barcode or search product")).not.toBeInTheDocument();
  });

  it("shows an error message and hides the scan field when the catalog fails to load", () => {
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [],
      byBarcode: new Map(),
      isLoading: false,
      isError: true,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByText(/Couldn't load the product catalog/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Scan barcode or search product")).not.toBeInTheDocument();
  });

  it("posts to /api/proxy/sales/ and shows the receipt on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(await screen.findByText("#S-841")).toBeInTheDocument();
    // By default the whole total is one cash payment.
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/sales/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          items: [{ product: 1, quantity: 1 }],
          payments: [{ method: "cash", amount: "145000.00" }],
        }),
      })
    );
  });

  it("sends a split payment with its MoMo reference", async () => {
    const fetchMock = routeFetch({ sale: () => ({ ok: true, body: saleBody() }) });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    const cashAmount = screen.getByLabelText("Payment 1 amount");
    await userEvent.clear(cashAmount);
    await userEvent.type(cashAmount, "100000");
    await userEvent.click(screen.getByRole("button", { name: "+ Split payment" }));
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Payment 2 reference"), "MP555");
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("#S-842")).toBeInTheDocument();
    const body = JSON.parse(String(saleCalls(fetchMock)[0][1].body));
    expect(body.payments).toEqual([
      { method: "cash", amount: "100000.00" },
      { method: "mobile_money", amount: "45000.00", reference: "MP555" },
    ]);
  });

  it("holds an underpaid sale until a customer is chosen", async () => {
    routeFetch({});
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    const cashAmount = screen.getByLabelText("Payment 1 amount");
    await userEvent.clear(cashAmount);
    await userEvent.type(cashAmount, "45000");
    expect(screen.getByText("Remaining on credit").nextSibling).toHaveTextContent("RWF 100,000");
    expect(screen.getByText(/Choose a customer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
  });

  it("asks for a manager PIN when the server says approval is needed, then resends with it", async () => {
    let attempt = 0;
    const fetchMock = routeFetch({
      priceCheck: {
        max_staff_discount_pct: "10.00",
        lines: [{ index: 0, product: 1, rule: "needs_approval", discount_pct: "20.00", needs_approval: true, needs_note: false }],
      },
      sale: () => {
        attempt += 1;
        return attempt === 1
          ? { ok: false, body: { detail: "Approval refused: wrong approver or PIN.", code: "approval_refused" } }
          : { ok: true, body: saleBody({ sale_id: 843 }) };
      },
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    await typePrice("116000");
    // Rendered by both the desktop table and the tablet cards.
    expect((await screen.findAllByText("Needs manager approval")).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(screen.getByRole("heading", { name: "Manager approval" })).toBeInTheDocument();
    expect(saleCalls(fetchMock)).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Manager username"), "manager1");
    await userEvent.type(screen.getByLabelText("PIN"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Approval refused: wrong approver or PIN.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("#S-843")).toBeInTheDocument();
    const lastBody = JSON.parse(String(saleCalls(fetchMock)[1][1].body));
    expect(lastBody.approval).toEqual({ approver_username: "manager1", pin: "0000" });
  });

  it("opens the PIN dialog when the sale comes back approval_required", async () => {
    routeFetch({
      sale: () => ({ ok: false, body: { detail: "This sale takes the customer over their credit limit — needs manager approval.", code: "approval_required" } }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText(/over their credit limit/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Manager approval" })).toBeInTheDocument();
  });

  it("requires a note on a below-floor line before completing", async () => {
    routeFetch({
      priceCheck: {
        max_staff_discount_pct: "10.00",
        lines: [{ index: 0, product: 1, rule: "below_floor", discount_pct: "50.00", needs_approval: false, needs_note: true }],
      },
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    await typePrice("72500");
    expect(await screen.findByText("Add a note for each line below the minimum price.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    await userEvent.type(screen.getAllByLabelText("Price note")[0], "Display unit");
    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
  });

  it("lets the cashier change a line price: totals, discount line, and payload follow", async () => {
    const fetchMock = routeFetch({
      sale: () => ({
        ok: true,
        body: saleBody({
          total_amount: "120000.00",
          items: [
            { sale_item_id: 1, sale: 842, product: 1, quantity: 1, unit_price: "120000.00", list_price: "145000.00", subtotal: "120000.00", tax_category: "B", tax_amount: "18305.08" },
          ],
        }),
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-AUD-00147{Enter}");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("120000");

    expect(screen.getByText("Discount vs catalog")).toBeInTheDocument();
    expect(screen.getByText("− RWF 25,000")).toBeInTheDocument();
    expect(screen.getAllByText("RWF 120,000").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByText("#S-842")).toBeInTheDocument();
    expect(JSON.parse(String(saleCalls(fetchMock)[0][1].body))).toEqual({
      items: [{ product: 1, quantity: 1, unit_price: "120000.00" }],
      payments: [{ method: "cash", amount: "120000.00" }],
    });
  });

  it("shows a markup line when a price is raised above the catalog price", async () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-AUD-00147{Enter}");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("150000");

    expect(screen.getByText("Markup vs catalog")).toBeInTheDocument();
    expect(screen.getByText("+ RWF 5,000")).toBeInTheDocument();
  });

  it("holds Complete sale until a product with no catalog price is given one", async () => {
    const unpriced = { ...jbl, product_id: 2, barcode: "PES-NEW-00001", name: "Unpriced Gadget", retail_price: 0 };
    vi.spyOn(usePosCatalogModule, "usePosCatalog").mockReturnValue({
      all: [unpriced],
      byBarcode: new Map([[unpriced.barcode, unpriced]]),
      isLoading: false,
      isError: false,
    } as PosCatalog);
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "PES-NEW-00001{Enter}");

    expect(screen.getByRole("button", { name: "Complete sale" })).toBeDisabled();
    expect(screen.getByText(/Set a price for/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Unpriced Gadget" })).toHaveAttribute("href", "/products/2");

    const priceInput = screen.getAllByLabelText("Unit price")[0] as HTMLInputElement;
    priceInput.focus();
    await userEvent.keyboard("{Control>}a{/Control}");
    await userEvent.keyboard("5000");

    expect(screen.getByRole("button", { name: "Complete sale" })).toBeEnabled();
    expect(screen.queryByText(/Set a price for/)).not.toBeInTheDocument();
  });

  it("invalidates the inventory and pricing queries after a successful sale", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
      }),
    });
    const { queryClient } = renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    await screen.findByText("#S-841");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["inventory"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["product-pricing", "current"] });
  });

  it("shows an error toast and keeps the cart when the sale submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: ["Insufficient stock for product 1: requested 1, available 0."],
        code: "invalid",
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);

    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

    expect(
      await screen.findByText("Insufficient stock for product 1: requested 1, available 0.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("JBL Flip 6 Speaker").length).toBeGreaterThan(0);
  });

  it("calls window.print when Print receipt is clicked on the receipt view", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "Print receipt" }));

    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("returns to an empty cart when New sale is clicked from the receipt", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sale_id: 841, customer: null, employee: 1, sale_date: "2026-08-23T14:14:00Z",
        payment_method: "cash", total_amount: "145000.00", status: "completed",
        items: [
          { sale_item_id: 1, sale: 841, product: 1, quantity: 1, unit_price: "145000.00", subtotal: "145000.00" },
        ],
      }),
    });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await userEvent.type(
      screen.getByLabelText("Scan barcode or search product"),
      "PES-AUD-00147{Enter}"
    );
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    await screen.findByText("#S-841");

    await userEvent.click(screen.getByRole("button", { name: "New sale" }));

    expect(screen.getByLabelText("Scan barcode or search product")).toBeInTheDocument();
    expect(screen.queryByText("JBL Flip 6 Speaker")).not.toBeInTheDocument();
  });

  it("puts the sale under a New sale page heading", () => {
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    expect(screen.getByRole("heading", { name: "New sale" })).toBeInTheDocument();
  });

  it("celebrates a completed sale with a check mark above the receipt", async () => {
    routeFetch({ sale: () => ({ ok: true, body: saleBody() }) });
    renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
    await scanJbl();
    await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));
    expect(await screen.findByRole("img", { name: "Sale completed" })).toBeInTheDocument();
    expect(screen.getByText("#S-842")).toBeInTheDocument();
  });

  describe("on a phone", () => {
    beforeEach(() => setMatchMedia({ desktop: false }));

    it("shows the cart as cards with a sticky pay bar, and pays from a sheet", async () => {
      const fetchMock = routeFetch({ sale: () => ({ ok: true, body: saleBody() }) });
      renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
      expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();

      await scanJbl();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(screen.getAllByLabelText("Unit price")).toHaveLength(1);
      const bar = screen.getByRole("region", { name: "Sale total" });
      expect(bar).toHaveTextContent("1 item");
      expect(bar).toHaveTextContent("RWF 145,000");
      // Payment, customer and Complete sale live in the pay sheet, not on the page.
      expect(screen.queryByRole("button", { name: "Complete sale" })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /Pay/ }));
      const sheet = await screen.findByRole("dialog");
      expect(sheet).toHaveAttribute("data-variant", "sheet");
      await userEvent.click(screen.getByRole("button", { name: "Complete sale" }));

      expect(await screen.findByText("#S-842")).toBeInTheDocument();
      expect(saleCalls(fetchMock)).toHaveLength(1);
    });

    it("sits on the tab bar, and drops to the edge when the tab bar slides away", async () => {
      routeFetch({});
      const offset = vi.spyOn(chromeModule, "useStickyBottomOffset").mockReturnValue(64);
      renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
      await scanJbl();
      expect(screen.getByRole("region", { name: "Sale total" }).style.bottom).toBe(
        "calc(64px + env(safe-area-inset-bottom))"
      );
      offset.mockReturnValue(0);
      await scanJbl(); // any re-render picks up the new offset
      expect(screen.getByRole("region", { name: "Sale total" }).style.bottom).toBe(
        "calc(0px + env(safe-area-inset-bottom))"
      );
      offset.mockRestore();
    });

    it("counts items in the pay bar", async () => {
      routeFetch({});
      renderWithProviders(<PosCheckout servedBy="e.mugisha" />);
      await scanJbl();
      await scanJbl();
      expect(screen.getByRole("region", { name: "Sale total" })).toHaveTextContent("2 items");
    });
  });
});
