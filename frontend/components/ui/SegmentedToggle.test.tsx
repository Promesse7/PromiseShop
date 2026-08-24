import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedToggle } from "./SegmentedToggle";

describe("SegmentedToggle", () => {
  const options = [
    { value: "en", label: "EN" },
    { value: "rw", label: "RW" },
  ];

  it("renders all options", () => {
    render(<SegmentedToggle name="lang" options={options} value="en" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "RW" })).toBeInTheDocument();
  });

  it("marks the current value as checked", () => {
    render(<SegmentedToggle name="lang" options={options} value="rw" onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "RW" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "EN" })).not.toBeChecked();
  });

  it("calls onChange with the selected value", async () => {
    const handleChange = vi.fn();
    render(<SegmentedToggle name="lang" options={options} value="en" onChange={handleChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "RW" }));
    expect(handleChange).toHaveBeenCalledWith("rw");
  });
});
