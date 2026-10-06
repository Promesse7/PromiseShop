"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useIsDesktop } from "@/lib/useMediaQuery";
import { backdropVariants, dialogVariants, sheetVariants, useReducedMotionSafe } from "@/lib/motion";

type DialogSize = "sm" | "md" | "lg";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** One line under the title; also the dialog's accessible description. */
  description?: string;
  /** Sticky actions (Save / Cancel) that stay visible while the body scrolls. */
  footer?: ReactNode;
  /** Desktop width. Omitted keeps the original fit-to-content width. */
  size?: DialogSize;
}

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: "w-full max-w-sm",
  md: "w-full max-w-lg",
  lg: "w-full max-w-3xl",
};

const FOCUSABLE =
  'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Close a phone sheet when dragged down this far, or flicked this fast. */
const SHEET_CLOSE_OFFSET = 120;
const SHEET_CLOSE_VELOCITY = 500;

/**
 * Modal dialog. Centred and scaling in on desktop; a bottom sheet that slides up (and can be
 * dragged down to close) on phone. Escape and the backdrop close it, focus moves inside and
 * returns to the trigger, and page scroll is locked while open. With reduced motion it opens
 * and closes instantly.
 */
export function Dialog({ open, onClose, title, children, description, footer, size }: DialogProps) {
  const reduced = useReducedMotionSafe();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Layout effect: runs before the panel's mount effect moves focus inside, so this still
  // sees the element that opened the dialog.
  useLayoutEffect(() => {
    if (open) returnFocusRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function" && document.contains(target)) target.focus();
    };
  }, [open]);

  const panel = open ? (
    <DialogFrame key="dialog" title={title} description={description} footer={footer} size={size} onClose={onClose} reduced={reduced}>
      {children}
    </DialogFrame>
  ) : null;

  // Without animation, closing unmounts at once; otherwise AnimatePresence plays the exit.
  return reduced ? panel : <AnimatePresence>{panel}</AnimatePresence>;
}

interface DialogFrameProps extends Omit<DialogProps, "open"> {
  reduced: boolean;
}

function DialogFrame({ title, description, footer, size, onClose, reduced, children }: DialogFrameProps) {
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const body = panel.querySelector<HTMLElement>("[data-dialog-body]");
    const first = body?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();
  }, []);

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.y > SHEET_CLOSE_OFFSET || info.velocity.y > SHEET_CLOSE_VELOCITY) onClose();
  }

  const variant = isDesktop ? "dialog" : "sheet";
  const animate = reduced ? false : undefined;

  return (
    <motion.div
      data-testid="dialog-backdrop"
      className={[
        "fixed inset-0 z-50 flex bg-neutral-900/50 backdrop-blur-sm",
        isDesktop ? "items-center justify-center p-4" : "items-end justify-center",
        // A dialog is normally position:fixed, which becomes the containing block for any
        // .print-target it contains (e.g. a label printed right after saving) — pinning that
        // content to the overlay instead of the page. These print: overrides drop the overlay
        // chrome so printed content flows onto the page normally.
        "print:static print:inset-auto print:block print:bg-transparent print:backdrop-blur-none print:p-0",
      ].join(" ")}
      variants={backdropVariants}
      initial={animate ?? "hidden"}
      animate="show"
      exit="exit"
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-variant={variant}
        tabIndex={-1}
        className={[
          "relative flex flex-col bg-surface shadow-lg outline-none",
          isDesktop
            ? `rounded-lg max-h-[90vh] ${size ? SIZE_CLASSES[size] : "min-w-[320px] max-w-[90vw]"}`
            : "w-full max-h-[92vh] rounded-t-lg pb-[env(safe-area-inset-bottom)]",
          "print:shadow-none print:max-w-none print:max-h-none print:rounded-none print:block",
        ].join(" ")}
        variants={isDesktop ? dialogVariants : sheetVariants}
        initial={animate ?? "hidden"}
        animate="show"
        exit="exit"
        drag={isDesktop ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        dragListener={false}
        dragControls={dragControls}
        onDragEnd={handleDragEnd}
        onClick={(event) => event.stopPropagation()}
      >
        {!isDesktop && (
          // Dragging starts only on the handle, so the body can scroll and inputs stay usable.
          <div
            data-testid="sheet-handle"
            className="flex cursor-grab touch-none justify-center pt-2 pb-1 print:hidden"
            onPointerDown={(event) => dragControls.start(event)}
          >
            <span aria-hidden className="block h-1 w-10 rounded-full bg-neutral-300" />
          </div>
        )}
        <div className="flex items-start gap-3 px-4 pt-4 pb-2 print:hidden">
          <div className="min-w-0 flex-1">
            <h4 id={titleId} className="m-0">
              {title}
            </h4>
            {description && (
              <p id={descriptionId} className="m-0 mt-1 text-sm text-text/60">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="-mr-1 rounded-md p-1 text-text/50 hover:bg-text/[0.07] hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div
          data-testid="dialog-body"
          data-dialog-body
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 print:overflow-visible print:p-0"
        >
          {children}
        </div>
        {footer && (
          <div
            data-testid="dialog-footer"
            className="flex flex-wrap items-center justify-end gap-2 border-t border-divider bg-surface px-4 py-3 rounded-b-lg print:hidden"
          >
            {footer}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
