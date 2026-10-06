"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";

interface ScrollAreaProps {
  orientation?: "vertical" | "horizontal";
  /** Horizontal only: children snap into place one by one. */
  snap?: boolean;
  /** Fade the edges that hide more content (default on). */
  fadeEdges?: boolean;
  className?: string;
  children: ReactNode;
  /** Makes the area a labelled, keyboard-focusable region. */
  label?: string;
  /** Vertical only: caps the height so the area scrolls on its own. */
  maxHeight?: string;
}

const FADE_PX = 24;

function maskFor(horizontal: boolean, atStart: boolean, atEnd: boolean): string {
  if (atStart && atEnd) return "";
  const dir = horizontal ? "to right" : "to bottom";
  const start = atStart ? "#000 0px" : `transparent 0px, #000 ${FADE_PX}px`;
  const end = atEnd ? "#000 100%" : `#000 calc(100% - ${FADE_PX}px), transparent 100%`;
  return `linear-gradient(${dir}, ${start}, ${end})`;
}

/**
 * A scroll container that fits its content: a styled scrollbar, soft fades on whichever edge
 * still hides content (so the user can see there is more), and optional snapping for
 * horizontal rows. `data-at-start` / `data-at-end` reflect the current position.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { orientation = "vertical", snap = false, fadeEdges = true, className = "", children, label, maxHeight },
  forwardedRef
) {
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement);
  const horizontal = orientation === "horizontal";
  const [edges, setEdges] = useState({ atStart: true, atEnd: true });
  const frame = useRef(0);

  const measure = useCallback(() => {
    frame.current = 0;
    const el = ref.current;
    if (!el) return;
    const pos = horizontal ? el.scrollLeft : el.scrollTop;
    const size = horizontal ? el.scrollWidth : el.scrollHeight;
    const view = horizontal ? el.clientWidth : el.clientHeight;
    const next = { atStart: pos <= 1, atEnd: pos + view >= size - 1 };
    setEdges((prev) => (prev.atStart === next.atStart && prev.atEnd === next.atEnd ? prev : next));
  }, [horizontal]);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      observer?.disconnect();
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure, schedule]);

  const mask = fadeEdges ? maskFor(horizontal, edges.atStart, edges.atEnd) : "";
  const overflow = horizontal
    ? `overflow-x-auto overflow-y-hidden ${snap ? "snap-x snap-mandatory [&>*]:snap-start" : ""}`
    : "overflow-y-auto overflow-x-hidden";

  return (
    <div
      ref={ref}
      onScroll={schedule}
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={label ? 0 : undefined}
      data-at-start={edges.atStart}
      data-at-end={edges.atEnd}
      className={`scroll-styled overscroll-contain ${overflow} ${className}`}
      style={{
        maxHeight: !horizontal ? maxHeight : undefined,
        maskImage: mask || undefined,
        WebkitMaskImage: mask || undefined,
      }}
    >
      {children}
    </div>
  );
});
