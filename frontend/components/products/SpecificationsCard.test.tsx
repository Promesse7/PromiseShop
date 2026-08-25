import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecificationsCard } from "./SpecificationsCard";

describe("SpecificationsCard", () => {
  it("renders the specifications text", () => {
    render(<SpecificationsCard specifications="30 W RMS · 12 h battery" />);
    expect(screen.getByText("30 W RMS · 12 h battery")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no specifications", () => {
    render(<SpecificationsCard specifications={null} />);
    expect(screen.getByText("No specifications recorded.")).toBeInTheDocument();
  });
});
