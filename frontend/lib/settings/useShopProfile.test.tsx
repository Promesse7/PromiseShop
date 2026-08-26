import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useShopProfile } from "./useShopProfile";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useShopProfile", () => {
  it("fetches and exposes the shop profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            business_name: "Promise Electronic Shop",
            tin: "123456789",
            po_box: "PO Box 1",
            phone: "+250700000000",
            email: "shop@example.com",
            address: "Kigali, Rwanda",
          }),
        })
      )
    );
    const { result } = renderHook(() => useShopProfile(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data?.business_name).toBe("Promise Electronic Shop");
    expect(result.current.isError).toBe(false);
  });
});
