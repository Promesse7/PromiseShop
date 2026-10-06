import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatStrip } from "./StatStrip";

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
});
