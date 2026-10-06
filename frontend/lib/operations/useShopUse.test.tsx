import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { consumptionsQuery, useConsumeStock, useShopAssets, useApprovalFlow } from "./useShopUse";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  function wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { wrapper, invalidateSpy };
}

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body });
}

afterEach(() => vi.unstubAllGlobals());

describe("consumptionsQuery", () => {
  it("only sends the filters that are set", () => {
    expect(consumptionsQuery({ from: "2026-10-01", to: "", product: 4, purpose: "", taken_by: null }))
      .toBe("from=2026-10-01&product=4&page_size=500");
  });
});

describe("useShopAssets", () => {
  it("loads assets with filters", async () => {
    const fetchMock = vi.fn((url: string) => {
      expect(url).toBe("/api/proxy/operations/assets/?status=in_service&location=Office&page_size=500");
      return respond({ count: 1, next: null, previous: null, results: [{ asset_id: 1, name: "Printer" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useShopAssets({ status: "in_service", location: "Office" }), { wrapper });
    await waitFor(() => expect(result.current.assets).toHaveLength(1));
  });
});

describe("useConsumeStock", () => {
  it("POSTs and refreshes stock, ledger and shop-use views", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond({ consumption_id: 5 }, 201)));
    const { wrapper, invalidateSpy } = makeWrapper();
    const { result } = renderHook(() => useConsumeStock(), { wrapper });
    await act(() => result.current.mutateAsync({ product: 3, quantity: 1, purpose: "repair", reason: "x" }));

    const keys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    for (const key of [["inventory"], ["stock-movements"], ["consumptions"], ["shop-assets"]]) {
      expect(keys).toContainEqual(key);
    }
  });
});

describe("useApprovalFlow", () => {
  it("asks for approval on approval_required, then retries with the PIN", async () => {
    const { ApiError } = await import("@/lib/api-client");
    const action = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(400, { detail: "Needs manager approval.", code: "approval_required" }))
      .mockResolvedValueOnce("done");
    const onDone = vi.fn();
    const onError = vi.fn();

    const { result } = renderHook(() => useApprovalFlow());
    await act(() => result.current.run(action, onDone, onError));
    expect(result.current.prompt?.reason).toBe("Needs manager approval.");
    expect(onDone).not.toHaveBeenCalled();

    await act(() => result.current.approve({ approver_username: "manager1", pin: "4321" }));
    expect(action).toHaveBeenLastCalledWith({ approver_username: "manager1", pin: "4321" });
    expect(onDone).toHaveBeenCalledWith("done");
    expect(result.current.prompt).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the message when the PIN is wrong", async () => {
    const { ApiError } = await import("@/lib/api-client");
    const action = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(400, { detail: "Needs manager approval.", code: "approval_required" }))
      .mockRejectedValueOnce(new ApiError(400, { detail: "Approval refused: wrong approver or PIN.", code: "approval_refused" }));
    const { result } = renderHook(() => useApprovalFlow());
    await act(() => result.current.run(action, vi.fn(), vi.fn()));
    await act(() => result.current.approve({ approver_username: "manager1", pin: "0000" }));
    expect(result.current.prompt?.error).toBe("Approval refused: wrong approver or PIN.");
  });

  it("reports other errors and closes nothing it didn't open", async () => {
    const { ApiError } = await import("@/lib/api-client");
    const action = vi.fn().mockRejectedValueOnce(new ApiError(400, { detail: "Not enough stock." }));
    const onError = vi.fn();
    const { result } = renderHook(() => useApprovalFlow());
    await act(() => result.current.run(action, vi.fn(), onError));
    expect(onError).toHaveBeenCalledWith("Not enough stock.");
    expect(result.current.prompt).toBeNull();
  });
});
