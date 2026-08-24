import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tag } from "./Tag";

describe("Tag", () => {
  it("renders children", () => {
    render(<Tag>Admin</Tag>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("applies outline variant classes by default", () => {
    render(<Tag>Admin</Tag>);
    expect(screen.getByText("Admin").className).toContain("border-accent");
  });

  it("applies accent variant classes", () => {
    render(<Tag variant="accent">New</Tag>);
    expect(screen.getByText("New").className).toContain("bg-accent-800");
  });

  it("applies neutral variant classes", () => {
    render(<Tag variant="neutral">Draft</Tag>);
    expect(screen.getByText("Draft").className).toContain("bg-neutral-800");
  });
});
