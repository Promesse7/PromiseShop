import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";
import { setMatchMedia } from "@/lib/test/matchMedia";

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

  it("does not close when clicking inside the panel", async () => {
    const handleClose = vi.fn();
    render(
      <Dialog open onClose={handleClose} title="Confirm">
        <p>inside</p>
      </Dialog>
    );
    await userEvent.click(screen.getByText("inside"));
    expect(handleClose).not.toHaveBeenCalled();
  });

  it("is an accessible modal labelled by its title, with an optional description", () => {
    render(
      <Dialog open onClose={() => {}} title="Edit product" description="Changes apply immediately">
        body
      </Dialog>
    );
    const dialog = screen.getByRole("dialog", { name: "Edit product" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Changes apply immediately");
  });

  it("closes on Escape", async () => {
    const handleClose = vi.fn();
    render(
      <Dialog open onClose={handleClose} title="Confirm">
        content
      </Dialog>
    );
    await userEvent.keyboard("{Escape}");
    expect(handleClose).toHaveBeenCalledOnce();
  });

  it("moves focus into the dialog and back to the trigger on close", async () => {
    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button>trigger</button>
          <Dialog open={open} onClose={() => {}} title="Focus">
            <input aria-label="first field" />
          </Dialog>
        </>
      );
    }
    const { rerender } = render(<Harness open={false} />);
    screen.getByRole("button", { name: "trigger" }).focus();
    rerender(<Harness open />);
    await waitFor(() => expect(screen.getByLabelText("first field")).toHaveFocus());
    rerender(<Harness open={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "trigger" })).toHaveFocus());
  });

  it("renders a sticky footer outside the scrolling body", () => {
    render(
      <Dialog open onClose={() => {}} title="Form" footer={<button>Save</button>}>
        <p>long form</p>
      </Dialog>
    );
    const footer = screen.getByTestId("dialog-footer");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("dialog-body")).not.toContainElement(screen.getByRole("button", { name: "Save" }));
  });

  it("scrolls a long body in its own area that fades where fields are hidden, never when printing", () => {
    render(
      <Dialog open onClose={() => {}} title="Form" footer={<button>Save</button>}>
        <p>long form</p>
      </Dialog>
    );
    const area = screen.getByTestId("dialog-body").closest("[data-at-start]");
    expect(area).not.toBeNull();
    expect(area).toContainElement(screen.getByText("long form"));
    expect(area).not.toContainElement(screen.getByRole("button", { name: "Save" }));
    // The fade is a mask; printed labels and receipts inside a dialog must not be faded.
    expect(area?.className).toContain("print:![mask-image:none]");
  });

  it("locks page scroll while open", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Lock">
        x
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("hidden");
    rerender(
      <Dialog open={false} onClose={() => {}} title="Lock">
        x
      </Dialog>
    );
    expect(document.body.style.overflow).toBe("");
  });

  it("is a centred dialog on desktop and a bottom sheet on phone", () => {
    const { unmount } = render(
      <Dialog open onClose={() => {}} title="Desk">
        x
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "dialog");
    unmount();

    act(() => setMatchMedia({ desktop: false }));
    render(
      <Dialog open onClose={() => {}} title="Phone">
        x
      </Dialog>
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("data-variant", "sheet");
    expect(screen.getByTestId("sheet-handle")).toBeInTheDocument();
  });

  it("still opens and closes with animations on (reduced motion off)", async () => {
    act(() => setMatchMedia({ reducedMotion: false }));
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Animated">
        x
      </Dialog>
    );
    expect(screen.getByRole("dialog", { name: "Animated" })).toBeInTheDocument();
    rerender(
      <Dialog open={false} onClose={() => {}} title="Animated">
        x
      </Dialog>
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 2000 });
  });
});
