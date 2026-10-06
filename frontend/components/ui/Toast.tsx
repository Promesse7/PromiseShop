interface ToastProps {
  message: string;
  variant?: "success" | "error";
}

/** One toast card. Placement and stacking live in ToastProvider's region. */
export function Toast({ message, variant = "success" }: ToastProps) {
  return (
    <div
      role="status"
      className={[
        "pointer-events-auto py-2 px-3.5 rounded-md bg-surface/90 backdrop-blur-md shadow-md border text-sm",
        variant === "success" ? "border-accent text-accent" : "border-red-500 text-red-400",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
