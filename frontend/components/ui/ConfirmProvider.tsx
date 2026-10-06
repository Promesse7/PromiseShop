"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog, type ConfirmOptions } from "./ConfirmDialog";

export type { ConfirmOptions } from "./ConfirmDialog";

/**
 * Resolves `true` when confirmed and `false` when cancelled (Cancel, Escape, backdrop).
 * With `input`, resolves to the typed text instead of `true`.
 */
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean | string>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Mount once near the root; provides useConfirm() — the in-app replacement for window.confirm/prompt. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((result: boolean | string) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    // A second question while one is open cancels the first.
    resolverRef.current?.(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOptions(next);
    });
  }, []);

  const handleResolve = useCallback((result: boolean | string) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(result);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog options={options} onResolve={handleResolve} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
