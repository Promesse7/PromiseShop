"use client";

import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Tag } from "@/components/ui/Tag";
import type { EquipmentUnit, EquipmentUnitStatus } from "@/lib/types";

const STATUS_TAG: Record<EquipmentUnitStatus, { label: string; variant: "accent" | "outline" | "neutral" }> = {
  in_stock: { label: "in stock", variant: "accent" },
  in_use: { label: "in use", variant: "outline" },
  under_repair: { label: "under repair", variant: "outline" },
  damaged: { label: "damaged", variant: "neutral" },
  sold: { label: "sold", variant: "neutral" },
  shop_asset: { label: "shop asset", variant: "outline" },
};

interface SerializedUnitsTableProps {
  units: EquipmentUnit[];
  selectedIds?: Set<number>;
  onToggleSelect?: (unitId: number) => void;
  onPrintLabel?: (unit: EquipmentUnit) => void;
  // Resolves assigned_to ids to names; without it the id is shown.
  employeeNames?: Map<number, string>;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function SerializedUnitsTable({ units, selectedIds, onToggleSelect, onPrintLabel, employeeNames }: SerializedUnitsTableProps) {
  const columns = [
    ...(onToggleSelect
      ? [
          {
            key: "select",
            header: "",
            render: (unit: EquipmentUnit) => (
              <input
                type="checkbox"
                aria-label={`Select ${unit.serial_number}`}
                checked={selectedIds?.has(unit.unit_id) ?? false}
                onChange={() => onToggleSelect(unit.unit_id)}
              />
            ),
          },
        ]
      : []),
    {
      key: "serial_number",
      header: "Serial",
      render: (unit: EquipmentUnit) => <span className="font-mono text-xs">{unit.serial_number}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (unit: EquipmentUnit) => {
        const tag = unit.status ? STATUS_TAG[unit.status] : undefined;
        return tag ? <Tag variant={tag.variant}>{tag.label}</Tag> : "—";
      },
    },
    {
      key: "assigned_to",
      header: "Assigned to",
      render: (unit: EquipmentUnit) =>
        unit.assigned_to == null ? "—" : employeeNames?.get(unit.assigned_to) ?? `Employee #${unit.assigned_to}`,
    },
    {
      key: "storage_location",
      header: "Location",
      render: (unit: EquipmentUnit) => unit.storage_location ?? "—",
    },
    {
      key: "condition_notes",
      header: "Condition notes",
      render: (unit: EquipmentUnit) => <span className="text-text/50">{unit.condition_notes ?? "—"}</span>,
    },
    {
      key: "status_changed_at",
      header: "Changed",
      render: (unit: EquipmentUnit) => <span className="text-xs">{formatDate(unit.status_changed_at)}</span>,
    },
    ...(onPrintLabel
      ? [
          {
            key: "print",
            header: "",
            render: (unit: EquipmentUnit) => (
              <button
                type="button"
                className="text-xs text-accent underline"
                onClick={() => onPrintLabel(unit)}
              >
                Print label
              </button>
            ),
          },
        ]
      : []),
    {
      key: "history",
      header: "",
      render: (unit: EquipmentUnit) => (
        <Link href={`/stock/units/${unit.unit_id}`} className="text-xs text-accent">
          History
        </Link>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      rows={units}
      rowKey={(unit) => String(unit.unit_id)}
      emptyMessage="No serialized units for this product"
    />
  );
}
