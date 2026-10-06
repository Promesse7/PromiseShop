import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MovementsTable } from "./MovementsTable";
import type { StockMovement } from "@/lib/types";
import { setMatchMedia } from "@/lib/test/matchMedia";

const movements: StockMovement[] = [
  { movement_id: 2, product: 9, product_name: "Speaker", movement_type: "sale", bucket: "in_stock", quantity_delta: -2, balance_after: 8, unit_cost: "50000.00", source_type: "sale_item", source_id: 5, reason: "Sale #3", created_by: 1, created_by_name: "Staff One", created_at: "2026-10-06T10:00:00Z" },
  { movement_id: 1, product: 9, product_name: "Speaker", movement_type: "opening", bucket: "in_stock", quantity_delta: 10, balance_after: 10, unit_cost: null, source_type: "", source_id: null, reason: "Ledger start", created_by: null, created_by_name: null, created_at: "2026-10-01T10:00:00Z" },
];

describe("MovementsTable", () => {
  it("shows type, signed change, balance, who and reason", () => {
    render(<MovementsTable movements={movements} showCost />);
    expect(screen.getByText("Sale")).toBeInTheDocument();
    expect(screen.getByText("-2")).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("Staff One")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("Ledger start")).toBeInTheDocument();
    expect(screen.getByText("Opening stock")).toBeInTheDocument();
  });

  it("shows unit cost only when allowed", () => {
    const { rerender } = render(<MovementsTable movements={movements} showCost />);
    expect(screen.getByText("Unit cost")).toBeInTheDocument();
    expect(screen.getByText("RWF 50,000")).toBeInTheDocument();
    rerender(<MovementsTable movements={movements} showCost={false} />);
    expect(screen.queryByText("Unit cost")).not.toBeInTheDocument();
  });

  it("can hide the product column", () => {
    render(<MovementsTable movements={movements} showCost={false} showProduct={false} />);
    expect(screen.queryByRole("link", { name: "Speaker" })).not.toBeInTheDocument();
  });

  it("shows the empty message", () => {
    render(<MovementsTable movements={[]} showCost={false} emptyMessage="Nothing moved" />);
    expect(screen.getByText("Nothing moved")).toBeInTheDocument();
  });

  it("shows each movement as a card on phone, with the change and balance", () => {
    setMatchMedia({ desktop: false });
    render(<MovementsTable movements={movements} showCost={false} />);
    expect(screen.queryByRole("columnheader")).not.toBeInTheDocument();
    expect(screen.getByText("-2")).toBeInTheDocument();
    expect(screen.getAllByText("Speaker").length).toBeGreaterThan(0);
  });
});
