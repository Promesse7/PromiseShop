"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ChevronsLeft, ChevronsRight, Zap } from "lucide-react";
import { findActiveItem, getNavGroupsForRole, getNavItemsForRole } from "@/lib/nav/navModel";
import { DURATION, EASE, SPRING, useReducedMotionSafe } from "@/lib/motion";
import type { EmployeeRole } from "@/lib/types";
import { ScrollArea } from "@/components/ui/ScrollArea";

interface SidebarProps {
  role: EmployeeRole;
  collapsed: boolean;
  onToggle: () => void;
}

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

/** Desktop navigation: grouped links, collapsible to an icon rail; the active pill glides. */
export function Sidebar({ role, collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname() ?? "/";
  const reduced = useReducedMotionSafe();
  const groups = getNavGroupsForRole(role);
  const active = findActiveItem(pathname, getNavItemsForRole(role));
  const navRef = useRef<HTMLElement>(null);

  // Keep the current page's link in view when the list is taller than the screen.
  useEffect(() => {
    const current = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    current?.scrollIntoView?.({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [active?.href, collapsed, reduced]);

  return (
    <motion.aside
      aria-label="Main navigation"
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.out }}
      style={{ viewTransitionName: "app-sidebar" }}
      className="hidden lg:flex print:hidden sticky top-0 h-screen shrink-0 flex-col bg-surface/85 backdrop-blur-md border-r border-divider overflow-hidden"
    >
      <div className="flex items-center gap-2 h-14 px-5 shrink-0">
        <Zap className="w-5 h-5 text-accent shrink-0" aria-hidden />
        {!collapsed && <span className="font-medium text-sm whitespace-nowrap">Promise Electronic Shop</span>}
      </div>

      {/* Scrolls on its own when the list is taller than the screen; edges fade where more links hide. */}
      <ScrollArea className="flex-1 min-h-0 overflow-x-hidden">
      <nav ref={navRef} className="px-3 pb-3">
        {groups.map((group) => (
          <div key={group.id} className="mt-3 first:mt-0">
            {collapsed ? (
              <div className="mx-2 my-2 border-t border-divider" aria-hidden />
            ) : (
              <p className="px-3 mb-1 text-[11px] font-medium uppercase tracking-wider text-text/45">{group.label}</p>
            )}
            <ul className="list-none m-0 p-0 flex flex-col gap-0.5">
              {group.items.map((item) => {
                const isActive = active?.href === item.href;
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={[
                        "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm no-underline transition-colors",
                        isActive ? "text-accent font-medium" : "text-text/75 hover:text-text hover:bg-text/[0.05]",
                      ].join(" ")}
                    >
                      {isActive && (
                        <motion.span
                          layoutId={reduced ? undefined : "nav-pill"}
                          transition={SPRING.pill}
                          className="absolute inset-0 rounded-md bg-accent/10"
                          aria-hidden
                        />
                      )}
                      <Icon className="relative w-[18px] h-[18px] shrink-0" aria-hidden />
                      {!collapsed && <span className="relative whitespace-nowrap">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      </ScrollArea>

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="m-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text/60 hover:text-text hover:bg-text/[0.05]"
      >
        {collapsed ? <ChevronsRight className="w-4 h-4" aria-hidden /> : <ChevronsLeft className="w-4 h-4" aria-hidden />}
        {!collapsed && <span>Collapse</span>}
      </button>
    </motion.aside>
  );
}
