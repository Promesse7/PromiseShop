import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssetDetailPageClient from "./AssetDetailPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { EmployeeRole, ShopAsset, ShopAssetEvent } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

let asset: ShopAsset;

const events: ShopAssetEvent[] = [
  {
    event_id: 2, asset: 7, from_status: "in_service", to_status: "damaged", reason: "Fuser burnt", user: 1,
    user_name: "Admin", approved_by: null, approved_by_name: null, replaced_by: 12, replaced_by_name: "Office printer",
    consumption: null, created_at: "2026-10-06T10:00:00Z",
  },
  {
    event_id: 1, asset: 7, from_status: null, to_status: "in_service", reason: "Office printer", user: 1,
    user_name: "Admin", approved_by: 3, approved_by_name: "Manager One", replaced_by: null, replaced_by_name: null,
    consumption: null, created_at: "2026-10-01T10:00:00Z",
  },
];

const posts: { url: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  posts.length = 0;
  asset = {
    asset_id: 7, name: "Office printer", product: 3, product_name: "Laser Printer", product_barcode: "PES-ACC-00002",
    equipment_unit: null, serial: "SN-1", status: "in_service", status_label: "In service", location: "Office",
    assigned_to: null, assigned_to_name: null, source: "from_stock", acquired_at: "2026-10-01",
    acquisition_value: "200000.00", is_spare: false, replaces: null, replaces_name: null, notes: "",
    created_by: 1, created_by_name: "Admin", created_at: "2026-10-01T10:00:00Z",
  };
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve({ ok: true, status: 200, json: async () => asset });
    }
    const body = url.endsWith("/events/")
      ? events
      : url.includes("operations/consumptions")
        ? { count: 0, next: null, previous: null, results: [] }
        : asset;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }));
});

afterEach(() => vi.unstubAllGlobals());

function renderPage(role: EmployeeRole) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AssetDetailPageClient assetId={7} role={role} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("AssetDetailPageClient", () => {
  it("shows details, value and the timeline with replacement links for an admin", async () => {
    renderPage("admin");
    expect(await screen.findByRole("heading", { name: "Office printer" })).toBeInTheDocument();
    expect(screen.getByText("RWF 200,000")).toBeInTheDocument();
    expect(await screen.findByText("In service → Damaged")).toBeInTheDocument();
    expect(screen.getByText(/approved by Manager One/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Office printer" })).toHaveAttribute("href", "/shop-use/assets/12");
    expect(screen.getByRole("button", { name: "Return to stock" })).toBeInTheDocument();
  });

  it("gives staff only Report broken / Replace, and no value", async () => {
    renderPage("sales_staff");
    await screen.findByRole("heading", { name: "Office printer" });
    expect(screen.getByRole("button", { name: "Report broken / Replace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return to stock" })).not.toBeInTheDocument();
    expect(screen.queryByText("RWF 200,000")).not.toBeInTheDocument();
  });

  it("lets a manager change the status", async () => {
    renderPage("manager");
    await userEvent.click(await screen.findByRole("button", { name: "Change status" }));
    await userEvent.click(screen.getByLabelText("Under repair"));
    await userEvent.type(screen.getByLabelText("Reason"), "Paper jam");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      url: "/api/proxy/operations/assets/7/status/",
      body: { to_status: "under_repair", reason: "Paper jam" },
    });
  });

  it("lets an admin return it to damaged stock", async () => {
    renderPage("admin");
    await userEvent.click(await screen.findByRole("button", { name: "Return to stock" }));
    await userEvent.click(screen.getByLabelText("Damaged stock"));
    await userEvent.type(screen.getByLabelText("Reason"), "Beyond use");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posts[0]?.body).toEqual({ bucket: "damaged", reason: "Beyond use" }));
  });

  it("offers no actions on a retired asset", async () => {
    asset = { ...asset, status: "retired" };
    renderPage("admin");
    await screen.findByRole("heading", { name: "Office printer" });
    expect(screen.queryByRole("button", { name: "Report broken / Replace" })).not.toBeInTheDocument();
  });
});
