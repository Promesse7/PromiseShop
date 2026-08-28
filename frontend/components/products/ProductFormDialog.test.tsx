import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProductFormDialog } from "./ProductFormDialog";
import { ToastProvider } from "@/components/layout/ToastProvider";
import type { Category, Product } from "@/lib/types";
import type { CatalogProduct } from "@/lib/products/useCatalogProducts";

const categories: Category[] = [
  { category_id: 20, name: "Audio", code: "AUD", description: null },
  { category_id: 10, name: "Televisions", code: "TV", description: null },
];

const existingProduct: Product = {
  product_id: 1, category: 20, barcode: "PES-AUD-00147", name: "JBL Flip 6", brand: "JBL",
  model_number: "JBLFLIP6BLK", description: null, specifications: null, usage_instructions: null,
  warranty_months: 12, reorder_level: 4, unit: "pcs", tax_category: "B", is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

function renderWithToast(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  );
  const rerenderWithToast = (nextUi: React.ReactElement) =>
    utils.rerender(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{nextUi}</ToastProvider>
      </QueryClientProvider>
    );
  return { ...utils, invalidateSpy, rerenderWithToast };
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

  it("shows a similar-product warning in create mode when the typed name matches an existing product", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Scales 60kg");
    expect(
      await screen.findByText("A similar product already exists: Scales 60kg (PES-SCL-00001)")
    ).toBeInTheDocument();
  });

  it("does not show the similar-product warning when there is no match", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Bluetooth Speaker");
    expect(screen.queryByText(/A similar product already exists/)).not.toBeInTheDocument();
  });

  it("does not show the similar-product warning in edit mode", async () => {
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="edit"
        categories={categories}
        initialProduct={existingProduct}
        initialStorageLocation={null}
        existingProducts={[
          { product_id: 99, name: "JBL Flip 6", brand: null, model_number: null, barcode: "PES-AUD-00099", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.queryByText(/A similar product already exists/)).not.toBeInTheDocument();
  });

  it("does not block submission when the warning is showing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...existingProduct, product_id: 5 }),
    });
    const onSaved = vi.fn();
    renderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={categories}
        existingProducts={[
          { product_id: 99, name: "Scales 60kg", brand: null, model_number: null, barcode: "PES-SCL-00001", category_id: 20, category_name: "Audio", retail_price: 5000, wholesale_price: null, quantity_in_stock: 3, reorder_level: 2, status: "ok", is_active: true },
        ]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    await userEvent.type(screen.getByLabelText("Name"), "Scales 60kg");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
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
    const { invalidateSpy } = renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={onSaved} />
    );
    await userEvent.type(screen.getByLabelText("Name"), "New Widget");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/proxy/products/");
    expect(options).toEqual(expect.objectContaining({ method: "POST" }));
    // Compare the parsed body rather than the raw JSON string: buildProductPayload
    // (Task 3, already reviewed) does not guarantee a particular key order.
    expect(JSON.parse(options.body as string)).toEqual({
      name: "New Widget", category: 20, brand: null, model_number: null,
      description: null, specifications: null, usage_instructions: null, tax_category: "B",
    });
  });

  it("patches /api/proxy/products/:id/ on successful edit", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => existingProduct });
    const onSaved = vi.fn();
    const { invalidateSpy } = renderWithToast(
      <ProductFormDialog
        open={true} mode="edit" categories={categories} initialProduct={existingProduct}
        initialStorageLocation={null} onClose={vi.fn()} onSaved={onSaved}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSaved).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith("/api/proxy/products/1/", expect.objectContaining({ method: "PATCH" }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
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
    const { invalidateSpy } = renderWithToast(
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
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["inventory"] });
  });

  it("reveals an inline sub-form when '+ Add new category…' is selected", async () => {
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    await userEvent.selectOptions(screen.getByLabelText("Category"), "__new__");
    expect(screen.getByLabelText("Category name")).toBeInTheDocument();
    expect(screen.getByLabelText("Category code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
  });

  it("cancels the inline category sub-form back to the normal select", async () => {
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    await userEvent.selectOptions(screen.getByLabelText("Category"), "__new__");
    // Two "Cancel" buttons are on screen once the sub-form is open (this one, and the
    // form's own Cancel-and-close); the sub-form's renders first in document order.
    await userEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]);
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
    expect(screen.queryByLabelText("Category name")).not.toBeInTheDocument();
  });

  it("posts to /api/proxy/categories/ from the inline sub-form and selects the new category on success", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ category_id: 30, name: "Cameras", code: "CAM", description: null }),
    });
    const onSaved = vi.fn();
    const { invalidateSpy, rerenderWithToast } = renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={onSaved} />
    );
    await userEvent.selectOptions(screen.getByLabelText("Category"), "__new__");
    await userEvent.type(screen.getByLabelText("Category name"), "Cameras");
    await userEvent.type(screen.getByLabelText("Category code"), "CAM");
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));

    await vi.waitFor(() => expect(screen.getByLabelText("Category")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/proxy/categories/");
    expect(options).toEqual(expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(options.body as string)).toEqual({ name: "Cameras", code: "CAM", description: null });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["categories"] });

    // In production, invalidating ["categories"] makes useCatalogProducts()'s live query refetch,
    // which flows a `categories` prop including the new category back down to this component —
    // simulate that parent re-render here to confirm the newly created category ends up selected.
    const newCategory: Category = { category_id: 30, name: "Cameras", code: "CAM", description: null };
    rerenderWithToast(
      <ProductFormDialog
        open={true}
        mode="create"
        categories={[...categories, newCategory]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    expect(screen.getByLabelText("Category")).toHaveValue("30");
  });

  it("shows inline field errors from the backend without leaving the sub-form", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: { name: ["category with this name already exists."] }, code: "invalid" }),
    });
    renderWithToast(
      <ProductFormDialog open={true} mode="create" categories={categories} onClose={vi.fn()} onSaved={vi.fn()} />
    );
    await userEvent.selectOptions(screen.getByLabelText("Category"), "__new__");
    await userEvent.type(screen.getByLabelText("Category name"), "Audio");
    await userEvent.type(screen.getByLabelText("Category code"), "AUD2");
    await userEvent.click(screen.getByRole("button", { name: "Add category" }));

    expect(await screen.findByText("category with this name already exists.")).toBeInTheDocument();
    expect(screen.getByLabelText("Category name")).toBeInTheDocument();
  });
});
