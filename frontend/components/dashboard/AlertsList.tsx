import Link from "next/link";
import { AlertTriangle, CircleAlert } from "lucide-react";
import type { MoneyAlert } from "@/lib/dashboard/money";

interface AlertsListProps {
  alerts: MoneyAlert[];
}

export function AlertsList({ alerts }: AlertsListProps) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-text/60 mb-4" role="status">
        No alerts — nothing unusual in discounts, debts, cash, costs, equipment, suppliers or stock.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 mb-4" aria-label="Alerts">
      {alerts.map((alert, i) => {
        const danger = alert.severity === "danger";
        const Icon = danger ? CircleAlert : AlertTriangle;
        return (
          <li
            key={`${alert.code}-${i}`}
            className={[
              "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              danger ? "border-rose-500/40 bg-rose-500/10" : "border-amber-500/40 bg-amber-500/10",
            ].join(" ")}
          >
            <Icon className={danger ? "text-rose-500 shrink-0 mt-0.5" : "text-amber-500 shrink-0 mt-0.5"} size={16} aria-hidden />
            <span className="flex-1 text-text">{alert.message}</span>
            <Link href={alert.link} className="text-accent text-xs whitespace-nowrap">
              See →
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
