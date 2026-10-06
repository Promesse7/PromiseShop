import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History", count: 3 },
  { id: "movements", label: "Movements" },
];

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState("overview");
  return (
    <Tabs
      tabs={TABS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      label="Product sections"
    >
      {(active) => <p>Panel: {active}</p>}
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders a labelled tablist with the active tab selected and its panel", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Product sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel: overview");
  });

  it("shows a count badge on a tab", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /History/ })).toHaveTextContent("3");
  });

  it("switches tab on click", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Movements" }));
    expect(onChange).toHaveBeenCalledWith("movements");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel: movements");
  });

  it("moves between tabs with the arrow keys, wrapping at the ends", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "Overview" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the tab row a scrollable region on narrow screens", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist").closest("[data-at-start]")).not.toBeNull();
  });

  it("only the active tab is in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /History/ })).toHaveAttribute("tabindex", "-1");
  });
});

describe("Tabs (scroll memory)", () => {
  let scrollY = 0;
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    scrollY = options.top ?? scrollY;
  });
  // The tab row sits 400px down the page; the top bar is 56px tall.
  const TAB_ROW_TOP = 400;

  beforeEach(() => {
    scrollY = 0;
    scrollTo.mockClear();
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    vi.stubGlobal("scrollTo", scrollTo);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.getAttribute("role") === "tablist" ? TAB_ROW_TOP - scrollY : 0;
      return { top, bottom: top + 40, left: 0, right: 0, width: 0, height: 40, x: 0, y: top, toJSON() {} } as DOMRect;
    });
    // Element scrolling (the tab strip) is separate from window scrolling (the page).
    HTMLElement.prototype.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo;
  });

  it("brings the tab row back under the top bar when switching from deep in a tab", async () => {
    render(<Harness />);
    scrollY = 1200;
    await userEvent.click(screen.getByRole("tab", { name: /History/ }));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: TAB_ROW_TOP - 56 }));
  });

  it("returns to where you were when you come back to a tab", async () => {
    render(<Harness />);
    scrollY = 1200;
    await userEvent.click(screen.getByRole("tab", { name: /History/ }));
    scrollY = 900;
    await userEvent.click(screen.getByRole("tab", { name: "Overview" }));
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 1200 }));
  });

  it("does not move the page when the tab row is still below the top bar", async () => {
    render(<Harness />);
    scrollY = 100;
    await userEvent.click(screen.getByRole("tab", { name: "Movements" }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls the active tab into view sideways, without moving the page", async () => {
    // A crowded row 300px wide: "Movements" sits at 500–580px, off its right edge.
    const metric = (name: "offsetLeft" | "offsetWidth" | "clientWidth", get: (el: HTMLElement) => number) =>
      vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(function (this: HTMLElement) {
        return get(this);
      });
    metric("offsetLeft", (el) => (el.textContent === "Movements" ? 500 : 0));
    metric("offsetWidth", () => 80);
    metric("clientWidth", () => 300);
    const stripScroll = HTMLElement.prototype.scrollTo;

    render(<Harness />);
    await userEvent.click(screen.getByRole("tab", { name: "Movements" }));
    expect(stripScroll).toHaveBeenCalledWith(expect.objectContaining({ left: 500 + 80 - 300 + 8 }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
