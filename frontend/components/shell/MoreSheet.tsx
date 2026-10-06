"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, LogOut } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { findActiveItem, getNavGroupsForRole, getNavItemsForRole } from "@/lib/nav/navModel";
import type { EmployeeRole } from "@/lib/types";

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  role: EmployeeRole;
  username: string;
  onHelp: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

/** Phone: everything the role can reach, grouped, plus help and sign out. */
export function MoreSheet({ open, onClose, role, username, onHelp, onLogout, loggingOut }: MoreSheetProps) {
  const pathname = usePathname() ?? "/";
  const active = findActiveItem(pathname, getNavItemsForRole(role));

  return (
    <Dialog open={open} onClose={onClose} title="Menu" description={username}>
      <div className="flex flex-col gap-4">
        {getNavGroupsForRole(role).map((group) => (
          <section key={group.id}>
            <p className="m-0 mb-1 text-[11px] font-medium uppercase tracking-wider text-text/45">{group.label}</p>
            <ul className="list-none m-0 p-0 grid grid-cols-2 gap-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active?.href === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      aria-current={isActive ? "page" : undefined}
                      className={[
                        "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm no-underline",
                        isActive ? "bg-accent/10 text-accent font-medium" : "text-text hover:bg-text/[0.05]",
                      ].join(" ")}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <div className="flex gap-2 border-t border-divider pt-3">
          <button
            type="button"
            onClick={() => {
              onClose();
              onHelp();
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-text/[0.05]"
          >
            <CircleHelp className="w-4 h-4" aria-hidden />
            Help
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={loggingOut}
            className="flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm hover:bg-text/[0.05] disabled:opacity-50"
          >
            <LogOut className="w-4 h-4" aria-hidden />
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
