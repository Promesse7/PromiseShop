import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Tabs } from "./Tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "history", label: "History", count: 3 },
  { id: "movements", label: "Movements" },
];

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState("overview");
  return (
    <Tabs
      tabs={TABS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
      label="Product sections"
    >
      {(active) => <p>Panel: {active}</p>}
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders a labelled tablist with the active tab selected and its panel", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Product sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel: overview");
  });

  it("shows a count badge on a tab", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /History/ })).toHaveTextContent("3");
  });

  it("switches tab on click", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Movements" }));
    expect(onChange).toHaveBeenCalledWith("movements");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel: movements");
  });

  it("moves between tabs with the arrow keys, wrapping at the ends", async () => {
    render(<Harness />);
    screen.getByRole("tab", { name: "Overview" }).focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Movements" })).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  });

  it("only the active tab is in the tab order", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /History/ })).toHaveAttribute("tabindex", "-1");
  });
});
