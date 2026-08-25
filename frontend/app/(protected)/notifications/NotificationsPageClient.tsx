"use client";

import { useMemo, useState } from "react";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { NotificationsTable } from "@/components/notifications/NotificationsTable";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Tag } from "@/components/ui/Tag";
import type { EmployeeRole } from "@/lib/types";

interface NotificationsPageClientProps {
  role: EmployeeRole;
}

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
];

export default function NotificationsPageClient({ role }: NotificationsPageClientProps) {
  const notifications = useNotifications();
  const [filter, setFilter] = useState("all");

  const filtered = useMemo(() => {
    if (filter === "failed") {
      return notifications.all.filter((n) => n.status === "failed");
    }
    return notifications.all;
  }, [notifications.all, filter]);

  if (role !== "admin") {
    return (
      <div>
        <h4 className="m-0 mb-2">Notification log</h4>
        <p className="text-sm text-text/50">
          The notification log is only available to Admin accounts.
        </p>
      </div>
    );
  }

  if (notifications.isError) {
    return (
      <div className="text-sm text-red-400">
        Couldn&apos;t load notifications.{" "}
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  if (notifications.isLoading) {
    return <p className="text-sm text-text/50">Loading notifications…</p>;
  }

  return (
    <div>
      <div className="flex gap-3 items-center mb-4 flex-wrap">
        <h4 className="m-0">Notification log</h4>
        <Tag>Admin only</Tag>
        <div className="ml-auto">
          <SegmentedToggle name="notification-filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
      </div>
      <NotificationsTable notifications={filtered} />
    </div>
  );
}
