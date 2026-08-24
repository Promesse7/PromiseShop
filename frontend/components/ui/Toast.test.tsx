import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Toast } from "./Toast";

describe("Toast", () => {
  it("renders its message", () => {
    render(<Toast message="Sale completed" variant="success" />);
    expect(screen.getByText("Sale completed")).toBeInTheDocument();
  });

  it("applies success variant classes by default", () => {
    render(<Toast message="Sale completed" />);
    expect(screen.getByRole("status").className).toContain("border-accent");
  });

  it("applies error variant classes", () => {
    render(<Toast message="Something went wrong" variant="error" />);
    expect(screen.getByRole("status").className).toContain("border-red-500");
  });
});
