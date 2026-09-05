import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GuidanceBar } from "./GuidanceBar";
import * as useWorkflowHintsModule from "@/lib/guidance/useWorkflowHints";
import type { WorkflowHint } from "@/lib/guidance/workflowHints";

const setupHints: WorkflowHint[] = [
  { key: "setup-category", kind: "setup", label: "Add your first category", href: "/products", done: true, signature: "setup-category" },
  { key: "setup-product", kind: "setup", label: "Add your first product", href: "/products", done: false, signature: "setup-product" },
];

const todoHints: WorkflowHint[] = [
  { key: "needs-price", kind: "todo", label: "2 products need a selling price", href: "/products", signature: "2" },
  { key: "draft-purchases", kind: "todo", label: "1 draft purchase waiting to be received", href: "/purchases", signature: "1" },
];

function mockHints(hints: WorkflowHint[], isLoading = false) {
  vi.spyOn(useWorkflowHintsModule, "useWorkflowHints").mockReturnValue({ hints, isLoading });
}

describe("GuidanceBar", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing while loading or when there is nothing to do", () => {
    mockHints([], true);
    const { unmount } = render(<GuidanceBar />);
    expect(screen.queryByRole("complementary", { name: "Next steps" })).not.toBeInTheDocument();
    unmount();

    mockHints([]);
    render(<GuidanceBar />);
    expect(screen.queryByRole("complementary", { name: "Next steps" })).not.toBeInTheDocument();
  });

  it("shows the setup steps with done markers and links", () => {
    mockHints(setupHints);
    render(<GuidanceBar />);
    expect(screen.getByRole("complementary", { name: "Next steps" })).toBeInTheDocument();
    expect(screen.getByText("Let's get your shop set up")).toBeInTheDocument();
    expect(screen.getByText("Add your first category").closest("li")).toHaveTextContent("✓");
    expect(screen.getByRole("link", { name: "Add your first product" })).toHaveAttribute("href", "/products");
  });

  it("shows to-dos as links that can be dismissed, and remembers the dismissal", async () => {
    mockHints(todoHints);
    const { unmount } = render(<GuidanceBar />);
    expect(screen.getByRole("link", { name: "2 products need a selling price" })).toHaveAttribute("href", "/products");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss: 2 products need a selling price" }));
    expect(screen.queryByRole("link", { name: "2 products need a selling price" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 draft purchase waiting to be received" })).toBeInTheDocument();
    unmount();

    render(<GuidanceBar />);
    expect(screen.queryByRole("link", { name: "2 products need a selling price" })).not.toBeInTheDocument();
  });

  it("brings a dismissed to-do back when its count changes", async () => {
    mockHints(todoHints);
    const { unmount } = render(<GuidanceBar />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: 2 products need a selling price" }));
    unmount();

    mockHints([{ ...todoHints[0], label: "3 products need a selling price", signature: "3" }]);
    render(<GuidanceBar />);
    expect(screen.getByRole("link", { name: "3 products need a selling price" })).toBeInTheDocument();
  });

  it("hides the whole bar once every to-do is dismissed", async () => {
    mockHints([todoHints[0]]);
    render(<GuidanceBar />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: 2 products need a selling price" }));
    expect(screen.queryByRole("complementary", { name: "Next steps" })).not.toBeInTheDocument();
  });
});
