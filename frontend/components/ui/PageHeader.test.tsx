import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("renders the title as a heading", () => {
    render(<PageHeader title="Products" />);
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
  });

  it("renders an optional subtitle next to the title", () => {
    render(<PageHeader title="Dashboard" subtitle="Monthly summary" />);
    expect(screen.getByText("Monthly summary")).toBeInTheDocument();
  });

  it("does not render a subtitle when omitted", () => {
    render(<PageHeader title="Products" />);
    expect(screen.queryByText("Monthly summary")).not.toBeInTheDocument();
  });

  it("renders children after the title, e.g. toolbar controls", () => {
    render(
      <PageHeader title="Products">
        <button type="button">+ New product</button>
      </PageHeader>
    );
    expect(screen.getByRole("button", { name: "+ New product" })).toBeInTheDocument();
  });
});
