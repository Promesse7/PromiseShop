import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminOnlyNotice } from "./AdminOnlyNotice";

describe("AdminOnlyNotice", () => {
  it("renders an admin-only message", () => {
    render(<AdminOnlyNotice />);
    expect(screen.getByText("Dashboard data is limited to Admin accounts.")).toBeInTheDocument();
  });
});
