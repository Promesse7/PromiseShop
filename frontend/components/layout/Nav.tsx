"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tag } from "@/components/ui/Tag";
import type { EmployeeRole } from "@/lib/types";

interface NavLink {
  href: string;
  label: string;
}

const STAFF_LINKS: NavLink[] = [
  { href: "/checkout", label: "Checkout" },
  { href: "/products", label: "Products" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/customers", label: "Customers" },
];

const ADMIN_LINKS: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/products", label: "Products" },
  { href: "/checkout", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/customers", label: "Customers" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

// The backend's Employee and Expense endpoints (and every dashboard endpoint) are gated to
// role === "admin" strictly — a Manager gets a hard 403, unlike the rest of this list which is
// admin+manager shared. So the Employees/Expenses links are appended only for the strict admin
// role, not derived from ADMIN_ROLES like the rest of this array.
const STRICT_ADMIN_ROLES: EmployeeRole[] = ["admin"];

export function getNavLinksForRole(role: EmployeeRole): NavLink[] {
  const base = ADMIN_ROLES.includes(role) ? ADMIN_LINKS : STAFF_LINKS;
  if (!STRICT_ADMIN_ROLES.includes(role)) return base;
  return [...base, { href: "/employees", label: "Employees" }, { href: "/expenses", label: "Expenses" }];
}

function isActiveLink(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function navLinkClassName(active: boolean): string {
  return active
    ? "text-sm text-accent bg-accent/10 rounded-sm px-2 py-1 -my-1"
    : "text-sm hover:text-accent";
}

interface NavProps {
  role: EmployeeRole;
  username: string;
}

export function Nav({ role, username }: NavProps) {
  const pathname = usePathname();
  const links = getNavLinksForRole(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : role === "sales_staff" ? "Sales Staff" : "Technician";
  const notificationsActive = isActiveLink(pathname, "/notifications");

  return (
    <nav className="sticky top-0 z-10 flex items-center gap-4 py-2.5 px-4 glass-bar">
      <span className="font-sans font-medium text-base mr-auto whitespace-nowrap">
        Promise Electronic Shop
      </span>
      {links.map((link) => {
        const active = isActiveLink(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={navLinkClassName(active)}
          >
            {link.label}
          </Link>
        );
      })}
      {/* Notifications are strictly admin-only (recipients are always role="admin" employees,
          unlike the admin+manager ADMIN_LINKS above), so it's gated here rather than in that array. */}
      {role === "admin" && (
        <Link
          href="/notifications"
          aria-current={notificationsActive ? "page" : undefined}
          className={navLinkClassName(notificationsActive)}
        >
          Notifications
        </Link>
      )}
      {isAdmin && <Tag>Admin</Tag>}
      <span className="text-sm opacity-60">
        {username} · {roleLabel}
      </span>
    </nav>
  );
}
