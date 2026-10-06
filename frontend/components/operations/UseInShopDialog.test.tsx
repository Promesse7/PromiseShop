import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UseInShopDialog } from "./UseInShopDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

function renderDialog(inStock = 10) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <UseInShopDialog open product={{ product_id: 3, name: "HDMI Cable" }} inStock={inStock} onClose={vi.fn()} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

const empty = { count: 0, next: null, previous: null, results: [] };

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

describe("UseInShopDialog", () => {
  it("records a consumption", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return respond({ consumption_id: 1 }, 201);
      }
      return respond(empty);
    }));
    renderDialog();

    await userEvent.clear(screen.getByLabelText("Quantity"));
    await userEvent.type(screen.getByLabelText("Quantity"), "2");
    await userEvent.type(screen.getByLabelText("Reason"), "Till cable");
    await userEvent.click(screen.getByRole("button", { name: "Record use" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ product: 3, quantity: 2, purpose: "repair", reason: "Till cable" });
  });

  it("won't take more than is in stock", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(empty)));
    renderDialog(1);
    await userEvent.clear(screen.getByLabelText("Quantity"));
    await userEvent.type(screen.getByLabelText("Quantity"), "3");
    await userEvent.type(screen.getByLabelText("Reason"), "x");
    expect(screen.getByText("Only 1 in stock.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record use" })).toBeDisabled();
  });

  it("asks staff for a manager PIN and retries with it", async () => {
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        return body.approval
          ? respond({ consumption_id: 1 }, 201)
          : respond({ detail: "Needs manager approval.", code: "approval_required" }, 400);
      }
      return respond(empty);
    }));
    renderDialog();

    await userEvent.type(screen.getByLabelText("Reason"), "Till cable");
    await userEvent.click(screen.getByRole("button", { name: "Record use" }));
    expect(await screen.findByText("Needs manager approval.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Manager username"), "manager1");
    await userEvent.type(screen.getByLabelText("PIN"), "4321");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].approval).toEqual({ approver_username: "manager1", pin: "4321" });
  });

  it("makes a shop asset and opens it", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        expect(url).toBe("/api/proxy/operations/assets/from-stock/");
        return respond({ asset_id: 7, name: "HDMI Cable" }, 201);
      }
      return respond(empty);
    }));
    renderDialog();

    await userEvent.click(screen.getByLabelText("Make shop asset"));
    await userEvent.type(screen.getByLabelText("Location"), "Counter");
    await userEvent.type(screen.getByLabelText("Reason"), "Our own");
    await userEvent.click(screen.getByRole("button", { name: "Make shop asset" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/shop-use/assets/7"));
  });
});
