interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <h3 className="m-0">{title}</h3>
      {subtitle && <span className="text-sm text-text/50">{subtitle}</span>}
      {children}
    </div>
  );
}
