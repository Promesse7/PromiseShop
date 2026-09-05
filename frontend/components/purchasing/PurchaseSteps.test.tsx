import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PurchaseSteps } from "./PurchaseSteps";

describe("PurchaseSteps", () => {
  it("shows the three steps with 'Add items' current on an empty draft", () => {
    render(<PurchaseSteps itemCount={0} status="draft" />);
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual(["1Add items", "2Check totals", "3Receive"]);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Add at least one item, then check the totals and receive.")).toBeInTheDocument();
  });

  it("moves to 'Check totals' once the draft has items", () => {
    render(<PurchaseSteps itemCount={3} status="draft" />);
    const steps = screen.getAllByRole("listitem");
    expect(steps[0]).toHaveTextContent("✓");
    expect(steps[1]).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("Check the paid and invoiced totals, then receive to add the items to stock.")).toBeInTheDocument();
  });

  it("marks everything done once received", () => {
    render(<PurchaseSteps itemCount={3} status="received" />);
    const steps = screen.getAllByRole("listitem");
    expect(steps[2]).toHaveTextContent("✓");
    expect(screen.queryByText(/then receive/)).not.toBeInTheDocument();
    expect(screen.getByText("Received — stock has been updated.")).toBeInTheDocument();
  });

  it("explains a cancelled purchase", () => {
    render(<PurchaseSteps itemCount={3} status="cancelled" />);
    expect(screen.getByText("Cancelled — nothing was added to stock.")).toBeInTheDocument();
  });
});
