import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="glass glass-hover flex items-center gap-3 mb-4 px-4 py-3 rounded-lg flex-wrap">
      <h3 className="m-0">{title}</h3>
      {subtitle && <span className="text-sm text-text/50">{subtitle}</span>}
      {children}
    </div>
  );
}
