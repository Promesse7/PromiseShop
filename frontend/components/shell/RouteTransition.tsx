"use client";

import * as React from "react";
import type { ReactNode } from "react";

/**
 * React's <ViewTransition> ships in the React build Next.js uses at runtime (canary), but not
 * in the stable `react` package that tests resolve. Read it off the module at runtime and fall
 * back to rendering children unchanged, so the app works (just without route animation)
 * anywhere it's missing.
 */
type ViewTransitionProps = {
  children: ReactNode;
  enter?: string | Record<string, string>;
  exit?: string | Record<string, string>;
  default?: string;
};
const ViewTransition = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition;

/** Classes the CSS in globals.css animates: forward pages rise in, `nav-back` drops in from above. */
const ENTER = { "nav-back": "page-back", default: "page-forward" };
const EXIT = { "nav-back": "page-back", default: "page-forward" };

/**
 * Animates page content on route changes. Keyed by pathname in AppShell, so each route change
 * mounts a new transition boundary and its enter/exit animations run (a layout-level boundary
 * would otherwise persist and never animate). Search-param changes don't remount it.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition enter={ENTER} exit={EXIT} default="none">
      {children}
    </ViewTransition>
  );
}
