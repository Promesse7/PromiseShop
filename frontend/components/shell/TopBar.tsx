"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Bell, ChevronRight, Search } from "lucide-react";
import { breadcrumbFor, findActiveItem, getNavItemsForRole } from "@/lib/nav/navModel";
import { useNotifications } from "@/lib/notifications/useNotifications";
import type { EmployeeRole } from "@/lib/types";
import { HelpButton } from "./HelpPanel";
import { UserMenu } from "./UserMenu";

interface TopBarProps {
  role: EmployeeRole;
  username: string;
  onOpenSearch: () => void;
  onOpenHelp: () => void;
  onLogout: () => void;
  loggingOut: boolean;
}

function NotificationsBell() {
  const { all } = useNotifications();
  const unread = all.filter((n) => !n.read_at).length;
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
      className="relative flex h-9 w-9 items-center justify-center rounded-md text-text/70 hover:text-text hover:bg-text/[0.05]"
    >
      <Bell className="w-[18px] h-[18px]" aria-hidden />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-accent px-1 text-[10px] leading-[18px] text-white text-center">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

/**
 * Top of every page. Desktop: breadcrumb, jump search, help, notifications (admin), user menu.
 * Phone: back arrow on detail pages, the page name, search and help.
 */
export function TopBar({ role, username, onOpenSearch, onOpenHelp, onLogout, loggingOut }: TopBarProps) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const items = getNavItemsForRole(role);
  const active = findActiveItem(pathname, items);
  const crumbs = breadcrumbFor(pathname, items);
  const isDetail = active !== undefined && pathname !== active.href;

  function goBack() {
    // Deep links have no history to go back to: fall back to the parent list.
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else if (active) router.push(active.href);
  }

  return (
    <header
      style={{ viewTransitionName: "app-topbar" }}
      className="sticky top-0 z-30 print:hidden glass-bar border-b border-divider"
    >
      <div className="flex items-center gap-2 h-14 px-4 lg:px-6">
        {isDetail && (
          <button
            type="button"
            onClick={goBack}
            aria-label="Back"
            className="lg:hidden flex h-9 w-9 -ml-2 items-center justify-center rounded-md hover:bg-text/[0.05]"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
        )}

        <nav aria-label="Breadcrumb" className="hidden lg:block">
          <ol className="flex items-center gap-1 list-none m-0 p-0 text-sm">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="w-3.5 h-3.5 text-text/35" aria-hidden />}
                {crumb.href && (isDetail || index < crumbs.length - 1) ? (
                  <Link href={crumb.href} className="text-text/60 hover:text-text no-underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={index === crumbs.length - 1 ? "font-medium" : "text-text/50"}>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <span className="lg:hidden font-medium text-base truncate">{active?.label ?? "Promise Electronic Shop"}</span>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden lg:flex items-center gap-2 w-72 rounded-md border border-divider bg-surface/60 px-3 py-1.5 text-sm text-text/50 hover:border-accent/40"
          >
            <Search className="w-4 h-4" aria-hidden />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="rounded-sm border border-divider px-1.5 text-[11px] font-sans">Ctrl K</kbd>
          </button>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md text-text/70 hover:bg-text/[0.05]"
          >
            <Search className="w-[18px] h-[18px]" aria-hidden />
          </button>
          <HelpButton onClick={onOpenHelp} />
          {role === "admin" && <NotificationsBell />}
          <div className="hidden lg:block">
            <UserMenu username={username} role={role} onLogout={onLogout} loggingOut={loggingOut} />
          </div>
        </div>
      </div>
    </header>
  );
}
