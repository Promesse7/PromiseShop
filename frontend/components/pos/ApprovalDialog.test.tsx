import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApprovalDialog } from "./ApprovalDialog";

describe("ApprovalDialog", () => {
  it("sends the approver's username and PIN", async () => {
    const onApprove = vi.fn();
    render(<ApprovalDialog open reason="Line 1 (Speaker): needs manager approval." onApprove={onApprove} onClose={vi.fn()} />);
    expect(screen.getByText(/needs manager approval/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Manager username"), "manager1");
    await userEvent.type(screen.getByLabelText("PIN"), "4321");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledWith({ approver_username: "manager1", pin: "4321" });
  });

  it("shows a refusal message", () => {
    render(<ApprovalDialog open reason="x" error="Approval refused: wrong approver or PIN." onApprove={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("Approval refused: wrong approver or PIN.")).toBeInTheDocument();
  });
});
