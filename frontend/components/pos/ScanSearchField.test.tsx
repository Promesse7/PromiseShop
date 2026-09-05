import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ScanSearchField } from "./ScanSearchField";
import type { PosCatalog } from "@/lib/pos/usePosCatalog";
import type { PosProduct } from "@/lib/types";

const jbl: PosProduct = {
  product_id: 1, barcode: "PES-AUD-00147", name: "JBL Flip 6 Speaker", brand: "JBL",
  model_number: "JBLFLIP6BLK", category_name: "Audio", retail_price: 145000, quantity_in_stock: 2,
};

const scales60: PosProduct = {
  product_id: 2, barcode: "PES-SCL-00060", name: "Scales 60kg", brand: "Camry",
  model_number: "SC60", category_name: "Home", retail_price: 12000, quantity_in_stock: 5,
};

const scales300: PosProduct = {
  product_id: 3, barcode: "PES-SCL-00300", name: "Scales 300kg", brand: "Camry",
  model_number: "SC300", category_name: "Home", retail_price: 25000, quantity_in_stock: 3,
};

function makeCatalog(): PosCatalog {
  return { all: [jbl], byBarcode: new Map([[jbl.barcode, jbl]]), isLoading: false, isError: false };
}

function makeCatalogWithScales(): PosCatalog {
  const all = [jbl, scales60, scales300];
  return { all, byBarcode: new Map(all.map((p) => [p.barcode, p])), isLoading: false, isError: false };
}

describe("ScanSearchField", () => {
  it("focuses the scan field on mount", () => {
    render(<ScanSearchField catalog={makeCatalog()} onAdd={vi.fn()} />);
    expect(screen.getByLabelText("Scan barcode or search product")).toHaveFocus();
  });

  it("calls onAdd with an exact barcode match on Enter", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    const input = screen.getByLabelText("Scan barcode or search product");
    await userEvent.type(input, "PES-AUD-00147{Enter}");
    expect(onAdd).toHaveBeenCalledWith(jbl);
  });

  it("calls onAdd with a name-search match when the Search button is clicked", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "jbl fli");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onAdd).toHaveBeenCalledWith(jbl);
  });

  it("clears the input after a successful match", async () => {
    render(<ScanSearchField catalog={makeCatalog()} onAdd={vi.fn()} />);
    const input = screen.getByLabelText("Scan barcode or search product") as HTMLInputElement;
    await userEvent.type(input, "PES-AUD-00147{Enter}");
    expect(input.value).toBe("");
  });

  it("shows a not-in-catalog message and does not call onAdd when nothing matches", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "UNKNOWN{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Not in catalog — add product?")).toBeInTheDocument();
  });

  it("does nothing on Enter with an empty field", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalog()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "{Enter}");
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.queryByText("Not in catalog — add product?")).not.toBeInTheDocument();
  });

  it("lists every match as the query narrows, not just the first", async () => {
    render(<ScanSearchField catalog={makeCatalogWithScales()} onAdd={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "sc");
    expect(screen.getByRole("button", { name: /Scales 60kg/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Scales 300kg/ })).toBeInTheDocument();
  });

  it("lets the user click a listed match instead of the one Enter would pick", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalogWithScales()} onAdd={onAdd} />);
    const input = screen.getByLabelText("Scan barcode or search product") as HTMLInputElement;
    await userEvent.type(input, "sc");
    await userEvent.click(screen.getByRole("button", { name: /Scales 300kg/ }));
    expect(onAdd).toHaveBeenCalledWith(scales300);
    expect(onAdd).not.toHaveBeenCalledWith(scales60);
    expect(input.value).toBe("");
  });

  it("still adds the top match on Enter when the query is ambiguous", async () => {
    const onAdd = vi.fn();
    render(<ScanSearchField catalog={makeCatalogWithScales()} onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText("Scan barcode or search product"), "sc{Enter}");
    expect(onAdd).toHaveBeenCalledWith(scales60);
  });
});
