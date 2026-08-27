import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardSkeleton } from "./DashboardSkeleton";

describe("DashboardSkeleton", () => {
  it("renders a labeled loading status", () => {
    render(<DashboardSkeleton />);
    expect(screen.getByRole("status", { name: "Loading dashboard…" })).toBeInTheDocument();
  });
});
