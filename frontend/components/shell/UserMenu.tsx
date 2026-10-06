"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, LogOut } from "lucide-react";
import { Tag } from "@/components/ui/Tag";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import type { EmployeeRole } from "@/lib/types";

export const ROLE_LABEL: Record<EmployeeRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sales_staff: "Sales Staff",
  technician: "Technician",
};

interface UserMenuProps {
  username: string;
  role: EmployeeRole;
  onLogout: () => void;
  loggingOut: boolean;
}

/** Desktop: who is signed in, and Sign out. */
export function UserMenu({ username, role, onLogout, loggingOut }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotionSafe();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-text/[0.05]"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent text-xs font-medium uppercase"
          aria-hidden
        >
          {username.slice(0, 2)}
        </span>
        <span className="hidden xl:inline">{username}</span>
        <ChevronDown className="w-3.5 h-3.5 text-text/50" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: DURATION.fast, ease: EASE.out }}
            className="absolute right-0 mt-1 w-56 rounded-md bg-surface shadow-lg p-2 z-50"
          >
            <div className="px-2 py-1.5">
              <p className="m-0 text-sm font-medium">{username}</p>
              <Tag variant="outline" className="mt-1">
                {ROLE_LABEL[role]}
              </Tag>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              disabled={loggingOut}
              className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-text/[0.05] disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" aria-hidden />
              {loggingOut ? "Signing out…" : "Sign out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
