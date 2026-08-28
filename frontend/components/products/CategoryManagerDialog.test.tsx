import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CategoryManagerDialog } from "./CategoryManagerDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Category } from "@/lib/types";

const categories: Category[] = [
  { category_id: 10, name: "Televisions", code: "TV", description: null },
  { category_id: 20, name: "Audio", code: "AUD", description: null },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
  return { ...utils, invalidateSpy };
}

describe("CategoryManagerDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not render when closed", () => {
    renderWithProviders(<CategoryManagerDialog open={false} categories={categories} onClose={vi.fn()} />);
    expect(screen.queryByText("Manage categories")).not.toBeInTheDocument();
  });

  it("lists each category's name and code with a Delete button", () => {
    renderWithProviders(<CategoryManagerDialog open={true} categories={categories} onClose={vi.fn()} />);
    expect(screen.getByText("Televisions")).toBeInTheDocument();
    expect(screen.getByText("TV")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(screen.getByText("AUD")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Delete" })).toHaveLength(2);
  });

  it("shows an empty state when there are no categories", () => {
    renderWithProviders(<CategoryManagerDialog open={true} categories={[]} onClose={vi.fn()} />);
    expect(screen.getByText("No categories yet.")).toBeInTheDocument();
  });

  it("deletes a category, invalidates categories, and shows a success toast", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    const { invalidateSpy } = renderWithProviders(
      <CategoryManagerDialog open={true} categories={categories} onClose={vi.fn()} />
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(await screen.findByText("Category deleted.")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/api/proxy/categories/10/", expect.objectContaining({ method: "DELETE" }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["categories"] });
  });

  it("shows the backend error via extractErrorMessage when delete is blocked by existing products", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        detail: "This category still has products assigned to it and cannot be deleted.",
        code: "category_has_products",
      }),
    });
    renderWithProviders(<CategoryManagerDialog open={true} categories={categories} onClose={vi.fn()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);

    expect(
      await screen.findByText("This category still has products assigned to it and cannot be deleted.")
    ).toBeInTheDocument();
  });
});
