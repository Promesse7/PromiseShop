import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import EmployeesPageClient from "./EmployeesPageClient";
import { ToastProvider } from "@/components/layout/ToastProvider";

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function renderPage(isAdmin: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <EmployeesPageClient isAdmin={isAdmin} />
      </ToastProvider>
    </QueryClientProvider>
  );
}

describe("EmployeesPageClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/employees/")) {
          return Promise.resolve({
            ok: true,
            json: async () =>
              paginated([
                { employee_id: 1, full_name: "Alice Uwase", role: "admin", phone: "111", email: "a@b.com", username: "a.uwase", hire_date: "2023-01-15", status: "active", created_at: "2023-01-15T00:00:00Z" },
              ]),
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      })
    );
  });

  it("shows an admin-only notice and never fetches when not admin", () => {
    renderPage(false);
    expect(screen.getByText(/limited to Admin accounts/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("renders the fetched employees for an admin", async () => {
    renderPage(true);
    expect(await screen.findByText("Alice Uwase")).toBeInTheDocument();
    expect(screen.getByText("Admin only")).toBeInTheDocument();
  });

  it("opens the create dialog from the toolbar button", async () => {
    renderPage(true);
    await screen.findByText("Alice Uwase");
    await userEvent.click(screen.getByRole("button", { name: "+ New employee" }));
    expect(await screen.findByText("New employee")).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled when Edit is clicked", async () => {
    renderPage(true);
    await screen.findByText("Alice Uwase");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Full name")).toHaveValue("Alice Uwase"));
  });
});
