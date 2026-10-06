import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplaceAssetWizard } from "./ReplaceAssetWizard";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { ShopAsset } from "@/lib/types";

const asset: ShopAsset = {
  asset_id: 7, name: "Office printer", product: 3, product_name: "Laser Printer", product_barcode: "PES-ACC-00002",
  equipment_unit: null, serial: null, status: "in_service", status_label: "In service", location: "Office",
  assigned_to: null, assigned_to_name: null, source: "from_stock", acquired_at: "2026-10-06",
  is_spare: false, replaces: null, replaces_name: null, notes: "", created_by: 1, created_by_name: "Admin",
  created_at: "2026-10-06T08:00:00Z",
};

const spare: ShopAsset = { ...asset, asset_id: 9, name: "Spare printer", is_spare: true, location: "Store" };

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function renderWizard(onDone = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ReplaceAssetWizard open asset={asset} onClose={vi.fn()} onDone={onDone} />
      </ToastProvider>
    </QueryClientProvider>
  );
  return onDone;
}

afterEach(() => vi.unstubAllGlobals());

async function walkToSource() {
  await userEvent.type(screen.getByLabelText("What happened?"), "Fuser burnt out");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByLabelText("Retired"));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("ReplaceAssetWizard", () => {
  it("replaces from stock with the asset's own product by default", async () => {
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return respond({ ...asset, asset_id: 12 }, 201);
      }
      return respond({ results: [] });
    }));
    const onDone = renderWizard();

    await walkToSource();
    expect(screen.getByText("Chosen: Laser Printer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Take one Laser Printer from stock.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(12));
    expect(posts[0].url).toBe("/api/proxy/operations/assets/7/replace/");
    expect(posts[0].body).toMatchObject({ new_status: "retired", reason: "Fuser burnt out", replacement_product: 3 });
  });

  it("can bring a spare into service instead", async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return respond(spare, 201);
      }
      return respond({ count: 1, next: null, previous: null, results: [spare] });
    }));
    renderWizard();

    await walkToSource();
    await userEvent.click(screen.getByLabelText("Spare asset"));
    await userEvent.click(await screen.findByLabelText(/Spare printer/));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ spare_asset: 9, replacement_product: null });
  });

  it("just changes the status when not replacing now", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") urls.push(url);
      return respond(asset);
    }));
    const onDone = renderWizard();

    await walkToSource();
    await userEvent.click(screen.getByLabelText("Not now"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(null));
    expect(urls).toEqual(["/api/proxy/operations/assets/7/status/"]);
  });

  it("needs a reason before moving on", () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ results: [] })));
    renderWizard();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
