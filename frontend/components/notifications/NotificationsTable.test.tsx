import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { setMatchMedia } from "@/lib/test/matchMedia";
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

  it("labels in-app notifications as In app, not Delivered", () => {
    render(<NotificationsTable notifications={[{ ...delivered, status: "logged" }]} />);
    expect(screen.getByText("In app")).toBeInTheDocument();
    expect(screen.queryByText("Delivered")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
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

  it("is a table on desktop", () => {
    render(<NotificationsTable notifications={[delivered, failed]} />);
    expect(screen.getByRole("table", { name: "Notifications" })).toBeInTheDocument();
  });

  it("is a list of cards on phone, titled by subject", () => {
    setMatchMedia({ desktop: false });
    render(<NotificationsTable notifications={[delivered, failed]} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Notifications" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByText("New sale — Sale #S-841")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});
