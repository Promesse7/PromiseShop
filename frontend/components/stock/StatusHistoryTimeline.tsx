import type { EquipmentStatusHistoryEntry } from "@/lib/types";

function formatStatus(status: string): string {
  return status ? status.replace(/_/g, " ") : "—";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface StatusHistoryTimelineProps {
  entries: EquipmentStatusHistoryEntry[];
}

export function StatusHistoryTimeline({ entries }: StatusHistoryTimelineProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-text/50">No history yet</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => (
        <div key={entry.history_id} data-testid="history-entry" className="border-l-2 border-divider pl-3">
          <div className="text-sm">
            {formatStatus(entry.previous_status ?? "")} → <strong>{formatStatus(entry.new_status)}</strong>
          </div>
          <div className="text-xs text-text/50">
            {formatDate(entry.change_date)} · Employee #{entry.changed_by}
          </div>
          {entry.notes && <div className="text-sm opacity-80">{entry.notes}</div>}
        </div>
      ))}
    </div>
  );
}
