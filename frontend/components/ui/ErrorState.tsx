import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  message: string;
}

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="flex items-center gap-2.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3.5 py-3">
      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
      <span>{message}</span>
      <button type="button" className="ml-auto text-sm underline shrink-0" onClick={() => window.location.reload()}>
        Try again
      </button>
    </div>
  );
}
