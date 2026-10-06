"use client";

import { useMemo, useState } from "react";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { NotificationsTable } from "@/components/notifications/NotificationsTable";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Page, Toolbar } from "@/components/ui/Page";
import { ErrorState } from "@/components/ui/ErrorState";
import { LoadingState } from "@/components/ui/LoadingState";
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
      <Page title="Notification log">
        <p className="text-sm text-text/50">The notification log is only available to Admin accounts.</p>
      </Page>
    );
  }

  return (
    <Page
      title="Notification log"
      description="What the app has told admins about: sales, voids and returns."
      toolbar={
        <Toolbar
          activeFilterCount={filter === "all" ? 0 : 1}
          filters={
            <SegmentedToggle name="notification-filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
          }
        />
      }
    >
      {notifications.isError ? (
        <ErrorState message="Couldn't load notifications." onRetry={notifications.refetch} />
      ) : notifications.isLoading ? (
        <LoadingState variant="table" label="Loading notifications…" />
      ) : (
        <NotificationsTable notifications={filtered} />
      )}
    </Page>
  );
}
