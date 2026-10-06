import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DURATION, SPRING, pageVariants, listContainer, listItem, useReducedMotionSafe } from "./motion";
import { useMediaQuery, DESKTOP_QUERY } from "./useMediaQuery";
import { setMatchMedia } from "./test/matchMedia";

describe("motion tokens", () => {
  it("never animates longer than 300ms", () => {
    for (const value of Object.values(DURATION)) expect(value).toBeLessThanOrEqual(0.3);
  });

  it("page variants start transparent and slightly lower, and animate only transform/opacity", () => {
    expect(pageVariants.initial).toMatchObject({ opacity: 0, y: 8 });
    expect(pageVariants.animate).toMatchObject({ opacity: 1, y: 0 });
    for (const variant of [pageVariants.initial, pageVariants.animate, pageVariants.exit]) {
      const keys = Object.keys(variant as object).filter((k) => k !== "transition");
      expect(keys.every((k) => ["opacity", "x", "y", "scale"].includes(k))).toBe(true);
    }
  });

  it("list items stagger in from below", () => {
    expect(listItem.hidden).toMatchObject({ opacity: 0, y: 6 });
    expect(listItem.show).toMatchObject({ opacity: 1, y: 0 });
    expect(listContainer.show).toHaveProperty("transition.staggerChildren");
  });

  it("springs are springs", () => {
    expect(SPRING.sheet.type).toBe("spring");
    expect(SPRING.pill.type).toBe("spring");
  });
});

describe("useReducedMotionSafe / useMediaQuery", () => {
  it("follows the reduced-motion preference and reacts to changes", () => {
    const { result } = renderHook(() => useReducedMotionSafe());
    expect(result.current).toBe(true); // test default
    act(() => setMatchMedia({ reducedMotion: false }));
    expect(result.current).toBe(false);
  });

  it("reports desktop vs phone width", () => {
    const { result } = renderHook(() => useMediaQuery(DESKTOP_QUERY));
    expect(result.current).toBe(true);
    act(() => setMatchMedia({ desktop: false }));
    expect(result.current).toBe(false);
  });
});
