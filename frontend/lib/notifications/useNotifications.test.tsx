import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useNotifications } from "./useNotifications";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("useNotifications", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/notifications/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                {
                  notification_id: 1, type: "sale_alert", recipient: 1, related_sale: 841,
                  sent_at: "2026-08-23T14:14:00Z", status: "sent", read_at: null,
                },
                {
                  notification_id: 2, type: "sale_alert", recipient: 1, related_sale: 839,
                  sent_at: "2026-08-23T12:15:00Z", status: "failed", read_at: null,
                },
                {
                  notification_id: 3, type: "low_stock", recipient: 1, related_sale: null,
                  sent_at: "2026-08-22T17:30:00Z", status: "sent", read_at: "2026-08-22T18:00:00Z",
                },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("derives a sale-linked trigger and subject for sale-triggered notifications", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const row = result.current.all.find((n) => n.notification_id === 1);
    expect(row?.trigger).toBe("sale #S-841");
    expect(row?.subject).toBe("New sale — Sale #S-841");
  });

  it("derives a humanized trigger and subject for non-sale notifications", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const row = result.current.all.find((n) => n.notification_id === 3);
    expect(row?.trigger).toBe("low stock");
    expect(row?.subject).toBe("Low Stock alert");
  });

  it("preserves the underlying status and read_at fields", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const failed = result.current.all.find((n) => n.notification_id === 2);
    expect(failed?.status).toBe("failed");
    expect(failed?.read_at).toBeNull();

    const read = result.current.all.find((n) => n.notification_id === 3);
    expect(read?.read_at).toBe("2026-08-22T18:00:00Z");
  });

  it("orders notifications newest-first, matching the API's own ordering", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.all.map((n) => n.notification_id)).toEqual([1, 2, 3]);
  });
});
