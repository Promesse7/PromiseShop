import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollArea } from "./ScrollArea";

function setBox(el: HTMLElement, box: { scrollLeft?: number; scrollWidth?: number; clientWidth?: number; scrollTop?: number; scrollHeight?: number; clientHeight?: number }) {
  for (const [key, value] of Object.entries(box)) {
    Object.defineProperty(el, key, { configurable: true, value });
  }
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("ScrollArea", () => {
  it("renders its children in a styled scroll container", () => {
    render(<ScrollArea>hello</ScrollArea>);
    const area = screen.getByText("hello");
    expect(area).toHaveClass("scroll-styled");
  });

  it("is a labelled, focusable region when given a label", () => {
    render(<ScrollArea label="Filters">chips</ScrollArea>);
    const region = screen.getByRole("region", { name: "Filters" });
    expect(region).toHaveAttribute("tabindex", "0");
  });

  it("marks which horizontal edges have hidden content as the user scrolls", () => {
    render(
      <ScrollArea orientation="horizontal" label="Row">
        items
      </ScrollArea>
    );
    const region = screen.getByRole("region", { name: "Row" });

    setBox(region, { scrollLeft: 0, scrollWidth: 600, clientWidth: 300 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region).toHaveAttribute("data-at-start", "true");
    expect(region).toHaveAttribute("data-at-end", "false");

    setBox(region, { scrollLeft: 150 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region).toHaveAttribute("data-at-start", "false");
    expect(region).toHaveAttribute("data-at-end", "false");

    setBox(region, { scrollLeft: 300 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region).toHaveAttribute("data-at-end", "true");
  });

  it("only fades the edges that hide content", () => {
    render(
      <ScrollArea orientation="horizontal" label="Row">
        items
      </ScrollArea>
    );
    const region = screen.getByRole("region", { name: "Row" });
    setBox(region, { scrollLeft: 0, scrollWidth: 600, clientWidth: 300 });
    act(() => {
      fireEvent.scroll(region);
    });
    // Content hidden only on the right: the mask fades the right edge, not the left.
    expect(region.style.maskImage || region.style.webkitMaskImage).toMatch(/linear-gradient\(to right, #000 0px/);
  });

  it("has no fade when nothing overflows, or when fades are turned off", () => {
    const { rerender } = render(
      <ScrollArea orientation="horizontal" label="Row">
        items
      </ScrollArea>
    );
    const region = screen.getByRole("region", { name: "Row" });
    setBox(region, { scrollLeft: 0, scrollWidth: 300, clientWidth: 300 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region.style.maskImage || region.style.webkitMaskImage || "").toBe("");

    rerender(
      <ScrollArea orientation="horizontal" label="Row" fadeEdges={false}>
        items
      </ScrollArea>
    );
    setBox(region, { scrollLeft: 0, scrollWidth: 600, clientWidth: 300 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region.style.maskImage || region.style.webkitMaskImage || "").toBe("");
  });

  it("tracks vertical edges too", () => {
    render(
      <ScrollArea label="List" maxHeight="200px">
        rows
      </ScrollArea>
    );
    const region = screen.getByRole("region", { name: "List" });
    expect(region).toHaveStyle({ maxHeight: "200px" });
    setBox(region, { scrollTop: 0, scrollHeight: 800, clientHeight: 200 });
    act(() => {
      fireEvent.scroll(region);
    });
    expect(region).toHaveAttribute("data-at-start", "true");
    expect(region).toHaveAttribute("data-at-end", "false");
  });

  it("snaps horizontal children when asked", () => {
    render(
      <ScrollArea orientation="horizontal" snap label="Row">
        <span>a</span>
      </ScrollArea>
    );
    expect(screen.getByRole("region", { name: "Row" }).className).toMatch(/snap-x/);
  });

  it("forwards its ref to the scroll container", () => {
    const ref = createRef<HTMLDivElement>();
    render(<ScrollArea ref={ref}>x</ScrollArea>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveClass("scroll-styled");
  });
});
