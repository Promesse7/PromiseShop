import { Tag } from "@/components/ui/Tag";
import type { SaleStatus } from "@/lib/types";

const STATUS: Record<SaleStatus, { label: string; variant: "accent" | "neutral" | "warning" | "danger" }> = {
  completed: { label: "Completed", variant: "accent" },
  partially_returned: { label: "Partly returned", variant: "warning" },
  returned: { label: "Returned", variant: "neutral" },
  voided: { label: "Voided", variant: "danger" },
};

export function SaleStatusTag({ status }: { status: SaleStatus }) {
  const { label, variant } = STATUS[status] ?? { label: status, variant: "neutral" as const };
  return <Tag variant={variant}>{label}</Tag>;
}
