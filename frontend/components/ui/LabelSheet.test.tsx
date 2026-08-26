import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LabelSheet } from "./LabelSheet";

describe("LabelSheet", () => {
  it("renders its children inside a print-target grid, hidden outside of print", () => {
    const { container } = render(
      <LabelSheet>
        <div>Label A</div>
        <div>Label B</div>
      </LabelSheet>
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("print-target");
    expect(root).toHaveClass("hidden");
    expect(root.children).toHaveLength(2);
  });
});
