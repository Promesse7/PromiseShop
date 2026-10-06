"use client";

import { Bell } from "lucide-react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import type { NotificationRow } from "@/lib/notifications/useNotifications";

const STATUS_TAG: Record<NotificationRow["status"], { label: string; variant: "accent" | "neutral" }> = {
  logged: { label: "In app", variant: "accent" },
  sent: { label: "Delivered", variant: "accent" },
  failed: { label: "Failed", variant: "neutral" },
};

function formatSentAt(sentAt: string): string {
  return new Date(sentAt).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const COLUMNS: DataColumn<NotificationRow>[] = [
  { key: "subject", header: "Subject", primary: true, sortValue: (n) => n.subject },
  {
    key: "sent_at",
    header: "Sent",
    render: (n) => <span className="text-text/60">{formatSentAt(n.sent_at)}</span>,
    sortValue: (n) => n.sent_at,
  },
  {
    key: "trigger",
    header: "Trigger",
    render: (n) => <span className="font-mono text-xs">{n.trigger}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (n) => {
      const tag = STATUS_TAG[n.status];
      return <Tag variant={tag.variant}>{tag.label}</Tag>;
    },
  },
  {
    key: "actions",
    header: "",
    mobile: false,
    render: (n) =>
      n.status === "failed" ? (
        <Button variant="ghost" className="text-xs" disabled title="Retry sending is not available yet">
          Retry
        </Button>
      ) : null,
  },
];

interface NotificationsTableProps {
  notifications: NotificationRow[];
}

export function NotificationsTable({ notifications }: NotificationsTableProps) {
  return (
    <DataTable
      label="Notifications"
      columns={COLUMNS}
      rows={notifications}
      rowKey={(n) => String(n.notification_id)}
      empty={<EmptyState icon={Bell} title="No notifications yet" message="Sales, voids and returns show up here." />}
    />
  );
}
