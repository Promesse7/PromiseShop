import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { usePathname, useRouter } from "next/navigation";
import { Nav, getNavLinksForRole } from "./Nav";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

const mockedUsePathname = vi.mocked(usePathname);
const mockedUseRouter = vi.mocked(useRouter);
const mockRouterPush = vi.fn();
const mockRouterRefresh = vi.fn();

beforeEach(() => {
  mockedUsePathname.mockReturnValue("/");
  mockRouterPush.mockReset();
  mockRouterRefresh.mockReset();
  mockedUseRouter.mockReturnValue({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  } as unknown as ReturnType<typeof useRouter>);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true } as Response)
  );
});

function withoutIcons(links: ReturnType<typeof getNavLinksForRole>) {
  return links.map(({ href, label }) => ({ href, label }));
}

describe("getNavLinksForRole", () => {
  it("returns the staff link set for sales_staff", () => {
    expect(withoutIcons(getNavLinksForRole("sales_staff"))).toEqual([
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

  it("gives every link an icon", () => {
    for (const link of getNavLinksForRole("admin")) {
      expect(link.icon).toBeDefined();
    }
  });

  it("returns the admin link set, with Employees and Expenses appended, for admin", () => {
    expect(withoutIcons(getNavLinksForRole("admin"))).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/checkout", label: "Sales" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/customers", label: "Customers" },
      { href: "/employees", label: "Employees" },
      { href: "/expenses", label: "Expenses" },
    ]);
  });

  it("returns the admin link set WITHOUT Employees or Expenses for manager — both backends are admin-strict, unlike the rest of this list", () => {
    const managerLinks = getNavLinksForRole("manager");
    expect(withoutIcons(managerLinks)).toEqual([
      { href: "/dashboard", label: "Dashboard" },
      { href: "/products", label: "Products" },
      { href: "/purchases", label: "Purchases" },
      { href: "/stock", label: "Stock" },
      { href: "/checkout", label: "Sales" },
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

  it("does not render the Employees link for manager, even though manager gets the admin link set and a role tag otherwise", () => {
    render(<Nav role="manager" username="d.ishimwe" />);
    expect(screen.queryByRole("link", { name: "Employees" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Suppliers" })).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
  });

  it("labels the role tag Manager, not Admin, for a manager — the badge must reflect the actual role", () => {
    render(<Nav role="manager" username="d.ishimwe" />);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("shows only the username, without a repeated role label, for admin and manager since the role tag already conveys it", () => {
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByText("a.uwase")).toBeInTheDocument();
  });

  it("shows username and role label together for sales_staff and technician, which have no role tag", () => {
    render(<Nav role="sales_staff" username="e.mugisha" />);
    expect(screen.getByText("e.mugisha · Sales Staff")).toBeInTheDocument();
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

  it("marks the current route's link as active via aria-current, and leaves others unmarked", () => {
    mockedUsePathname.mockReturnValue("/products");
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("marks a link as active for a nested route under it", () => {
    mockedUsePathname.mockReturnValue("/products/42");
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the Notifications link as active via aria-current when it's the current route", () => {
    mockedUsePathname.mockReturnValue("/notifications");
    render(<Nav role="admin" username="a.uwase" />);
    expect(screen.getByRole("link", { name: "Notifications" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("aria-current");
  });

  it("posts to the logout endpoint and redirects to /login when Sign out is clicked", async () => {
    const user = userEvent.setup();
    render(<Nav role="admin" username="a.uwase" />);

    await user.click(screen.getByRole("button", { name: /sign out/i }));

    expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(mockRouterPush).toHaveBeenCalledWith("/login");
    expect(mockRouterRefresh).toHaveBeenCalled();
  });
});
