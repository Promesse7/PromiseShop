import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPageClient from "./SettingsPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

const profile = {
  business_name: "Promise Electronic Shop", tin: "123", po_box: null, phone: "0788", email: null, address: "Kigali",
  max_staff_discount_pct: "10.00",
};

function renderPage(isAdmin = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SettingsPageClient isAdmin={isAdmin} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("SettingsPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => profile })));
  });

  it("is admin only", () => {
    renderPage(false);
    expect(screen.getByText("This screen is limited to Admin accounts.")).toBeInTheDocument();
  });

  it("edits the staff discount limit and saves the profile", async () => {
    renderPage();
    const pct = await screen.findByLabelText("Most a cashier may discount alone (%)");
    expect(pct).toHaveValue(10);
    await userEvent.clear(pct);
    await userEvent.type(pct, "15");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/shop-profile/",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          business_name: "Promise Electronic Shop", tin: "123", po_box: null, phone: "0788", email: null,
          address: "Kigali", max_staff_discount_pct: "15.00",
          alert_discount_spike_ratio: "2.00", alert_overdue_days: "60", alert_cash_variance: "5000.00",
          alert_below_cost_count: "3", alert_below_cost_days: "7", alert_asset_replacements: "2",
          alert_asset_window_days: "90", alert_billing_diff_pct: "2.00", alert_top_sellers: "20",
        }),
      })
    );
  });

  it("edits a dashboard alert threshold and refuses a negative one", async () => {
    renderPage();
    const days = await screen.findByLabelText("Customer debt overdue more than (days)");
    await userEvent.clear(days);
    await userEvent.type(days, "45");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/proxy/shop-profile/",
      expect.objectContaining({ body: expect.stringContaining('"alert_overdue_days":"45"') })
    );
    await userEvent.clear(days);
    await userEvent.type(days, "-1");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText(/must be a number of 0 or more/)).toBeInTheDocument();
  });

  it("refuses a limit above 100%", async () => {
    renderPage();
    const pct = await screen.findByLabelText("Most a cashier may discount alone (%)");
    await userEvent.clear(pct);
    await userEvent.type(pct, "150");
    await userEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByText("The staff discount limit must be between 0 and 100%.")).toBeInTheDocument();
  });
});
