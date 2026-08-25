import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import SuppliersPageClient from "./SuppliersPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <SuppliersPageClient />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("SuppliersPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/suppliers/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { supplier_id: 1, name: "Kigali Electronics Ltd", contact_person: "J. Habimana", phone: "111", email: "a@b.com", address: "Kigali" },
                { supplier_id: 2, name: "Dubai Traders FZE", contact_person: "M. Rashid", phone: "222", email: "c@d.com", address: "Dubai" },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("renders the fetched suppliers", async () => {
    renderPage();
    expect(await screen.findByText("Kigali Electronics Ltd")).toBeInTheDocument();
    expect(screen.getByText("Dubai Traders FZE")).toBeInTheDocument();
  });

  it("filters by search text across name, contact, phone, and email", async () => {
    renderPage();
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.type(screen.getByLabelText("Search suppliers"), "Dubai");
    expect(screen.queryByText("Kigali Electronics Ltd")).not.toBeInTheDocument();
    expect(screen.getByText("Dubai Traders FZE")).toBeInTheDocument();
  });

  it("opens the create dialog from the toolbar button", async () => {
    renderPage();
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.click(screen.getByRole("button", { name: "+ New supplier" }));
    expect(await screen.findByText("New supplier")).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled when Edit is clicked", async () => {
    renderPage();
    await screen.findByText("Kigali Electronics Ltd");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveValue("Kigali Electronics Ltd"));
  });
});
