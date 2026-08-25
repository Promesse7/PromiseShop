import Link from "next/link";
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
  { href: "/sales", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/stock", label: "Stock" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/customers", label: "Customers" },
];

const ADMIN_ROLES: EmployeeRole[] = ["admin", "manager"];

// The backend's Employee endpoint (and every dashboard endpoint) is gated to role === "admin"
// strictly — a Manager gets a hard 403, unlike the rest of this list which is admin+manager
// shared. So the Employees link is appended only for the strict admin role, not derived from
// ADMIN_ROLES like the rest of this array.
const STRICT_ADMIN_ROLES: EmployeeRole[] = ["admin"];

export function getNavLinksForRole(role: EmployeeRole): NavLink[] {
  const base = ADMIN_ROLES.includes(role) ? ADMIN_LINKS : STAFF_LINKS;
  return STRICT_ADMIN_ROLES.includes(role) ? [...base, { href: "/employees", label: "Employees" }] : base;
}

interface NavProps {
  role: EmployeeRole;
  username: string;
}

export function Nav({ role, username }: NavProps) {
  const links = getNavLinksForRole(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const roleLabel = role === "admin" ? "Admin" : role === "manager" ? "Manager" : role === "sales_staff" ? "Sales Staff" : "Technician";

  return (
    <nav className="flex items-center gap-4 py-2.5 px-4 border-b border-divider">
      <span className="font-sans font-medium text-base mr-auto whitespace-nowrap">
        Promise Electronic Shop
      </span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm hover:text-accent">
          {link.label}
        </Link>
      ))}
      {/* Notifications are strictly admin-only (recipients are always role="admin" employees,
          unlike the admin+manager ADMIN_LINKS above), so it's gated here rather than in that array. */}
      {role === "admin" && (
        <Link href="/notifications" className="text-sm hover:text-accent">
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
