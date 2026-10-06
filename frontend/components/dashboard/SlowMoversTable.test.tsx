import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlowMoversTable } from "./SlowMoversTable";
import { setMatchMedia } from "@/lib/test/matchMedia";

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

  it("is a list of cards on phone, each linking to the product", () => {
    setMatchMedia({ desktop: false });
    render(
      <SlowMoversTable
        rows={[{ product_id: 5, product_name: "Pioneer Car Stereo", quantity_in_stock: 3, last_sold: null }]}
      />
    );
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pioneer Car Stereo/ })).toHaveAttribute("href", "/products/5");
  });
});
