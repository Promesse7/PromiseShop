"use client";

import { useId } from "react";

interface FieldProps {
  label: string;
  name: string;
  type?: "text" | "password" | "email" | "number" | "date";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}

export function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
}: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="block text-xs text-text/70">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          "w-full min-h-9 py-1.5 px-2.5 text-sm text-text bg-surface",
          "border rounded-md",
          "hover:border-text/45 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20",
          error ? "border-red-500" : "border-divider",
        ].join(" ")}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
