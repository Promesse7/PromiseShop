import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import CustomersPageClient from "./CustomersPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CustomersPageClient />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("CustomersPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/customers/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { customer_id: 1, name: "Grace Mukamana", phone: "+250781234567", email: "grace.m@gmail.com", address: null },
                { customer_id: 2, name: "Eric Nsengimana", phone: "+250721234567", email: null, address: null },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("renders the fetched customers and the walk-in note", async () => {
    renderPage();
    expect(await screen.findByText("Grace Mukamana")).toBeInTheDocument();
    expect(screen.getByText("Eric Nsengimana")).toBeInTheDocument();
    expect(screen.getByText(/Walk-in sales need no customer record/)).toBeInTheDocument();
  });

  it("filters by name or phone", async () => {
    renderPage();
    await screen.findByText("Grace Mukamana");
    await userEvent.type(screen.getByLabelText("Search customers"), "Eric");
    expect(screen.queryByText("Grace Mukamana")).not.toBeInTheDocument();
    expect(screen.getByText("Eric Nsengimana")).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled when Edit is clicked", async () => {
    renderPage();
    await screen.findByText("Grace Mukamana");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Grace Mukamana"));
  });
});
