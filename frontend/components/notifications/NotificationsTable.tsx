"use client";

import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import { Button } from "@/components/ui/Button";
import type { NotificationRow } from "@/lib/notifications/useNotifications";

const STATUS_TAG: Record<NotificationRow["status"], { label: string; variant: "accent" | "neutral" }> = {
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

interface NotificationsTableProps {
  notifications: NotificationRow[];
}

export function NotificationsTable({ notifications }: NotificationsTableProps) {
  const columns = [
    {
      key: "sent_at",
      header: "Sent",
      render: (n: NotificationRow) => <span className="text-text/50">{formatSentAt(n.sent_at)}</span>,
    },
    {
      key: "trigger",
      header: "Trigger",
      render: (n: NotificationRow) => <span className="font-mono text-xs">{n.trigger}</span>,
    },
    { key: "subject", header: "Subject" },
    {
      key: "status",
      header: "Status",
      render: (n: NotificationRow) => {
        const tag = STATUS_TAG[n.status];
        return <Tag variant={tag.variant}>{tag.label}</Tag>;
      },
    },
    {
      key: "actions",
      header: "",
      render: (n: NotificationRow) =>
        n.status === "failed" ? (
          <Button variant="ghost" className="text-xs" disabled title="Retry sending is not available yet">
            Retry
          </Button>
        ) : null,
    },
  ];

  return (
    <Table
      columns={columns}
      rows={notifications}
      rowKey={(n) => String(n.notification_id)}
      emptyMessage="No notifications yet"
    />
  );
}
