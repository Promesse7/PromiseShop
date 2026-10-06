import Link from "next/link";
import { ASSET_STATUS_LABELS } from "@/lib/operations/labels";
import type { ShopAssetEvent } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function AssetTimeline({ events }: { events: ShopAssetEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-text/50">No history yet</p>;
  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.event_id} className="border-l-2 border-divider pl-3">
          <div className="text-sm">
            {e.from_status && e.from_status !== e.to_status
              ? `${ASSET_STATUS_LABELS[e.from_status]} → ${ASSET_STATUS_LABELS[e.to_status]}`
              : e.from_status
                ? ASSET_STATUS_LABELS[e.to_status]
                : `Started: ${ASSET_STATUS_LABELS[e.to_status]}`}
          </div>
          <div className="text-xs text-text/60">
            {formatDate(e.created_at)} · {e.user_name ?? `Employee #${e.user}`}
            {e.approved_by_name && ` · approved by ${e.approved_by_name}`}
          </div>
          <div className="text-sm text-text/80">{e.reason}</div>
          {e.replaced_by && (
            <div className="text-sm">
              Replaced by{" "}
              <Link href={`/shop-use/assets/${e.replaced_by}`} className="text-accent">
                {e.replaced_by_name ?? `asset #${e.replaced_by}`}
              </Link>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
