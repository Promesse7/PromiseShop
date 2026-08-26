import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Barcode } from "./Barcode";

// Mock jsbarcode to avoid canvas issues in test environment
vi.mock("jsbarcode", () => ({
  default: vi.fn((element, value, options) => {
    if (!element) return;
    // Create the SVG structure that jsbarcode would create
    const svg = element as SVGSVGElement;
    // Add rects to simulate barcode bars
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", "1");
    rect.setAttribute("height", "40");
    rect.setAttribute("x", "0");
    rect.setAttribute("y", "0");
    svg.appendChild(rect);
  }),
}));

describe("Barcode", () => {
  it("renders an SVG barcode for the given value", () => {
    const { container } = render(<Barcode value="PES-TV-00082" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Barcode for PES-TV-00082");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});
