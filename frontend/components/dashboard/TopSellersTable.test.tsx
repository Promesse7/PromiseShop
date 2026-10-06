import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopSellersTable } from "./TopSellersTable";

describe("TopSellersTable", () => {
  it("renders a row per top seller with units and revenue", () => {
    render(<TopSellersTable rows={[{ product_id: 1, product_name: "Samsung 43\" TV", units: 14, revenue: 5390000, grossMargin: null, marginPct: null }]} />);
    expect(screen.getByText('Samsung 43" TV')).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("RWF 5,390,000")).toBeInTheDocument();
  });

  it("shows the margin beside the units when cost data exists", () => {
    render(<TopSellersTable rows={[{ product_id: 1, product_name: "Samsung 43\" TV", units: 14, revenue: 5390000, grossMargin: 1190000, marginPct: 22.08 }]} />);
    expect(screen.getByText("margin RWF 1,190,000 · 22.1%")).toBeInTheDocument();
  });

  it("shows 'cost unknown' when the product has no received purchase", () => {
    render(<TopSellersTable rows={[{ product_id: 1, product_name: "Samsung 43\" TV", units: 14, revenue: 5390000, grossMargin: null, marginPct: null }]} />);
    expect(screen.getByText("cost unknown")).toBeInTheDocument();
  });

  it("shows an empty message when there are no sales yet", () => {
    render(<TopSellersTable rows={[]} />);
    expect(screen.getByText("No sales yet this month")).toBeInTheDocument();
  });
});
