"use client";

import { useId, useState } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label of the confirming button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** "danger" styles the confirming button red, for destructive actions. */
  tone?: "default" | "danger";
  /** The confirming button stays disabled until exactly this text is typed (irreversible actions). */
  requireText?: string;
  /** Ask for a value (replaces window.prompt); the confirm then resolves to the typed text. */
  input?: { label: string; required?: boolean; placeholder?: string };
}

interface ConfirmDialogProps {
  options: ConfirmOptions | null;
  onResolve: (result: boolean | string) => void;
}

/** The dialog behind useConfirm(); rendered once by ConfirmProvider. */
export function ConfirmDialog({ options, onResolve }: ConfirmDialogProps) {
  return (
    <Dialog open={options !== null} onClose={() => onResolve(false)} title={options?.title ?? ""} size="sm">
      {/* Keyed by title so each question starts with empty fields. */}
      {options && <ConfirmBody key={options.title} options={options} onResolve={onResolve} />}
    </Dialog>
  );
}

function ConfirmBody({ options, onResolve }: { options: ConfirmOptions; onResolve: (result: boolean | string) => void }) {
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState("");
  const inputId = useId();
  const requireId = useId();

  const blockedByRequireText = options.requireText !== undefined && typed !== options.requireText;
  const blockedByInput = options.input?.required === true && answer.trim() === "";
  const disabled = blockedByRequireText || blockedByInput;

  function confirm() {
    if (disabled) return;
    onResolve(options.input ? answer.trim() : true);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        confirm();
      }}
      className="flex flex-col gap-3"
    >
      {options.message && <p className="m-0 text-sm text-text/70">{options.message}</p>}
      {options.input && (
        <label htmlFor={inputId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{options.input.label}</span>
          <input
            id={inputId}
            value={answer}
            placeholder={options.input.placeholder}
            onChange={(event) => setAnswer(event.target.value)}
            className="min-h-9 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      )}
      {options.requireText !== undefined && (
        <label htmlFor={requireId} className="flex flex-col gap-1 text-sm">
          <span>
            Type <strong>{options.requireText}</strong> to confirm
          </span>
          <input
            id={requireId}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
            className="min-h-9 rounded-md border border-divider bg-surface px-2.5 py-1.5 text-sm"
          />
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={() => onResolve(false)}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={disabled}
          className={options.tone === "danger" ? "!border-red-600 !text-red-700 hover:!bg-red-50" : ""}
        >
          {options.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </form>
  );
}
