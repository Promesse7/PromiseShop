"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Menu } from "lucide-react";
import { findActiveItem, getNavItemsForRole, getTabBarItems } from "@/lib/nav/navModel";
import { DURATION, EASE, SPRING, useReducedMotionSafe } from "@/lib/motion";
import { useBottomChromeHidden } from "@/lib/scroll/chrome";
import type { EmployeeRole } from "@/lib/types";

interface TabBarProps {
  role: EmployeeRole;
  onMore: () => void;
}

/** Phone navigation: the role's four shortcuts plus More, fixed to the bottom edge. */
export function TabBar({ role, onMore }: TabBarProps) {
  const pathname = usePathname() ?? "/";
  const reduced = useReducedMotionSafe();
  const tabs = getTabBarItems(role);
  const active = findActiveItem(pathname, getNavItemsForRole(role));
  const moreActive = active !== undefined && !tabs.some((t) => t.href === active.href);
  // Slides away while reading (scrolling down), back on scroll-up or at the page bottom.
  const hidden = useBottomChromeHidden();

  return (
    <motion.nav
      aria-label="Quick navigation"
      data-hidden={hidden ? "true" : "false"}
      initial={false}
      animate={{ y: hidden ? "100%" : "0%" }}
      transition={reduced ? { duration: 0 } : { duration: DURATION.base, ease: EASE.out }}
      style={{ viewTransitionName: "app-tabbar" }}
      className="lg:hidden print:hidden fixed inset-x-0 bottom-0 z-40 glass-bar border-t border-divider pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="list-none m-0 p-0 grid grid-cols-5">
        {tabs.map((tab) => {
          const isActive = active?.href === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "relative flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] no-underline",
                  isActive ? "text-accent font-medium" : "text-text/60",
                ].join(" ")}
              >
                {isActive && (
                  <motion.span
                    layoutId={reduced ? undefined : "tab-pill"}
                    transition={SPRING.pill}
                    className="absolute top-1.5 h-8 w-14 rounded-full bg-accent/10"
                    aria-hidden
                  />
                )}
                <Icon className="relative w-5 h-5" aria-hidden />
                <span className="relative">{tab.label}</span>
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onMore}
            aria-current={moreActive ? "page" : undefined}
            className={[
              "flex w-full flex-col items-center justify-center gap-0.5 h-14 text-[11px]",
              moreActive ? "text-accent font-medium" : "text-text/60",
            ].join(" ")}
          >
            <Menu className="w-5 h-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </motion.nav>
  );
}
