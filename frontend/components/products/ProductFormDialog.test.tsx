import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProductFormDialog } from "./ProductFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Category, Product } from "@/lib/types";

const categories: Category[] = [
  { category_id: 20, name: "Audio", code: "AUD", description: null },
  { category_id: 10, name: "Televisions", code: "TV", description: null },
];

const existingProduct: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: null, usage_instructions: null,
  warranty_months: 12, reorder_level: 4, unit: "pcs", is_active: true, created_at: "2026-01-01T00:00:00Z",
};

function renderWithToast(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

describe("ProductFormDialog", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not render when closed", () => {
    renderWithToast(
      <ProductFormDialog open={false} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(screen.queryByText("New product")).not.toBeInTheDocument();
  });

  it("shows a category select and no storage location field in create mode", () => {
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.queryByLabelText("Storage location")).not.toBeInTheDocument();
  });

  it("pre-fills fields and disables category in edit mode", () => {
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation="Shelf B2" onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    expect(screen.getByDisplayValue("JBL Flip 6")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(screen.getByLabelText("Storage location")).toHaveValue("Shelf B2");
  });

  it("omits storage location in edit mode when the product has no inventory row yet", () => {
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    expect(screen.queryByLabelText("Storage location")).not.toBeInTheDocument();
  });

  it("shows a validation error and does not submit when name is blank", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => existingProduct });
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Name is required.")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts to /api/proxy/products/ and calls onSaved on successful create", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...existingProduct, product_id: 5 }),
    });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText("Name"), "New Widget");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/proxy/products/");
    expect(options).toEqual(expect.objectContaining({ method: "POST" }));
    // Compare the parsed body rather than the raw JSON string: buildProductPayload
    // (Task 3, already reviewed) does not guarantee a particular key order.
    expect(JSON.parse(options.body as string)).toEqual({
      name: "New Widget", category: 20, brand: null, model_number: null,
      description: null, specifications: null, usage_instructions: null,
    });
  });

  it("patches /api/proxy/products/:id/ on successful edit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => existingProduct });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={onSaved}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaved).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith("/api/proxy/products/1/", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows an error toast and keeps the dialog open when submission fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false, status: 400, json: async () => ({ detail: { name: ["This field may not be blank."] } }),
    });
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This field may not be blank.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("JBL Flip 6")).toBeInTheDocument();
  });

  it("sends a PATCH to inventory/:id/ with the new storage location after a successful edit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => existingProduct })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ inventory_id: 9, storage_location: "Shelf C1" }) });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation="Shelf B2" inventoryId={9} onClose={vi.fn()} onSaved={onSaved}
      />
    );
    const storageInput = screen.getByLabelText("Storage location");
    await userEvent.clear(storageInput);
    await userEvent.type(storageInput, "Shelf C1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/api/proxy/products/1/", expect.objectContaining({ method: "PATCH" }));
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/proxy/inventory/9/",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ storage_location: "Shelf C1" }) })
    );
  });
});
