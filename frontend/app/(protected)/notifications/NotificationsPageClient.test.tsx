import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NotificationsPageClient from "./NotificationsPageClient";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

describe("NotificationsPageClient", () => {
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
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("shows an admin-only message and does not fetch for non-admin roles", () => {
    render(<NotificationsPageClient role="manager" />, { wrapper });
    expect(screen.getByText(/only available to Admin accounts/)).toBeInTheDocument();
  });

  it("shows the full notification log for admin", async () => {
    render(<NotificationsPageClient role="admin" />, { wrapper });
    await waitFor(() => expect(screen.getByText("New sale — Sale #S-841")).toBeInTheDocument());
    expect(screen.getByText("New sale — Sale #S-839")).toBeInTheDocument();
  });

  it("filters to only failed notifications when the Failed tab is selected", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<NotificationsPageClient role="admin" />, { wrapper });
    await waitFor(() => expect(screen.getByText("New sale — Sale #S-841")).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: "Failed" }));

    expect(screen.queryByText("New sale — Sale #S-841")).not.toBeInTheDocument();
    expect(screen.getByText("New sale — Sale #S-839")).toBeInTheDocument();
  });
});
