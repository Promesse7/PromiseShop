import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardGridSkeleton } from "./CardGridSkeleton";

describe("CardGridSkeleton", () => {
  it("renders a labeled status region with placeholder cards", () => {
    render(<CardGridSkeleton label="Loading products…" count={3} />);
    const status = screen.getByRole("status", { name: "Loading products…" });
    expect(status.children).toHaveLength(3);
  });
});
