import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Nav, getNavLinksForRole } from "./Nav";

describe("getNavLinksForRole", () => {
  it("returns the staff link set for sales_staff", () => {
    expect(getNavLinksForRole("sales_staff")).toEqual([
      { href: "/checkout", label: "Checkout" },
      { href: "/products", label: "Products" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
    ]);
  });

  it("returns the staff link set for technician", () => {
    expect(getNavLinksForRole("technician")).toEqual(getNavLinksForRole("sales_staff"));
  });

  it("returns the admin link set for admin", () => {
    expect(getNavLinksForRole("admin")).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/sales", label: "Sales" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/employees", label: "Employees" },
    ]);
  });

  it("returns the admin link set for manager", () => {
    expect(getNavLinksForRole("manager")).toEqual(getNavLinksForRole("admin"));
  });
});

describe("Nav", () => {
  it("renders the staff link set and username, no role tag, for sales_staff", () => {
    render(<Nav role="sales_staff" username="e.mugisha" />);
    expect(screen.getByRole("link", { name: "Checkout" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.getByText(/e\.mugisha/)).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("renders the admin link set, username, and an Admin role tag, for admin", () => {
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Employees" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Checkout" })).not.toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText(/a\.uwase/)).toBeInTheDocument();
  });
});
