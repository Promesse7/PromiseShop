import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShopUsePageClient from "./ShopUsePageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { EmployeeRole, InternalConsumption, ShopAsset } from "@/lib/types";

const asset: ShopAsset = {
  asset_id: 7, name: "Office printer", product: 3, product_name: "Laser Printer", product_barcode: "PES-ACC-00002",
  equipment_unit: null, serial: "SN-1", status: "in_service", status_label: "In service", location: "Office",
  assigned_to: 2, assigned_to_name: "Aline", source: "from_stock", acquired_at: "2026-10-06",
  acquisition_value: "200000.00", is_spare: false, replaces: null, replaces_name: null, notes: "",
  created_by: 1, created_by_name: "Admin", created_at: "2026-10-06T08:00:00Z",
};

const consumption: InternalConsumption = {
  consumption_id: 1, product: 4, product_name: "HDMI Cable", product_barcode: "PES-ACC-00001", quantity: 2,
  unit_cost: "2000.00", total_value: "4000.00", purpose: "repair", reason: "Till cable", taken_by: 2,
  taken_by_name: "Aline", recorded_by: 1, recorded_by_name: "Admin", approved_by: null, approved_by_name: null,
  shop_asset: 7, shop_asset_name: "Office printer", created_at: "2026-10-06T08:00:00Z",
};

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    urls.push(url);
    const body = url.includes("operations/assets")
      ? page([asset])
      : url.includes("operations/consumptions")
        ? page([consumption])
        : page([]);
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }));
});

afterEach(() => vi.unstubAllGlobals());

function renderPage(role: EmployeeRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ShopUsePageClient role={role} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("ShopUsePageClient", () => {
  it("shows asset cards with value for a manager, and lets them register one", async () => {
    renderPage("manager");
    expect(await screen.findByText("Office printer")).toBeInTheDocument();
    expect(screen.getByText("With Aline")).toBeInTheDocument();
    expect(screen.getByText("RWF 200,000")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Register asset" }));
    expect(screen.getByRole("heading", { name: "Register shop asset" })).toBeInTheDocument();
  });

  it("hides values and registration from staff", async () => {
    renderPage("sales_staff");
    expect(await screen.findByText("Office printer")).toBeInTheDocument();
    expect(screen.queryByText("RWF 200,000")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register asset" })).not.toBeInTheDocument();
  });

  it("filters assets by status through the API", async () => {
    renderPage("admin");
    await screen.findByText("Office printer");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "damaged");
    await waitFor(() => expect(urls.some((u) => u.includes("operations/assets/?status=damaged"))).toBe(true));
  });

  it("shows the consumption log with its value and what it fixed", async () => {
    renderPage("admin");
    await userEvent.click(screen.getByLabelText("Consumption log"));
    expect(await screen.findByText("HDMI Cable")).toBeInTheDocument();
    expect(screen.getByText("RWF 4,000")).toBeInTheDocument();
    expect(screen.getByText(/for Office printer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("filters the log by purpose", async () => {
    renderPage("admin");
    await userEvent.click(screen.getByLabelText("Consumption log"));
    await screen.findByText("HDMI Cable");
    await userEvent.selectOptions(screen.getByLabelText("Purpose"), "shop_setup");
    await waitFor(() => expect(urls.some((u) => u.includes("purpose=shop_setup"))).toBe(true));
  });
});
