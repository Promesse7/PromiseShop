import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollDirection } from "./useScrollDirection";
import { useHasScrolled } from "./useHasScrolled";

function scrollTo(y: number, docHeight = 5000) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: docHeight });
  window.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  // Run rAF callbacks synchronously so each scroll event is processed immediately.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  scrollTo(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
  scrollTo(0);
});

describe("useScrollDirection", () => {
  it('is "up" at rest', () => {
    const { result } = renderHook(() => useScrollDirection());
    expect(result.current).toBe("up");
  });

  it('turns "down" when scrolling down past the threshold, and "up" when scrolling back', () => {
    const { result } = renderHook(() => useScrollDirection());
    act(() => scrollTo(300));
    expect(result.current).toBe("down");
    act(() => scrollTo(200));
    expect(result.current).toBe("up");
  });

  it("ignores movements smaller than the threshold", () => {
    const { result } = renderHook(() => useScrollDirection({ threshold: 20 }));
    act(() => scrollTo(300));
    expect(result.current).toBe("down");
    act(() => scrollTo(290));
    expect(result.current).toBe("down");
  });

  it('stays "up" near the top of the page', () => {
    const { result } = renderHook(() => useScrollDirection());
    act(() => scrollTo(40));
    expect(result.current).toBe("up");
  });

  it('is "up" at the bottom of the page so the chrome comes back', () => {
    const { result } = renderHook(() => useScrollDirection());
    act(() => scrollTo(1000, 2000));
    expect(result.current).toBe("down");
    act(() => scrollTo(1200, 2000)); // 1200 + 800 viewport = bottom
    expect(result.current).toBe("up");
  });
});

describe("useHasScrolled", () => {
  it("is false at the top and true once past the offset", () => {
    const { result } = renderHook(() => useHasScrolled());
    expect(result.current).toBe(false);
    act(() => scrollTo(20));
    expect(result.current).toBe(true);
    act(() => scrollTo(0));
    expect(result.current).toBe(false);
  });

  it("respects a custom offset", () => {
    const { result } = renderHook(() => useHasScrolled(100));
    act(() => scrollTo(50));
    expect(result.current).toBe(false);
    act(() => scrollTo(150));
    expect(result.current).toBe(true);
  });
});
