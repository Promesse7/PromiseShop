import { useQuery } from "@tanstack/react-query";
import { fetchAllPages } from "@/lib/api-client";
import type { NotificationLogEntry } from "@/lib/types";

export interface NotificationRow extends NotificationLogEntry {
  trigger: string;
  subject: string;
}

export interface UseNotificationsResult {
  all: NotificationRow[];
  isLoading: boolean;
  isError: boolean;
}

function humanize(type: string): string {
  return type
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function deriveTrigger(notification: NotificationLogEntry): string {
  return notification.related_sale != null
    ? `sale #S-${notification.related_sale}`
    : humanize(notification.type).toLowerCase();
}

function deriveSubject(notification: NotificationLogEntry): string {
  return notification.related_sale != null
    ? `New sale — Sale #S-${notification.related_sale}`
    : `${humanize(notification.type)} alert`;
}

export function useNotifications(): UseNotificationsResult {
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchAllPages<NotificationLogEntry>("notifications/"),
  });

  const all: NotificationRow[] = (query.data ?? []).map((notification) => ({
    ...notification,
    trigger: deriveTrigger(notification),
    subject: deriveSubject(notification),
  }));

  return { all, isLoading: query.isLoading, isError: query.isError };
}
