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

function makeCatalog(): PosCatalog {
  return { all: [jbl], byBarcode: new Map([[jbl.barcode, jbl]]), isLoading: false, isError: false };
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
});
