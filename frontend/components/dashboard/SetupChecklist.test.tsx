import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupChecklist } from "./SetupChecklist";

describe("SetupChecklist", () => {
  it("shows all three steps unchecked when nothing exists yet", () => {
    render(<SetupChecklist categoryCount={0} productCount={0} />);
    expect(screen.getByRole("link", { name: /Add your first category/ })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: /Add your first product/ })).toHaveAttribute("href", "/products");
    expect(screen.getByRole("link", { name: /Record and receive your first purchase/ })).toHaveAttribute(
      "href",
      "/purchases?open=new"
    );
  });

  it("marks category and product steps done once counts are non-zero", () => {
    render(<SetupChecklist categoryCount={2} productCount={5} />);
    const categoryItem = screen.getByText(/Add your first category/).closest("li");
    const productItem = screen.getByText(/Add your first product/).closest("li");
    expect(categoryItem).toHaveTextContent("✓");
    expect(productItem).toHaveTextContent("✓");
  });

  it("leaves the purchase step unchecked, since being rendered at all implies it isn't done", () => {
    render(<SetupChecklist categoryCount={2} productCount={5} />);
    const purchaseItem = screen.getByText(/Record and receive your first purchase/).closest("li");
    expect(purchaseItem).not.toHaveTextContent("✓");
  });
});
