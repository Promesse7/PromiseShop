import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CostMarginCard } from "./CostMarginCard";
import type { ProfitabilityRow } from "@/lib/types";

const row: ProfitabilityRow = {
  product_id: 1, product_name: "JBL Flip 6",
  units_bought: 10, avg_cost_paid: "100000.00", avg_cost_invoiced: "110000.00",
  units_sold: 4, revenue: "560000.00", projected_revenue: "580000.00",
  cogs_paid: "400000.00", cogs_invoiced: "440000.00",
  gross_margin: "160000.00", projected_margin: "140000.00",
  margin_pct: "28.57", projected_margin_pct: "24.14",
};

describe("CostMarginCard", () => {
  it("shows average costs, units, average selling price and both margins", () => {
    render(<CostMarginCard row={row} isLoading={false} isError={false} />);
    expect(screen.getByText("Cost & margin · all time")).toBeInTheDocument();
    expect(screen.getByText("RWF 100,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 110,000")).toBeInTheDocument();
    expect(screen.getByText("10 bought · 4 sold")).toBeInTheDocument();
    // 560,000 / 4
    expect(screen.getByText("RWF 140,000")).toBeInTheDocument();
    expect(screen.getByText("RWF 160,000 · 28.6%")).toBeInTheDocument();
    expect(screen.getByText("RWF 140,000 · 24.1%")).toBeInTheDocument();
  });

  it("explains when there is no received purchase to cost against", () => {
    render(
      <CostMarginCard
        row={{ ...row, units_bought: 0, avg_cost_paid: null, avg_cost_invoiced: null, cogs_paid: null, cogs_invoiced: null, gross_margin: null, projected_margin: null, margin_pct: null, projected_margin_pct: null }}
        isLoading={false}
        isError={false}
      />
    );
    expect(screen.getByText("No received purchase yet — costs unknown")).toBeInTheDocument();
  });

  it("shows a loading state", () => {
    render(<CostMarginCard row={undefined} isLoading={true} isError={false} />);
    expect(screen.getByText("Loading cost & margin…")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    render(<CostMarginCard row={undefined} isLoading={false} isError={true} />);
    expect(screen.getByText("Couldn't load cost & margin.")).toBeInTheDocument();
  });
});
