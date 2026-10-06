"use client";

import * as React from "react";
import type { ReactNode } from "react";

/**
 * React's <ViewTransition> exists in the React build Next.js uses at runtime but not in the
 * stable `react` package tests resolve (see components/shell/RouteTransition.tsx). Read it at
 * runtime; without it, children render unchanged and navigation simply doesn't morph.
 */
type ViewTransitionProps = { children: ReactNode; name?: string; share?: string; default?: string };
const ViewTransition = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> })
  .ViewTransition;

export type SharedKind = "product" | "customer" | "sale" | "asset";

/** Stable morph names: the list card and the detail header use the same one. */
export function sharedName(kind: SharedKind, id: string | number): string {
  return `${kind}-${id}`;
}

/**
 * Marks an element (a card title, a detail header) as the same thing across two routes, so the
 * browser morphs one into the other on navigation. Names must be unique on a page.
 */
export function SharedElement({ name, children }: { name: string; children: ReactNode }) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
