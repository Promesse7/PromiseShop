interface ToastProps {
  message: string;
  variant?: "success" | "error";
}

export function Toast({ message, variant = "success" }: ToastProps) {
  return (
    <div
      role="status"
      className={[
        "fixed bottom-4 right-4 py-2 px-3.5 rounded-md bg-surface/85 backdrop-blur-md shadow-md border text-sm",
        variant === "success" ? "border-accent text-accent" : "border-red-500 text-red-400",
      ].join(" ")}
    >
      {message}
    </div>
  );
}
