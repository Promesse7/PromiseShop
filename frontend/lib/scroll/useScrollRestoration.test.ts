import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { useScrollRestoration } from "./useScrollRestoration";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
const mockedPathname = vi.mocked(usePathname);

let scrollToSpy: ReturnType<typeof vi.fn>;

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 10000 });
  scrollToSpy = vi.fn((...args: unknown[]) => {
    const target = args[0] as ScrollToOptions | number;
    const top = typeof target === "number" ? (args[1] as number) : (target.top ?? 0);
    Object.defineProperty(window, "scrollY", { configurable: true, value: top });
  });
  window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  setScrollY(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useScrollRestoration", () => {
  it("takes over scroll restoration from the browser", () => {
    mockedPathname.mockReturnValue("/products");
    renderHook(() => useScrollRestoration());
    expect(history.scrollRestoration).toBe("manual");
  });

  it("opens a newly visited page at the top", () => {
    mockedPathname.mockReturnValue("/products");
    const { rerender } = renderHook(() => useScrollRestoration());
    act(() => setScrollY(1200));
    scrollToSpy.mockClear();

    mockedPathname.mockReturnValue("/products/12");
    rerender();

    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0, behavior: "instant" }));
  });

  it("returns to the saved position when going back", () => {
    mockedPathname.mockReturnValue("/products");
    const { rerender } = renderHook(() => useScrollRestoration());
    act(() => setScrollY(1200));

    mockedPathname.mockReturnValue("/products/12");
    rerender();
    act(() => setScrollY(300));

    scrollToSpy.mockClear();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    mockedPathname.mockReturnValue("/products");
    rerender();

    expect(scrollToSpy).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1200, behavior: "instant" }));
  });

  it("goes to the top on back when nothing was saved for that page", () => {
    mockedPathname.mockReturnValue("/sales");
    const { rerender } = renderHook(() => useScrollRestoration());
    scrollToSpy.mockClear();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    mockedPathname.mockReturnValue("/debts");
    rerender();
    expect(scrollToSpy).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));
  });

  it("keeps working when sessionStorage throws", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockedPathname.mockReturnValue("/products");
    const { rerender } = renderHook(() => useScrollRestoration());
    act(() => setScrollY(500));
    mockedPathname.mockReturnValue("/stock");
    expect(() => rerender()).not.toThrow();
    setItem.mockRestore();
  });
});
