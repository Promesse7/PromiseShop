"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronRight, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";
import { Dialog } from "./Dialog";

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageAction {
  label: string;
  onSelect: () => void;
}

interface PageProps {
  title: string;
  /** One line under the title saying what the page is for. */
  description?: string;
  /** Group › list › item trail. The app shell also derives one; pass it to add the detail label. */
  breadcrumb?: Crumb[];
  /** The page's single main action, right-aligned in the header. */
  primaryAction?: ReactNode;
  /** Less common actions, tucked into a "⋯" menu. */
  secondaryActions?: PageAction[];
  /** Search / filters / view toggles, between the header and the content. */
  toolbar?: ReactNode;
  /** Parent list for detail pages: shows a back arrow. */
  back?: string;
  children: ReactNode;
}

/**
 * The frame every screen uses: header (title, description, primary action, ⋯ menu), optional
 * toolbar, then content. Page transitions are handled once by the app shell's template, so
 * Page itself doesn't animate.
 */
export function Page({ title, description, breadcrumb, primaryAction, secondaryActions, toolbar, back, children }: PageProps) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
        <div className="flex flex-wrap items-center gap-3">
          {back && (
            <Link
              href={back}
              transitionTypes={["nav-back"]}
              aria-label="Back"
              className="-ml-1 rounded-md p-1 text-text/60 hover:bg-text/[0.07] hover:text-text"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-xl font-semibold leading-tight">{title}</h1>
            {description && <p className="m-0 mt-0.5 text-sm text-text/60">{description}</p>}
          </div>
          {(primaryAction || (secondaryActions && secondaryActions.length > 0)) && (
            <div className="flex items-center gap-2">
              {primaryAction}
              {secondaryActions && secondaryActions.length > 0 && <ActionsMenu actions={secondaryActions} />}
            </div>
          )}
        </div>
      </header>
      {toolbar}
      <div>{children}</div>
    </div>
  );
}

function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="hidden text-xs text-text/50 lg:block">
      <ol className="m-0 flex list-none items-center gap-1 p-0">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
            {item.href ? (
              <Link href={item.href} className="hover:text-accent">
                {item.label}
              </Link>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ActionsMenu({ actions }: { actions: PageAction[] }) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotionSafe();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu = open ? (
    <motion.ul
      key="menu"
      role="menu"
      className="absolute right-0 top-full z-30 m-0 mt-1 min-w-44 list-none rounded-md border border-divider bg-surface p-1 shadow-md"
      initial={reduced ? false : { opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.fast, ease: EASE.out } }}
      exit={{ opacity: 0, y: -4, transition: { duration: DURATION.fast } }}
    >
      {actions.map((action) => (
        <li key={action.label} role="none">
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-text/[0.07]"
            onClick={() => {
              setOpen(false);
              action.onSelect();
            }}
          >
            {action.label}
          </button>
        </li>
      ))}
    </motion.ul>
  ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-divider p-1.5 text-text/70 hover:bg-text/[0.07]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {reduced ? menu : <AnimatePresence>{menu}</AnimatePresence>}
    </div>
  );
}

interface ToolbarProps {
  /** Usually a search input; always visible. */
  search?: ReactNode;
  /** Filter controls; on phone they move into a "Filters" sheet. */
  filters?: ReactNode;
  /** How many filters are set, shown on the phone Filters button. */
  activeFilterCount?: number;
  /** View toggles, date pickers etc., at the end of the row. */
  trailing?: ReactNode;
}

/** Search · filters · trailing in one row on desktop; search + a Filters (n) sheet on phone. */
export function Toolbar({ search, filters, activeFilterCount = 0, trailing }: ToolbarProps) {
  const isDesktop = useIsDesktop();
  const [filtersOpen, setFiltersOpen] = useState(false);

  if (isDesktop) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {search && <div className="min-w-[220px] flex-1 sm:max-w-sm">{search}</div>}
        {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
        {trailing && <div className="ml-auto flex items-center gap-2">{trailing}</div>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {search && <div className="min-w-0 flex-1">{search}</div>}
      {filters && (
        <>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-divider px-2.5 py-1.5 text-sm"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
          </button>
          <Dialog open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
            <div className="flex flex-col items-stretch gap-3">{filters}</div>
          </Dialog>
        </>
      )}
      {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
    </div>
  );
}
