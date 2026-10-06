import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState";

describe("LoadingState", () => {
  it("is announced as busy with an accessible label", () => {
    render(<LoadingState variant="table" label="Loading sales…" />);
    const status = screen.getByRole("status", { name: "Loading sales…" });
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("renders the requested number of table rows", () => {
    render(<LoadingState variant="table" rows={3} />);
    expect(screen.getAllByTestId("loading-row")).toHaveLength(3);
  });

  it("has card, detail and form shapes", () => {
    for (const variant of ["cards", "detail", "form"] as const) {
      const { unmount } = render(<LoadingState variant={variant} />);
      expect(screen.getByRole("status")).toHaveAttribute("data-variant", variant);
      unmount();
    }
  });
});
