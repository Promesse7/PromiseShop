import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("renders the given message and a Try again control", () => {
    render(<ErrorState message="Couldn't load products." />);
    expect(screen.getByText("Couldn't load products.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("is announced as an alert", () => {
    render(<ErrorState message="Couldn't load products." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load products.");
  });

  it("calls onRetry instead of reloading the page when given", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Couldn't load sales." onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
