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
      className="fixed inset-0 bg-neutral-900/50 backdrop-blur-sm flex items-center justify-center z-50 print:static print:inset-auto print:block print:bg-transparent print:backdrop-blur-none"
      onClick={onClose}
    >
      {/*
        A dialog is normally position:fixed, which becomes the containing block for any
        .print-target it contains (e.g. RegisterUnitDialog's post-save label print) —
        pinning that content to the fixed overlay's box instead of the printed page. The
        print: overrides above drop the fixed positioning/backdrop chrome so printed
        content flows onto the page normally; any dialog with no .print-target inside it
        is already fully hidden by the .print-target isolation rule, so this has no
        visible effect there.
      */}
      <div
        className="bg-surface rounded-lg shadow-lg p-4 min-w-[320px] max-w-[90vw] max-h-[90vh] overflow-y-auto print:shadow-none print:max-w-none print:max-h-none print:overflow-visible print:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 className="m-0 mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}
