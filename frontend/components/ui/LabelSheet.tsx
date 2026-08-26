import type { ReactNode } from "react";

interface LabelSheetProps {
  children: ReactNode;
}

export function LabelSheet({ children }: LabelSheetProps) {
  return (
    <div className="print-target hidden print:grid grid-cols-3 auto-rows-[33.9mm] gap-0 justify-items-center">
      {children}
    </div>
  );
}
