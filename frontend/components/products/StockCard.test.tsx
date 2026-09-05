import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { StockCard } from "./StockCard";
import type { Inventory } from "@/lib/types";

const inventory: Inventory = {
  inventory_id: 1, product: 1, quantity_in_stock: 2, quantity_in_use: 1, quantity_damaged: 3,
  storage_location: "Shelf B2", last_updated: "2026-08-01T00:00:00Z", is_low_stock: true,
};

describe("StockCard", () => {
  it("renders stock, in-use, damaged counts, and location", () => {
    render(<StockCard inventory={inventory} reorderLevel={4} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Shelf B2")).toBeInTheDocument();
  });

  it("shows the reorder level and when stock last changed", () => {
    render(<StockCard inventory={inventory} reorderLevel={4} />);
    expect(screen.getByText("reorder at 4")).toBeInTheDocument();
    expect(screen.getByText("Last changed")).toBeInTheDocument();
    expect(screen.getByText("01 Aug 2026")).toBeInTheDocument();
  });

  it("offers an Adjust stock action when a handler is given, and not otherwise", async () => {
    const onAdjust = vi.fn();
    const { unmount } = render(<StockCard inventory={inventory} reorderLevel={4} onAdjust={onAdjust} />);
    await userEvent.click(screen.getByRole("button", { name: "Adjust stock" }));
    expect(onAdjust).toHaveBeenCalled();
    unmount();

    render(<StockCard inventory={inventory} reorderLevel={4} />);
    expect(screen.queryByRole("button", { name: "Adjust stock" })).not.toBeInTheDocument();
  });

  it("shows a not-yet-received state when there is no inventory row", () => {
    render(<StockCard inventory={undefined} reorderLevel={4} />);
    expect(screen.getByText("Not yet received")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjust stock" })).not.toBeInTheDocument();
  });
});
