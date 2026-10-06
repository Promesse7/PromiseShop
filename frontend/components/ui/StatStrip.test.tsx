import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatStrip } from "./StatStrip";
import { setMatchMedia } from "@/lib/test/matchMedia";

describe("StatStrip", () => {
  it("renders each stat as a labelled term and value", () => {
    render(
      <StatStrip
        label="Sale summary"
        stats={[
          { label: "Total", amount: "530000.00" },
          { label: "Status", value: "Completed" },
        ]}
      />
    );
    const strip = screen.getByRole("list", { name: "Sale summary" });
    const total = within(strip).getByText("Total").closest("li")!;
    expect(within(total).getByText("RWF 530,000")).toBeInTheDocument();
    expect(within(strip).getByText("Completed")).toBeInTheDocument();
  });

  it("marks a danger stat so it stands out", () => {
    render(<StatStrip stats={[{ label: "Balance", amount: 2500, tone: "danger" }]} />);
    expect(screen.getByText("RWF 2,500")).toHaveAttribute("data-tone", "danger");
  });

  it("shows a hint under the value", () => {
    render(<StatStrip stats={[{ label: "Paid", amount: 100, hint: "2 payments" }]} />);
    expect(screen.getByText("2 payments")).toBeInTheDocument();
  });

  it("shows a dash for a missing amount", () => {
    render(<StatStrip stats={[{ label: "Credit limit", amount: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  const STATS = [
    { label: "Total", amount: 1000 },
    { label: "Paid", amount: 500 },
    { label: "Balance", amount: 500 },
  ];

  it("is a sideways snapping row on phone, with the next figure peeking in", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<StatStrip label="Sale summary" stats={STATS} />);
    const strip = screen.getByRole("list", { name: "Sale summary" });
    const area = strip.closest("[data-at-start]");
    expect(area).not.toBeNull();
    expect(area?.className).toContain("snap-x");
    for (const item of within(strip).getAllByRole("listitem")) {
      expect(item.className).toContain("snap-start");
      expect(item.className).toContain("w-[80%]");
    }
  });

  it("stays a plain grid on desktop", () => {
    render(<StatStrip label="Sale summary" stats={STATS} />);
    expect(screen.getByRole("list", { name: "Sale summary" }).closest("[data-at-start]")).toBeNull();
  });
});
