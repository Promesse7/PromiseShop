import type { HTMLAttributes } from "react";

export function Skeleton({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={["motion-safe:animate-pulse rounded-md bg-neutral-200", className].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
