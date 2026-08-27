import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("renders the given message and a Try again control", () => {
    render(<ErrorState message="Couldn't load products." />);
    expect(screen.getByText("Couldn't load products.")).toBeInTheDocument();
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });
});
