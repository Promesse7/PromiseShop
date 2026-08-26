import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Barcode } from "./Barcode";

describe("Barcode", () => {
  it("renders an SVG barcode for the given value", () => {
    const { container } = render(<Barcode value="PES-TV-00082" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("aria-label", "Barcode for PES-TV-00082");
    expect(svg?.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});
