import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Package } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";

describe("EmptyState", () => {
  it("shows the title, message and action", () => {
    render(
      <EmptyState
        icon={Package}
        title="No products yet"
        message="Add your first product to start selling."
        action={<Button>+ New product</Button>}
      />
    );
    expect(screen.getByText("No products yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first product to start selling.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New product" })).toBeInTheDocument();
  });

  it("works with only a title", () => {
    render(<EmptyState title="Nothing matches these filters" />);
    expect(screen.getByText("Nothing matches these filters")).toBeInTheDocument();
  });
});
