import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("renders a hidden placeholder block", () => {
    const { container } = render(<Skeleton className="w-10 h-10" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveAttribute("aria-hidden");
    expect(el).toHaveClass("w-10");
  });
});
