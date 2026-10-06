import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import { CommandPalette } from "./CommandPalette";
import { setMatchMedia } from "@/lib/test/matchMedia";
import type { EmployeeRole } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: vi.fn(), usePathname: () => "/" }));

const push = vi.fn();

beforeEach(() => {
  push.mockReset();
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.includes("products/search")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ results: [{ product_id: 7, name: "JBL Flip 6", barcode: "PES-AUD-00007" }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ count: 0, next: null, results: [] }) });
    })
  );
});

function renderPalette(role: EmployeeRole = "admin", onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CommandPalette open onClose={onClose} role={role} />
    </QueryClientProvider>
  );
  return onClose;
}

describe("CommandPalette", () => {
  it("filters pages as you type and Enter jumps to the first match", async () => {
    const onClose = renderPalette();
    await userEvent.type(screen.getByRole("combobox", { name: "Search or jump to" }), "movem");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent("Movements");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/stock/movements");
    expect(onClose).toHaveBeenCalled();
  });

  it("arrow keys move the selection", async () => {
    renderPalette();
    const input = screen.getByRole("combobox", { name: "Search or jump to" });
    await userEvent.type(input, "s");
    const first = screen.getAllByRole("option")[0];
    expect(first).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("finds products through the search endpoint", async () => {
    renderPalette("sales_staff");
    await userEvent.type(screen.getByRole("combobox", { name: "Search or jump to" }), "flip");
    await waitFor(() => expect(screen.getByRole("option", { name: /JBL Flip 6/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("option", { name: /JBL Flip 6/ }));
    expect(push).toHaveBeenCalledWith("/products/7");
  });

  it("offers to open a sale by its number", async () => {
    renderPalette();
    await userEvent.type(screen.getByRole("combobox", { name: "Search or jump to" }), "#S-841");
    expect(screen.getByRole("option", { name: /Open sale #S-841/ })).toBeInTheDocument();
  });

  it("does not offer staff the pages they can't open", async () => {
    renderPalette("sales_staff");
    await userEvent.type(screen.getByRole("combobox", { name: "Search or jump to" }), "dash");
    expect(screen.queryByRole("option", { name: /Dashboard/ })).not.toBeInTheDocument();
  });

  it("is full screen on phone", () => {
    setMatchMedia({ desktop: false });
    renderPalette();
    expect(screen.getByRole("dialog", { name: "Jump search" }).className).toContain("inset-0");
  });
});
