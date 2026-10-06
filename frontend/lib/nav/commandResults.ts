import { HandCoins, Hash, Package, PackagePlus, ShoppingCart, Truck, User, type LucideIcon } from "lucide-react";
import type { Customer, EmployeeRole, ProductSearchResult } from "@/lib/types";
import { NAV_GROUPS, getNavItemsForRole } from "./navModel";

export type CommandSection = "Pages" | "Actions" | "Sales" | "Products" | "Customers";

export interface CommandResult {
  id: string;
  section: CommandSection;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
}

/** Letters of `query` appear in `text` in order (case-insensitive); spaces in the query are ignored. */
export function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase().replace(/\s+/g, "");
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return q.length === 0;
}

function isManagerOrAdmin(role: EmployeeRole): boolean {
  return role === "admin" || role === "manager";
}

function actionsFor(role: EmployeeRole): CommandResult[] {
  const managersOnly = new Set(["action:add-product", "action:record-payment"]);
  const actions: CommandResult[] = [
    { id: "action:new-sale", section: "Actions", label: "New sale", href: "/checkout", icon: ShoppingCart },
    { id: "action:new-purchase", section: "Actions", label: "New purchase", href: "/purchases?open=new", icon: Truck },
    { id: "action:add-product", section: "Actions", label: "Add product", href: "/products?new=1", icon: PackagePlus },
    { id: "action:record-payment", section: "Actions", label: "Record payment", href: "/debts", icon: HandCoins },
  ];
  return actions.filter((a) => !managersOnly.has(a.id) || isManagerOrAdmin(role));
}

const SALE_NUMBER = /^#?\s*(?:s\s*-?\s*)?(\d+)$/i;
const MIN_SEARCH = 2;
const MAX_CUSTOMERS = 5;

interface BuildInput {
  query: string;
  role: EmployeeRole;
  /** Already-ranked hits from GET /products/search/ for this query. */
  products: ProductSearchResult[];
  customers: Customer[];
}

/** Everything the jump search offers for a query, in display order (sections grouped). */
export function buildCommandResults({ query, role, products, customers }: BuildInput): CommandResult[] {
  const q = query.trim();
  const results: CommandResult[] = [];

  const saleMatch = SALE_NUMBER.exec(q);
  if (saleMatch) {
    const number = saleMatch[1];
    results.push({ id: `sale:${number}`, section: "Sales", label: `Open sale #S-${number}`, href: `/sales/${number}`, icon: Hash });
  }

  for (const item of getNavItemsForRole(role)) {
    const groupLabel = NAV_GROUPS.find((g) => g.id === item.group)?.label ?? "";
    // The group name also matches ("stock mov"), but only from 3 letters so "s" isn't every page.
    if (fuzzyMatch(q, item.label) || (q.length > 2 && fuzzyMatch(q, `${groupLabel} ${item.label}`))) {
      results.push({ id: `page:${item.href}`, section: "Pages", label: item.label, hint: groupLabel, href: item.href, icon: item.icon });
    }
  }

  for (const action of actionsFor(role)) {
    if (fuzzyMatch(q, action.label)) results.push(action);
  }

  if (q.length >= MIN_SEARCH) {
    for (const product of products) {
      results.push({
        id: `product:${product.product_id}`,
        section: "Products",
        label: product.name,
        hint: product.barcode,
        href: `/products/${product.product_id}`,
        icon: Package,
      });
    }

    const needle = q.toLowerCase();
    customers
      .filter((c) => (c.name ?? "").toLowerCase().includes(needle) || (c.phone ?? "").includes(q))
      .slice(0, MAX_CUSTOMERS)
      .forEach((c) =>
        results.push({
          id: `customer:${c.customer_id}`,
          section: "Customers",
          label: c.name ?? `Customer #${c.customer_id}`,
          hint: c.phone ?? undefined,
          href: `/customers/${c.customer_id}`,
          icon: User,
        })
      );
  }

  return results;
}
