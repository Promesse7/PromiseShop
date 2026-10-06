"use client";

import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { presetRange, type DateRange, type PeriodPreset } from "@/lib/dashboard/money";

const OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom" },
];

interface PeriodPickerProps {
  preset: PeriodPreset;
  range: DateRange;
  onChange: (preset: PeriodPreset, range: DateRange) => void;
}

const DATE = "min-h-8 py-1 px-2 text-xs text-text bg-surface border border-divider rounded-md";

export function PeriodPicker({ preset, range, onChange }: PeriodPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Period">
      <SegmentedToggle
        name="period"
        options={OPTIONS}
        value={preset}
        onChange={(value) => {
          const next = value as PeriodPreset;
          onChange(next, next === "custom" ? range : presetRange(next));
        }}
      />
      {preset === "custom" && (
        <>
          <input
            type="date"
            aria-label="From"
            className={DATE}
            value={range.from}
            max={range.to}
            onChange={(e) => e.target.value && onChange("custom", { ...range, from: e.target.value })}
          />
          <input
            type="date"
            aria-label="To"
            className={DATE}
            value={range.to}
            min={range.from}
            onChange={(e) => e.target.value && onChange("custom", { ...range, to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
