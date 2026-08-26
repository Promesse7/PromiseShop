import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardKicker, CardTitle, CardBody, CardMeta } from "./Card";

describe("Card", () => {
  it("renders its subcomponents", () => {
    render(
      <Card>
        <CardKicker>Category</CardKicker>
        <CardTitle>Product Name</CardTitle>
        <CardBody>Description text</CardBody>
        <CardMeta>Meta info</CardMeta>
      </Card>
    );
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(screen.getByText("Product Name")).toBeInTheDocument();
    expect(screen.getByText("Description text")).toBeInTheDocument();
    expect(screen.getByText("Meta info")).toBeInTheDocument();
  });

  it("applies elevation classes based on the elevation prop", () => {
    const { container } = render(<Card elevation="lg">content</Card>);
    expect(container.firstChild).toHaveClass("shadow-lg");
  });

  it("defaults to no elevation shadow", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).not.toHaveClass("shadow-lg");
    expect(container.firstChild).not.toHaveClass("shadow-md");
    expect(container.firstChild).not.toHaveClass("shadow-sm");
  });

  it("applies glass variant classes when variant is glass", () => {
    const { container } = render(<Card variant="glass">content</Card>);
    expect(container.firstChild).toHaveClass("glass");
    expect(container.firstChild).toHaveClass("glass-hover");
  });

  it("defaults to the solid variant (bg-surface, no glass class)", () => {
    const { container } = render(<Card>content</Card>);
    expect(container.firstChild).toHaveClass("bg-surface");
    expect(container.firstChild).not.toHaveClass("glass");
  });
});
