"use client";

import { useId } from "react";
import { Search } from "lucide-react";

interface SearchInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** The list-screen search box used in a Toolbar's `search` slot (Purchases, Suppliers). */
export function SearchInput({ label, value, onChange, placeholder = "Search…" }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text/40" aria-hidden />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-9 rounded-md border border-divider bg-surface py-1.5 pl-8 pr-2.5 text-sm text-text"
      />
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Label of the "no filter" option. */
  anyLabel?: string;
}

/** A labelled dropdown filter; "" means no filter. */
export function FilterSelect({ label, value, options, onChange, anyLabel = "All" }: FilterSelectProps) {
  const id = useId();
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <label htmlFor={id} className="text-text/60">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-9 flex-1 rounded-md border border-divider bg-surface px-2 py-1.5 text-sm text-text"
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
