"use client";

interface SegmentedToggleOption {
  value: string;
  label: string;
}

interface SegmentedToggleProps {
  name: string;
  options: SegmentedToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedToggle({ name, options, value, onChange }: SegmentedToggleProps) {
  return (
    <div className="inline-flex border border-divider rounded-md overflow-hidden text-xs">
      {options.map((option) => (
        <label
          key={option.value}
          className={[
            "px-2.5 py-1 cursor-pointer",
            value === option.value ? "bg-accent/15 text-accent" : "text-text/70",
          ].join(" ")}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
