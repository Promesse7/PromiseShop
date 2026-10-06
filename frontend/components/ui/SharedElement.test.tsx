import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SharedElement, sharedName } from "./SharedElement";

describe("SharedElement", () => {
  it("renders its children unchanged when React has no ViewTransition (stable React in tests)", () => {
    render(
      <SharedElement name="product-12">
        <h2>JBL Flip 6</h2>
      </SharedElement>
    );
    expect(screen.getByRole("heading", { name: "JBL Flip 6" })).toBeInTheDocument();
  });

  it("builds stable names from a kind and an id", () => {
    expect(sharedName("product", 12)).toBe("product-12");
    expect(sharedName("sale", "841")).toBe("sale-841");
  });
});
