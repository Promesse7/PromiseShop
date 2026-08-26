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
};

interface SerializedUnitsTableProps {
  units: EquipmentUnit[];
  selectedIds?: Set<number>;
  onToggleSelect?: (unitId: number) => void;
  onPrintLabel?: (unit: EquipmentUnit) => void;
}

export function SerializedUnitsTable({ units, selectedIds, onToggleSelect, onPrintLabel }: SerializedUnitsTableProps) {
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
      key: "storage_location",
      header: "Location",
      render: (unit: EquipmentUnit) => unit.storage_location ?? "—",
    },
    {
      key: "condition_notes",
      header: "Condition notes",
      render: (unit: EquipmentUnit) => <span className="text-text/50">{unit.condition_notes ?? "—"}</span>,
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
