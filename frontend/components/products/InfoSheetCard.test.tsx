import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InfoSheetCard } from "./InfoSheetCard";

describe("InfoSheetCard", () => {
  it("renders the usage instructions text", () => {
    render(<InfoSheetCard usageInstructions="Hold power 2s to switch on." onEdit={vi.fn()} />);
    expect(screen.getByText("Hold power 2s to switch on.")).toBeInTheDocument();
  });

  it("shows a placeholder when there are no usage instructions", () => {
    render(<InfoSheetCard usageInstructions={null} onEdit={vi.fn()} />);
    expect(screen.getByText("No usage information yet.")).toBeInTheDocument();
  });

  it("calls window.print when Print info sheet is clicked", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<InfoSheetCard usageInstructions="Hold power 2s." onEdit={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Print info sheet" }));
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("calls onEdit when Edit is clicked", async () => {
    const onEdit = vi.fn();
    render(<InfoSheetCard usageInstructions="Hold power 2s." onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalled();
  });

  it("does not render an Edit button when onEdit is not provided", () => {
    render(<InfoSheetCard usageInstructions="Hold power 2s." />);
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});
