import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import ImportPageClient from "./ImportPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import type { ImportResult } from "@/lib/types";

const dryRun: ImportResult = {
  dry_run: true,
  summary: { rows: 3, valid: 2, errors: 0, skipped: 1, new_categories: ["TV"] },
  rows: [
    { line: 2, status: "valid", name: "JBL Flip 6", category_code: "AUD", barcode: null, opening_qty: 8, errors: {}, match: null },
    { line: 3, status: "valid", name: "Samsung TV", category_code: "TV", barcode: "600123", opening_qty: 2, errors: {}, match: null },
    { line: 4, status: "skip", name: "Boya Mic", category_code: "AUD", barcode: null, opening_qty: 1, errors: {}, match: { product_id: 9, name: "Boya Mic" } },
  ],
};

const withErrors: ImportResult = {
  dry_run: true,
  summary: { rows: 1, valid: 0, errors: 1, skipped: 0, new_categories: [] },
  rows: [{ line: 2, status: "error", name: "Bad", category_code: "AUD", barcode: null, opening_qty: null, errors: { retail_price: "Must be a number." }, match: null }],
};

let posts: Array<{ csv: string; commit: boolean }>;
let respond: (body: { csv: string; commit: boolean }) => unknown;

function renderPage(isAdmin = true) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <ImportPageClient isAdmin={isAdmin} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function chooseFile(text = "category_code,name\nAUD,X\n") {
  const file = new File([text], "stock.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText("CSV file"), file);
}

describe("ImportPageClient", () => {
  beforeEach(() => {
    posts = [];
    respond = (body) => ({ ok: true, status: 200, json: async () => (body.commit ? { ...dryRun, dry_run: false, summary: { ...dryRun.summary, created: 2 } } : dryRun) });
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, options?: RequestInit) => {
        if (url.includes("/template/")) {
          return Promise.resolve({ ok: true, json: async () => ({ filename: "t.csv", columns: [], csv: "a,b\n" }) });
        }
        if (url.includes("/setup/import-products/")) {
          const body = JSON.parse(options?.body as string);
          posts.push(body);
          return Promise.resolve(respond(body));
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("is admin only", () => {
    renderPage(false);
    expect(screen.getByText("Importing products is limited to Admin accounts.")).toBeInTheDocument();
  });

  it("runs a dry run first and shows ready, skipped and new-category rows", async () => {
    renderPage();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));

    expect(await screen.findByText(/3 rows · 2 ready · 0 with errors · 1 skipped/)).toBeInTheDocument();
    expect(screen.getByText(/new categories: TV/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Boya Mic" })).toHaveAttribute("href", "/products/9");
    expect(posts).toEqual([{ csv: "category_code,name\nAUD,X\n", commit: false }]);
  });

  it("commits only after a clean dry run, then shows what was imported", async () => {
    renderPage();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    const confirm = await screen.findByRole("dialog", { name: "Import 2 products?" });
    expect(within(confirm).getByText(/can't be undone/)).toBeInTheDocument();
    expect(posts.map((p) => p.commit)).toEqual([false]);
    await userEvent.click(within(confirm).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(posts.map((p) => p.commit)).toEqual([false, true]));
    expect(await screen.findByText(/2 imported/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Import \d+ products/ })).not.toBeInTheDocument();
  });

  it("blocks the import while any row has an error", async () => {
    respond = () => ({ ok: true, status: 200, json: async () => withErrors });
    renderPage();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));

    expect(await screen.findByText("retail price: Must be a number.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 0 products" })).toBeDisabled();
  });

  it("shows a file-level error such as a missing column", async () => {
    respond = () => ({ ok: false, status: 400, json: async () => ({ detail: "Missing column(s): cost_price." }) });
    renderPage();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));
    expect(await screen.findByText("Missing column(s): cost_price.")).toBeInTheDocument();
  });

  it("downloads the template", async () => {
    const createObjectURL = vi.fn(() => "blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Download CSV template" }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(click).toHaveBeenCalled();
  });

  it("cancelling the confirmation imports nothing", async () => {
    renderPage();
    await chooseFile();
    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Import 2 products" }));
    const confirm = await screen.findByRole("dialog", { name: "Import 2 products?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(posts.map((p) => p.commit)).toEqual([false]);
  });

  it("uses the page template and shows the steps, moving the current step along", async () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Setup" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Import steps" });
    const current = () => within(steps).getByText((_, el) => el?.getAttribute("aria-current") === "step");
    expect(current()).toHaveTextContent("Get the template");

    await chooseFile();
    expect(current()).toHaveTextContent("Check the file");

    await userEvent.click(screen.getByRole("button", { name: "Check file (dry run)" }));
    await screen.findByText(/3 rows · 2 ready/);
    expect(current()).toHaveTextContent("Review and import");
  });
});
