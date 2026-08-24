import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-accent border-accent hover:bg-accent/10 active:bg-accent/20",
  secondary:
    "border-divider hover:bg-text/[0.07] active:bg-text/[0.14]",
  ghost: "text-accent border-transparent px-1 hover:bg-accent/10 active:bg-accent/20",
};

export function Button({
  variant = "primary",
  block = false,
  className = "",
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "inline-flex items-center justify-center gap-1.5 cursor-pointer no-underline",
        "font-sans font-medium text-sm leading-tight text-text",
        "bg-transparent border rounded-md py-1.5 px-2.5",
        "disabled:opacity-45 disabled:cursor-not-allowed",
        block ? "w-full mt-1.5" : "",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
