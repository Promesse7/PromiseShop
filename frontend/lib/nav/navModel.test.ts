import { describe, expect, it } from "vitest";
import {
  breadcrumbFor,
  findActiveItem,
  getNavGroupsForRole,
  getNavItemsForRole,
  getTabBarItems,
} from "./navModel";

const hrefs = (items: { href: string }[]) => items.map((i) => i.href);

describe("getNavItemsForRole", () => {
  it("gives admin every page, including the admin-strict ones and notifications", () => {
    expect(hrefs(getNavItemsForRole("admin"))).toEqual([
      "/checkout", "/sales", "/close-day", "/customers", "/debts",
      "/products", "/stock", "/stock/movements", "/shop-use",
      "/purchases", "/suppliers",
      "/dashboard", "/expenses",
      "/employees", "/settings", "/setup/import", "/notifications",
    ]);
  });

  it("gives a manager the admin set without the admin-strict pages (the backend 403s them)", () => {
    const managerHrefs = hrefs(getNavItemsForRole("manager"));
    for (const strict of ["/employees", "/expenses", "/settings", "/setup/import", "/notifications"]) {
      expect(managerHrefs).not.toContain(strict);
    }
    expect(managerHrefs).toContain("/dashboard");
    expect(managerHrefs).toContain("/debts");
    expect(managerHrefs).toContain("/suppliers");
  });

  it("gives sales staff and technicians the same staff set, with no money or admin pages", () => {
    const staff = hrefs(getNavItemsForRole("sales_staff"));
    expect(staff).toEqual([
      "/checkout", "/sales", "/close-day", "/customers",
      "/products", "/stock", "/stock/movements", "/shop-use",
      "/purchases",
    ]);
    expect(hrefs(getNavItemsForRole("technician"))).toEqual(staff);
  });

  it('labels the sales page "My sales" for staff and "Sales" for everyone else', () => {
    const label = (role: Parameters<typeof getNavItemsForRole>[0]) =>
      getNavItemsForRole(role).find((i) => i.href === "/sales")?.label;
    expect(label("sales_staff")).toBe("My sales");
    expect(label("technician")).toBe("My sales");
    expect(label("manager")).toBe("Sales");
    expect(label("admin")).toBe("Sales");
  });
});

describe("getNavGroupsForRole", () => {
  it("returns the groups in order and drops empty ones", () => {
    expect(getNavGroupsForRole("admin").map((g) => g.label)).toEqual(["Sell", "Stock", "Buy", "Money", "Admin"]);
    expect(getNavGroupsForRole("manager").map((g) => g.label)).toEqual(["Sell", "Stock", "Buy", "Money"]);
    expect(getNavGroupsForRole("sales_staff").map((g) => g.label)).toEqual(["Sell", "Stock", "Buy"]);
  });
});

describe("getTabBarItems", () => {
  it("gives staff Checkout, My sales, Products, Stock", () => {
    expect(hrefs(getTabBarItems("sales_staff"))).toEqual(["/checkout", "/sales", "/products", "/stock"]);
    expect(hrefs(getTabBarItems("technician"))).toEqual(["/checkout", "/sales", "/products", "/stock"]);
  });

  it("gives admin and manager Dashboard, Sales, Products, Debts", () => {
    expect(hrefs(getTabBarItems("admin"))).toEqual(["/dashboard", "/sales", "/products", "/debts"]);
    expect(hrefs(getTabBarItems("manager"))).toEqual(["/dashboard", "/sales", "/products", "/debts"]);
  });
});

describe("findActiveItem", () => {
  const items = getNavItemsForRole("admin");

  it("matches the longest prefix, so Movements beats Stock", () => {
    expect(findActiveItem("/stock/movements", items)?.href).toBe("/stock/movements");
    expect(findActiveItem("/stock/units/4", items)?.href).toBe("/stock");
  });

  it("matches detail pages to their list", () => {
    expect(findActiveItem("/products/12", items)?.href).toBe("/products");
  });

  it("does not match a page that only shares a prefix of letters", () => {
    expect(findActiveItem("/salesman", items)).toBeUndefined();
  });
});

describe("breadcrumbFor", () => {
  const items = getNavItemsForRole("admin");

  it("is group then page", () => {
    expect(breadcrumbFor("/stock/movements", items)).toEqual([
      { label: "Stock" },
      { label: "Movements", href: "/stock/movements" },
    ]);
  });

  it("is empty for an unknown route", () => {
    expect(breadcrumbFor("/nowhere", items)).toEqual([]);
  });
});
