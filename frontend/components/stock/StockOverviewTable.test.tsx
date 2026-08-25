import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StockOverviewTable } from "./StockOverviewTable";
import type { StockOverviewRow } from "@/lib/stock/useStockOverview";

const rows: StockOverviewRow[] = [
  { product_id: 1, name: "Samsung 43\" Crystal UHD TV", quantity_in_stock: 12, quantity_in_use: 1, quantity_damaged: 0, storage_location: "Shelf A1", flag: "ok", unit_count: 0 },
  { product_id: 2, name: "JBL Flip 6 Speaker", quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 1, storage_location: "Shelf B2", flag: "low_stock", unit_count: 4 },
  { product_id: 3, name: "HP 65W Laptop Charger", quantity_in_stock: 0, quantity_in_use: 0, quantity_damaged: 0, storage_location: "Drawer C4", flag: "out_of_stock", unit_count: 0 },
];

describe("StockOverviewTable", () => {
  it("renders each row with its flag tag", () => {
    render(<StockOverviewTable rows={rows} onSelectProduct={vi.fn()} />);

    expect(screen.getByText("Samsung 43\" Crystal UHD TV")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
  });

  it("shows 'aggregate only' for products with no serialized units", () => {
    render(<StockOverviewTable rows={rows} onSelectProduct={vi.fn()} />);
    const aggregateOnlyLabels = screen.getAllByText("aggregate only");
    expect(aggregateOnlyLabels).toHaveLength(2);
  });

  it("shows a clickable unit-count link for products with serialized units, calling onSelectProduct", async () => {
    const onSelectProduct = vi.fn();
    render(<StockOverviewTable rows={rows} onSelectProduct={onSelectProduct} />);

    const link = screen.getByRole("button", { name: "4 units" });
    await userEvent.click(link);

    expect(onSelectProduct).toHaveBeenCalledWith(2);
  });
});
