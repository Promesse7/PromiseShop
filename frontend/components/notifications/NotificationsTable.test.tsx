import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationsTable } from "./NotificationsTable";
import type { NotificationRow } from "@/lib/notifications/useNotifications";

const delivered: NotificationRow = {
  notification_id: 1, type: "sale_alert", recipient: 1, related_sale: 841,
  sent_at: "2026-08-23T14:14:00Z", status: "sent", read_at: null,
  trigger: "sale #S-841", subject: "New sale — Sale #S-841",
};

const failed: NotificationRow = {
  notification_id: 2, type: "sale_alert", recipient: 1, related_sale: 839,
  sent_at: "2026-08-23T12:15:00Z", status: "failed", read_at: null,
  trigger: "sale #S-839", subject: "New sale — Sale #S-839",
};

describe("NotificationsTable", () => {
  it("renders each notification's subject, trigger, and delivered status", () => {
    render(<NotificationsTable notifications={[delivered]} />);
    expect(screen.getByText("New sale — Sale #S-841")).toBeInTheDocument();
    expect(screen.getByText("sale #S-841")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
  });

  it("shows a disabled Retry button for failed notifications", () => {
    render(<NotificationsTable notifications={[failed]} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });

  it("does not show a Retry button for delivered notifications", () => {
    render(<NotificationsTable notifications={[delivered]} />);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no notifications", () => {
    render(<NotificationsTable notifications={[]} />);
    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });
});
