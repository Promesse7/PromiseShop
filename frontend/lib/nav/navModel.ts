import {
  Bell,
  Boxes,
  Building2,
  CalendarCheck,
  ArrowLeftRight,
  HandCoins,
  History,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Upload,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { EmployeeRole } from "@/lib/types";

export type NavGroupId = "sell" | "stock" | "buy" | "money" | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupId;
}

export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [
  { id: "sell", label: "Sell" },
  { id: "stock", label: "Stock" },
  { id: "buy", label: "Buy" },
  { id: "money", label: "Money" },
  { id: "admin", label: "Admin" },
];

type Audience = "everyone" | "managers" | "admin";

// One list, in sidebar order. `audience` mirrors what the backend allows:
// "managers" = admin + manager, "admin" = role === "admin" strictly (Employees,
// Expenses, Settings, Setup and Notifications endpoints refuse a manager).
const ITEMS: (NavItem & { audience: Audience })[] = [
  { href: "/checkout", label: "Checkout", icon: ShoppingCart, group: "sell", audience: "everyone" },
  { href: "/sales", label: "Sales", icon: History, group: "sell", audience: "everyone" },
  { href: "/close-day", label: "Close day", icon: CalendarCheck, group: "sell", audience: "everyone" },
  { href: "/customers", label: "Customers", icon: Users, group: "sell", audience: "everyone" },
  { href: "/debts", label: "Debts", icon: HandCoins, group: "sell", audience: "managers" },
  { href: "/products", label: "Products", icon: Package, group: "stock", audience: "everyone" },
  { href: "/stock", label: "Stock", icon: Boxes, group: "stock", audience: "everyone" },
  { href: "/stock/movements", label: "Movements", icon: ArrowLeftRight, group: "stock", audience: "everyone" },
  { href: "/shop-use", label: "Shop use", icon: Wrench, group: "stock", audience: "everyone" },
  { href: "/purchases", label: "Purchases", icon: Truck, group: "buy", audience: "everyone" },
  { href: "/suppliers", label: "Suppliers", icon: Building2, group: "buy", audience: "managers" },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "money", audience: "managers" },
  { href: "/expenses", label: "Expenses", icon: Receipt, group: "money", audience: "admin" },
  { href: "/employees", label: "Employees", icon: UserCog, group: "admin", audience: "admin" },
  { href: "/settings", label: "Settings", icon: Settings, group: "admin", audience: "admin" },
  { href: "/setup/import", label: "Setup", icon: Upload, group: "admin", audience: "admin" },
  { href: "/notifications", label: "Notifications", icon: Bell, group: "admin", audience: "admin" },
];

function isManagerOrAdmin(role: EmployeeRole): boolean {
  return role === "admin" || role === "manager";
}

function canSee(role: EmployeeRole, audience: Audience): boolean {
  if (audience === "everyone") return true;
  if (audience === "managers") return isManagerOrAdmin(role);
  return role === "admin";
}

export function getNavItemsForRole(role: EmployeeRole): NavItem[] {
  return ITEMS.filter((item) => canSee(role, item.audience)).map((item) => ({
    href: item.href,
    icon: item.icon,
    group: item.group,
    // Staff only ever see their own sales from today (the backend enforces it).
    label: item.href === "/sales" && !isManagerOrAdmin(role) ? "My sales" : item.label,
  }));
}

export function getNavGroupsForRole(role: EmployeeRole): { id: NavGroupId; label: string; items: NavItem[] }[] {
  const items = getNavItemsForRole(role);
  return NAV_GROUPS.map((group) => ({ ...group, items: items.filter((i) => i.group === group.id) })).filter(
    (group) => group.items.length > 0
  );
}

const STAFF_TABS = ["/checkout", "/sales", "/products", "/stock"];
const MANAGER_TABS = ["/dashboard", "/sales", "/products", "/debts"];

export function getTabBarItems(role: EmployeeRole): NavItem[] {
  const items = getNavItemsForRole(role);
  const wanted = isManagerOrAdmin(role) ? MANAGER_TABS : STAFF_TABS;
  return wanted.map((href) => items.find((i) => i.href === href)).filter((i): i is NavItem => i !== undefined);
}

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function findActiveItem(pathname: string, items: NavItem[]): NavItem | undefined {
  return items
    .filter((item) => matches(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function breadcrumbFor(pathname: string, items: NavItem[]): { label: string; href?: string }[] {
  const active = findActiveItem(pathname, items);
  if (!active) return [];
  const group = NAV_GROUPS.find((g) => g.id === active.group);
  return [{ label: group?.label ?? "" }, { label: active.label, href: active.href }];
}
