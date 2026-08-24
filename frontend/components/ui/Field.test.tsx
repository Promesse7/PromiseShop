import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "./Field";

describe("Field", () => {
  it("renders a label associated with its input via htmlFor/id", () => {
    render(<Field label="Username" name="username" value="" onChange={() => {}} />);
    const input = screen.getByLabelText("Username");
    expect(input).toBeInTheDocument();
  });

  it("supports the type prop for password fields", () => {
    render(<Field label="Password" name="password" type="password" value="" onChange={() => {}} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("calls onChange when typed into", async () => {
    const handleChange = vi.fn();
    render(<Field label="Username" name="username" value="" onChange={handleChange} />);
    await userEvent.type(screen.getByLabelText("Username"), "e");
    expect(handleChange).toHaveBeenCalledWith("e");
  });
});
