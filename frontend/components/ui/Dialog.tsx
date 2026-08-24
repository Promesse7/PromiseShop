"use client";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  if (!open) return null;

  return (
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 bg-bg/70 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-lg shadow-lg p-4 min-w-[320px] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="m-0 mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}
