import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DuplicatesDialog } from "./DuplicatesDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { DuplicatePair } from "@/lib/types";

const pair: DuplicatePair = {
  a: { product_id: 1, name: "JBL Flip 6", barcode: "PES-AUD-00001", category_name: "Audio", is_active: true, in_stock: 5 },
  b: { product_id: 2, name: "JBL Flip6", barcode: "PES-AUD-00002", category_name: "Audio", is_active: true, in_stock: 3 },
  score: 0.82,
};

const counts = { sale_items: 1, purchase_items: 1, equipment_units: 0, price_rows: 1, barcode_aliases: 1, in_stock: 3, in_use: 0, damaged: 2 };

let merges: Array<{ url: string; body: unknown }>;
let previews: string[];

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DuplicatesDialog open onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("DuplicatesDialog", () => {
  beforeEach(() => {
    merges = [];
    previews = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/products/duplicates/")) {
          return Promise.resolve({ ok: true, json: async () => ({ results: [pair] }) });
        }
        if (url.includes("/merge/") && options?.method === "POST") {
          merges.push({ url, body: JSON.parse(options.body as string) });
          return Promise.resolve({ ok: true, status: 201, json: async () => ({ merge_id: 1, keep: 1, duplicate: 2, counts }) });
        }
        if (url.includes("/merge/")) {
          previews.push(url);
          const keep = url.includes("/products/1/") ? pair.a : pair.b;
          const duplicate = keep === pair.a ? pair.b : pair.a;
          return Promise.resolve({ ok: true, json: async () => ({ keep, duplicate, counts }) });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("lists likely duplicate pairs", async () => {
    renderDialog();
    expect(await screen.findByText("82% alike")).toBeInTheDocument();
    expect(screen.getByText("JBL Flip6")).toBeInTheDocument();
  });

  it("asks which product to keep, shows the counts and warns before merging", async () => {
    renderDialog();
    await userEvent.click(await screen.findByRole("button", { name: "Merge…" }));

    expect(await screen.findByText("2 damaged")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This can't be undone.");
    await userEvent.click(screen.getByLabelText("Keep JBL Flip6"));
    await waitFor(() => expect(previews.at(-1)).toContain("/products/2/merge/?duplicate=1"));

    await userEvent.click(screen.getByRole("button", { name: "Merge into JBL Flip6" }));
    expect(screen.getByText("Say why these are the same product.")).toBeInTheDocument();
    expect(merges).toHaveLength(0);

    await userEvent.type(screen.getByLabelText("Reason"), "Typed twice");
    await userEvent.click(screen.getByRole("button", { name: "Merge into JBL Flip6" }));
    await waitFor(() =>
      expect(merges).toEqual([{ url: "/api/proxy/products/2/merge/", body: { duplicate: 1, reason: "Typed twice" } }])
    );
  });
});
