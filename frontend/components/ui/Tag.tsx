import type { HTMLAttributes } from "react";

type TagVariant = "outline" | "accent" | "neutral" | "warning" | "danger";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
}

const variantClasses: Record<TagVariant, string> = {
  outline: "border border-accent text-accent",
  accent: "bg-accent-800 text-accent-100",
  neutral: "bg-neutral-800 text-neutral-100",
  warning: "bg-amber-50 text-amber-700 border border-amber-300 shadow-[0_0_12px_-3px_rgba(217,119,6,0.5)]",
  danger: "bg-red-50 text-red-700 border border-red-300 shadow-[0_0_12px_-3px_rgba(220,38,38,0.5)]",
};

export function Tag({ variant = "outline", className = "", children, ...props }: TagProps) {
  return (
    <span
      className={[
        "inline-flex items-center text-xs tracking-wide py-0.5 px-2.5 rounded-sm",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
