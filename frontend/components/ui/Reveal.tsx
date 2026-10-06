"use client";

import { Children, isValidElement, type ReactNode } from "react";
import { motion } from "motion/react";
import { DURATION, EASE, listContainer, listItem, useReducedMotionSafe } from "@/lib/motion";

const VIEWPORT = { once: true, margin: "-40px" } as const;

interface RevealProps {
  children: ReactNode;
  /** Seconds to wait before revealing (for staggering a few sections by hand). */
  delay?: number;
  as?: "div" | "section" | "li";
  className?: string;
}

/**
 * Fades and rises content into place the first time it scrolls into view, then stays put
 * (scrolling back never re-animates). A plain element with reduced motion.
 */
export function Reveal({ children, delay = 0, as = "div", className }: RevealProps) {
  const reduced = useReducedMotionSafe();
  if (reduced) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: DURATION.base, ease: EASE.out, delay }}
    >
      {children}
    </MotionTag>
  );
}

interface RevealListProps {
  /** `<li>` children; each is staggered in when the list first scrolls into view. */
  children: ReactNode;
  className?: string;
}

/** A `<ul>` whose items stagger into view once, when the list first scrolls into view. */
export function RevealList({ children, className }: RevealListProps) {
  const reduced = useReducedMotionSafe();
  if (reduced) return <ul className={className}>{children}</ul>;
  return (
    <motion.ul className={className} variants={listContainer} initial="hidden" whileInView="show" viewport={VIEWPORT}>
      {Children.map(children, (child) =>
        isValidElement<{ children?: ReactNode; className?: string }>(child) ? (
          <motion.li key={child.key ?? undefined} variants={listItem} className={child.props.className}>
            {child.props.children}
          </motion.li>
        ) : (
          child
        )
      )}
    </motion.ul>
  );
}
