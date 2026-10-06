import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatchMedia } from "@/lib/test/matchMedia";
import { Reveal, RevealList } from "./Reveal";

beforeEach(() => {
  // motion's whileInView needs an IntersectionObserver; jsdom has none.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("Reveal", () => {
  it("renders its content as the requested element", () => {
    render(
      <Reveal as="section" className="mine">
        <p>Totals</p>
      </Reveal>
    );
    const section = screen.getByText("Totals").parentElement as HTMLElement;
    expect(section.tagName).toBe("SECTION");
    expect(section).toHaveClass("mine");
  });

  it("is a plain, fully visible element with reduced motion", () => {
    render(
      <Reveal>
        <p>Totals</p>
      </Reveal>
    );
    const wrapper = screen.getByText("Totals").parentElement as HTMLElement;
    expect(wrapper.style.opacity).toBe("");
    expect(wrapper.style.transform).toBe("");
  });

  it("starts hidden and lowered when motion is allowed, until scrolled into view", () => {
    act(() => setMatchMedia({ reducedMotion: false }));
    render(
      <Reveal>
        <p>Totals</p>
      </Reveal>
    );
    const wrapper = screen.getByText("Totals").parentElement as HTMLElement;
    expect(wrapper.style.opacity).toBe("0");
    expect(wrapper.style.transform).toMatch(/translateY\(12px\)/);
  });
});

describe("RevealList", () => {
  it("renders a list whose items are revealed together", () => {
    render(
      <RevealList className="grid">
        <li>One</li>
        <li>Two</li>
      </RevealList>
    );
    const list = screen.getByRole("list");
    expect(list).toHaveClass("grid");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("starts each item hidden when motion is allowed", () => {
    act(() => setMatchMedia({ reducedMotion: false }));
    render(
      <RevealList>
        <li>One</li>
        <li>Two</li>
      </RevealList>
    );
    for (const item of screen.getAllByRole("listitem")) {
      expect((item as HTMLElement).style.opacity).toBe("0");
    }
  });
});
