import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "@/lib/test/matchMedia";
import { TAB_BAR_HEIGHT, useBottomChromeHidden, useStickyBottomOffset } from "./chrome";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 5000 });
  scrollTo(0);
  document.body.style.overflow = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("useBottomChromeHidden", () => {
  it("hides the phone chrome while scrolling down, and shows it again on scroll up", () => {
    act(() => setMatchMedia({ desktop: false, reducedMotion: false }));
    const { result } = renderHook(() => useBottomChromeHidden());
    expect(result.current).toBe(false);
    act(() => scrollTo(400));
    expect(result.current).toBe(true);
    act(() => scrollTo(300));
    expect(result.current).toBe(false);
  });

  it("never hides on desktop", () => {
    act(() => setMatchMedia({ desktop: true, reducedMotion: false }));
    const { result } = renderHook(() => useBottomChromeHidden());
    act(() => scrollTo(400));
    expect(result.current).toBe(false);
  });

  it("never hides with reduced motion", () => {
    act(() => setMatchMedia({ desktop: false, reducedMotion: true }));
    const { result } = renderHook(() => useBottomChromeHidden());
    act(() => scrollTo(400));
    expect(result.current).toBe(false);
  });

  it("comes back while a dialog has locked the page scroll", async () => {
    act(() => setMatchMedia({ desktop: false, reducedMotion: false }));
    const { result } = renderHook(() => useBottomChromeHidden());
    act(() => scrollTo(400));
    expect(result.current).toBe(true);
    act(() => {
      document.body.style.overflow = "hidden";
    });
    await waitFor(() => expect(result.current).toBe(false));
  });
});

describe("useStickyBottomOffset", () => {
  it("sits above the tab bar on phone while the tab bar shows", () => {
    act(() => setMatchMedia({ desktop: false, reducedMotion: false }));
    const { result } = renderHook(() => useStickyBottomOffset());
    expect(result.current).toBe(TAB_BAR_HEIGHT);
  });

  it("drops to the bottom edge while the tab bar is hidden", () => {
    act(() => setMatchMedia({ desktop: false, reducedMotion: false }));
    const { result } = renderHook(() => useStickyBottomOffset());
    act(() => scrollTo(400));
    expect(result.current).toBe(0);
  });

  it("is 0 on desktop", () => {
    act(() => setMatchMedia({ desktop: true }));
    const { result } = renderHook(() => useStickyBottomOffset());
    expect(result.current).toBe(0);
  });
});
