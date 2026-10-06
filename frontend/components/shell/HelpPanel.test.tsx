import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as useWorkflowHintsModule from "@/lib/guidance/useWorkflowHints";
import type { WorkflowHint } from "@/lib/guidance/workflowHints";
import { HelpButton, HelpPanel } from "./HelpPanel";
import { SetupChecklist } from "./SetupChecklist";

vi.mock("next/navigation", () => ({ usePathname: () => "/checkout" }));

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

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("HelpButton", () => {
  it("shows a dot and the count when there is something to do", () => {
    mockHints(todoHints);
    render(<HelpButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Help, 2 to-dos" })).toBeInTheDocument();
    expect(screen.getByTestId("help-dot")).toBeInTheDocument();
  });

  it("has no dot when everything is done", () => {
    mockHints([]);
    render(<HelpButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
    expect(screen.queryByTestId("help-dot")).not.toBeInTheDocument();
  });
});

describe("HelpPanel", () => {
  it("lists the setup steps with done markers and links", () => {
    mockHints(setupHints);
    render(<HelpPanel open onClose={vi.fn()} />);
    expect(screen.getByText("Add your first category").closest("li")).toHaveTextContent("✓");
    expect(screen.getByRole("link", { name: "Add your first product" })).toHaveAttribute("href", "/products");
  });

  it("dismisses a to-do, remembers it, and brings it back when its count changes", async () => {
    mockHints(todoHints);
    const { unmount } = render(<HelpPanel open onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: 2 products need a selling price" }));
    expect(screen.queryByRole("link", { name: "2 products need a selling price" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "1 draft purchase waiting to be received" })).toBeInTheDocument();
    unmount();

    render(<HelpPanel open onClose={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "2 products need a selling price" })).not.toBeInTheDocument();
  });

  it("brings a dismissed to-do back when its count changes", async () => {
    mockHints(todoHints);
    const { unmount } = render(<HelpPanel open onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss: 2 products need a selling price" }));
    unmount();

    mockHints([{ ...todoHints[0], label: "3 products need a selling price", signature: "3" }]);
    render(<HelpPanel open onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "3 products need a selling price" })).toBeInTheDocument();
  });

  it("says so when there is nothing waiting, and explains the current page", () => {
    mockHints([]);
    render(<HelpPanel open onClose={vi.fn()} />);
    expect(screen.getByText("Nothing waiting. Everything is up to date.")).toBeInTheDocument();
    expect(screen.getByText("About Checkout")).toBeInTheDocument();
  });
});

describe("SetupChecklist", () => {
  it("shows the setup steps until setup is done", () => {
    mockHints(setupHints);
    render(<SetupChecklist />);
    expect(screen.getByText("Let's get your shop set up")).toBeInTheDocument();
  });

  it("renders nothing once there are no setup steps, or while loading", () => {
    mockHints(todoHints);
    const { container, rerender } = render(<SetupChecklist />);
    expect(container).toBeEmptyDOMElement();
    mockHints(setupHints, true);
    rerender(<SetupChecklist />);
    expect(container).toBeEmptyDOMElement();
  });
});
