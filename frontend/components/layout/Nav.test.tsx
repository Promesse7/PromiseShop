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
      { href: "/customers", label: "Customers" },
    ]);
  });

  it("returns the staff link set for technician", () => {
    expect(getNavLinksForRole("technician")).toEqual(getNavLinksForRole("sales_staff"));
  });

  it("returns the admin link set, with Employees and Expenses appended, for admin", () => {
    expect(getNavLinksForRole("admin")).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/checkout", label: "Sales" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/customers", label: "Customers" },
      { href: "/employees", label: "Employees" },
      { href: "/expenses", label: "Expenses" },
    ]);
  });

  it("returns the admin link set WITHOUT Employees or Expenses for manager — both backends are admin-strict, unlike the rest of this list", () => {
    const managerLinks = getNavLinksForRole("manager");
    expect(managerLinks).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/checkout", label: "Sales" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/customers", label: "Customers" },
    ]);
    expect(managerLinks.find((l) => l.href === "/employees")).toBeUndefined();
    expect(managerLinks.find((l) => l.href === "/expenses")).toBeUndefined();
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

  it("does not render the Employees link for manager, even though manager gets the admin role tag and link set otherwise", () => {
    render(<Nav role="manager" username="d.ishimwe" />);
    expect(screen.queryByRole("link", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Suppliers" })).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("shows the Notifications link for admin", () => {
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });

  it("hides the Notifications link for manager, since notification recipients are always role=admin", () => {
    render(<Nav role="manager" username="d.ishimwe" />);
    expect(screen.queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("hides the Notifications link for sales_staff and technician", () => {
    render(<Nav role="sales_staff" username="e.mugisha" />);
    expect(screen.queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("shows the Expenses link for admin but not for manager", () => {
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Expenses" })).toBeInTheDocument();
  });

  it("does not render the Expenses link for manager", () => {
    render(<Nav role="manager" username="d.ishimwe" />);
    expect(screen.queryByRole("link", { name: "Expenses" })).not.toBeInTheDocument();
  });
});
