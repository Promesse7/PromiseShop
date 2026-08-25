import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlowMoversTable } from "./SlowMoversTable";

describe("SlowMoversTable", () => {
  it("renders a formatted last-sold date for a product with sale history", () => {
    render(
      <SlowMoversTable
        rows={[{ product_id: 1, product_name: "Pioneer Car Stereo", quantity_in_stock: 6, last_sold: "2026-06-12T00:00:00Z" }]}
      />
    );
    expect(screen.getByText("Pioneer Car Stereo")).toBeInTheDocument();
    expect(screen.getByText("12 Jun")).toBeInTheDocument();
  });

  it("renders 'Never sold' for a product with no sale history", () => {
    render(
      <SlowMoversTable rows={[{ product_id: 2, product_name: "Unsold Gadget", quantity_in_stock: 3, last_sold: null }]} />
    );
    expect(screen.getByText("Never sold")).toBeInTheDocument();
  });

  it("shows an empty message when nothing is slow moving", () => {
    render(<SlowMoversTable rows={[]} />);
    expect(screen.getByText("Nothing slow moving")).toBeInTheDocument();
  });
});
