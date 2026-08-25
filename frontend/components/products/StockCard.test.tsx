import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StockCard } from "./StockCard";
import type { Inventory } from "@/lib/types";

const inventory: Inventory = {
  inventory_id: 1, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 3,
  storage_location: "Shelf B2", last_updated: "2026-08-01T00:00:00Z", is_low_stock: true,
};

describe("StockCard", () => {
  it("renders stock, in-use, damaged counts, and location", () => {
    render(<StockCard inventory={inventory} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Shelf B2")).toBeInTheDocument();
  });

  it("shows a not-yet-received state when there is no inventory row", () => {
    render(<StockCard inventory={undefined} />);
    expect(screen.getByText("Not yet received")).toBeInTheDocument();
  });
});
