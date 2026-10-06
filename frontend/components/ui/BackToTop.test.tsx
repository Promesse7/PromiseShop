import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "@/lib/test/matchMedia";
import { BackToTop } from "./BackToTop";

let scrollToSpy: ReturnType<typeof vi.fn>;

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
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 10000 });
  scrollToSpy = vi.fn();
  window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
  scrollTo(0);
});

afterEach(() => vi.unstubAllGlobals());

describe("BackToTop", () => {
  it("is hidden near the top of the page", () => {
    render(<BackToTop />);
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
  });

  it("appears after about two screens of scrolling", () => {
    render(<BackToTop />);
    act(() => scrollTo(1500));
    expect(screen.queryByRole("button", { name: "Back to top" })).not.toBeInTheDocument();
    act(() => scrollTo(1700));
    expect(screen.getByRole("button", { name: "Back to top" })).toBeInTheDocument();
  });

  it("scrolls instantly to the top with reduced motion", async () => {
    render(<BackToTop />);
    act(() => scrollTo(3000));
    await userEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0, behavior: "instant" }));
  });

  it("scrolls smoothly to the top when motion is allowed", async () => {
    act(() => setMatchMedia({ reducedMotion: false }));
    render(<BackToTop />);
    act(() => scrollTo(3000));
    await userEvent.click(screen.getByRole("button", { name: "Back to top" }));
    expect(scrollToSpy).toHaveBeenCalledWith(expect.objectContaining({ top: 0, behavior: "smooth" }));
  });

  it("sits above the tab bar on phone", () => {
    act(() => setMatchMedia({ desktop: false }));
    render(<BackToTop />);
    act(() => scrollTo(1700));
    expect(screen.getByRole("button", { name: "Back to top" }).style.bottom).toBe(
      "calc(80px + env(safe-area-inset-bottom))"
    );
  });

  it("sits 24px from the bottom on desktop and never prints", () => {
    render(<BackToTop />);
    act(() => scrollTo(1700));
    const button = screen.getByRole("button", { name: "Back to top" });
    expect(button.style.bottom).toBe("24px");
    expect(button).toHaveClass("print:hidden");
  });
});
