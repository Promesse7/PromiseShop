import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Confirm">
        content
      </Dialog>
    );
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Confirm">
        Are you sure?
      </Dialog>
    );
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const handleClose = vi.fn();
    render(
      <Dialog open onClose={handleClose} title="Confirm">
        content
      </Dialog>
    );
    await userEvent.click(screen.getByTestId("dialog-backdrop"));
    expect(handleClose).toHaveBeenCalledOnce();
  });
});
