import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("text-accent");
    expect(button.className).toContain("border-accent");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const button = screen.getByRole("button", { name: "Cancel" });
    expect(button.className).toContain("border-divider");
  });

  it("applies block width class when block prop is set", () => {
    render(<Button block>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("w-full");
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("renders as a link with the same classes when href is set", () => {
    render(<Button href="/checkout">New Sale</Button>);
    const link = screen.getByRole("link", { name: "New Sale" });
    expect(link).toHaveAttribute("href", "/checkout");
    expect(link.className).toContain("text-accent");
  });
});
