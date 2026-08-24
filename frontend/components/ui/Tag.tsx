import type { HTMLAttributes } from "react";

type TagVariant = "outline" | "accent" | "neutral";

interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: TagVariant;
}

const variantClasses: Record<TagVariant, string> = {
  outline: "border border-accent text-accent",
  accent: "bg-accent-800 text-accent-100",
  neutral: "bg-neutral-800 text-neutral-100",
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
