import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: "sm" | "md" | "lg";
}

const elevationClasses = {
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
};

export function Card({ elevation, className = "", children, ...props }: CardProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1.5 p-3 rounded-md bg-surface",
        elevation ? elevationClasses[elevation] : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardKicker({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] tracking-wide uppercase text-accent">{children}</span>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="font-sans font-medium text-lg leading-tight">{children}</h3>;
}

export function CardBody({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-sm opacity-80 flex-1">{children}</p>;
}

export function CardMeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-text/50">{children}</div>
  );
}
