import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevenueTrendChart } from "./RevenueTrendChart";
import type { MonthlyTrendPoint } from "@/lib/dashboard/useDashboardData";

const POINTS: MonthlyTrendPoint[] = [
  { month: "2026-03", label: "Mar", revenue: 100, purchaseCost: 60 },
  { month: "2026-04", label: "Apr", revenue: 200, purchaseCost: 80 },
  { month: "2026-08", label: "Aug", revenue: 530000, purchaseCost: 200000 },
];

describe("RevenueTrendChart", () => {
  it("renders one bar pair and one month label per trend point", () => {
    const { container } = render(<RevenueTrendChart points={POINTS} />);
    expect(container.querySelectorAll("rect")).toHaveLength(POINTS.length * 2);
    expect(screen.getByText("Mar")).toBeInTheDocument();
    expect(screen.getByText("Aug")).toBeInTheDocument();
  });

  it("renders a legend for revenue and purchase cost", () => {
    render(<RevenueTrendChart points={POINTS} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Purchase cost")).toBeInTheDocument();
  });

  it("renders without error when given no points", () => {
    const { container } = render(<RevenueTrendChart points={[]} />);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });
});
