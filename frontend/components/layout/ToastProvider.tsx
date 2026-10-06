"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Toast } from "@/components/ui/Toast";
import { DURATION, EASE, useReducedMotionSafe } from "@/lib/motion";

type ToastVariant = "success" | "error";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 4000;
const MAX_TOASTS = 3;

// Phone: bottom-centre, clear of the tab bar (~80px) and the home indicator.
// Desktop: top-right, where it doesn't cover the page's primary action.
const REGION_CLASS =
  "pointer-events-none fixed z-[60] flex flex-col items-center gap-2 print:hidden " +
  "left-1/2 -translate-x-1/2 bottom-[calc(88px+env(safe-area-inset-bottom))] w-[calc(100%-32px)] max-w-sm " +
  "lg:left-auto lg:translate-x-0 lg:bottom-auto lg:top-4 lg:right-4 lg:w-auto lg:items-end";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const reduced = useReducedMotionSafe();

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, variant }].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toasts.length > 0 && (
        <div data-testid="toast-region" aria-live="polite" className={REGION_CLASS}>
          {reduced ? (
            toasts.map((t) => <Toast key={t.id} message={t.message} variant={t.variant} />)
          ) : (
            <AnimatePresence initial={true}>
              {toasts.map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, transition: { duration: DURATION.fast } }}
                  transition={{ duration: DURATION.base, ease: EASE.out }}
                >
                  <Toast message={t.message} variant={t.variant} />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
