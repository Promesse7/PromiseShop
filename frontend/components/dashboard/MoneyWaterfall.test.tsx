import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MoneyWaterfall, waterfallBars } from "./MoneyWaterfall";
import { setMatchMedia } from "@/lib/test/matchMedia";
import type { ChainStep } from "@/lib/dashboard/money";

const steps: ChainStep[] = [
  { key: "catalog", label: "Sales at catalog price", amount: "482000.00", kind: "total" },
  { key: "discounts", label: "Discounts / markups", amount: "-14000.00", kind: "delta" },
  { key: "net_sales", label: "Net sales (VAT incl.)", amount: "468000.00", kind: "total" },
  { key: "returns_voids", label: "Returns and voids", amount: "-228000.00", kind: "delta" },
];

describe("waterfallBars", () => {
  it("stands totals on zero and floats deltas from the running total", () => {
    const bars = waterfallBars(steps);
    expect(bars.map((b) => [b.start, b.end])).toEqual([
      [0, 482000],
      [482000, 468000],
      [0, 468000],
      [468000, 240000],
    ]);
  });
});

describe("MoneyWaterfall", () => {
  it("draws the chart and lists every step with its amount", () => {
    render(<MoneyWaterfall steps={steps} />);
    expect(screen.getByRole("img", { name: "Money chain waterfall" })).toBeInTheDocument();
    expect(screen.getByText("Returns and voids")).toBeInTheDocument();
    expect(screen.getByText(`RWF ${(-228000).toLocaleString()}`)).toBeInTheDocument();
  });

  it("grows each bar up from its base when motion is allowed", () => {
    setMatchMedia({ reducedMotion: false });
    const { container } = render(<MoneyWaterfall steps={steps} />);
    const bars = container.querySelectorAll("rect");
    expect(bars).toHaveLength(steps.length);
    bars.forEach((bar) => expect(bar.getAttribute("style") ?? "").toContain("scaleY(0)"));
  });

  it("draws the bars at full height straight away with reduced motion", () => {
    const { container } = render(<MoneyWaterfall steps={steps} />);
    container.querySelectorAll("rect").forEach((bar) => {
      expect(bar.getAttribute("style") ?? "").not.toContain("scaleY(0)");
    });
  });
});
