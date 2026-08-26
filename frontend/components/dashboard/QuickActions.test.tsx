import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuickActions } from "./QuickActions";

describe("QuickActions", () => {
  it("renders links to Sales, Purchases, and Products for admin", () => {
    render(<QuickActions role="admin" />);
    expect(screen.getByRole("link", { name: "New Sale" })).toHaveAttribute("href", "/checkout");
    expect(screen.getByRole("link", { name: "New Purchase" })).toHaveAttribute("href", "/purchases");
    expect(screen.getByRole("link", { name: "Add Product" })).toHaveAttribute("href", "/products");
  });

  it("shows Add Expense for admin, since Finance is admin-role-strict", () => {
    render(<QuickActions role="admin" />);
    expect(screen.getByRole("link", { name: "Add Expense" })).toHaveAttribute("href", "/expenses");
  });

  it("hides Add Expense for manager", () => {
    render(<QuickActions role="manager" />);
    expect(screen.queryByRole("link", { name: "Add Expense" })).not.toBeInTheDocument();
  });
});
