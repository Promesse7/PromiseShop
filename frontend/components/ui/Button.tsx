import type { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface SharedProps {
  variant?: ButtonVariant;
  block?: boolean;
}

interface ButtonAsButtonProps extends SharedProps, ButtonHTMLAttributes<HTMLButtonElement> {
  href?: undefined;
}

interface ButtonAsLinkProps extends SharedProps, AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "text-accent border-accent hover:bg-accent/10 active:bg-accent/20",
  secondary:
    "border-divider hover:bg-text/[0.07] active:bg-text/[0.14]",
  ghost: "text-accent border-transparent px-1 hover:bg-accent/10 active:bg-accent/20",
};

function buttonClassName(variant: ButtonVariant, block: boolean, className: string) {
  return [
    "inline-flex items-center justify-center gap-1.5 cursor-pointer no-underline",
    "font-sans font-medium text-sm leading-tight text-text",
    "bg-transparent border rounded-md py-1.5 px-2.5",
    "disabled:opacity-45 disabled:cursor-not-allowed",
    block ? "w-full mt-1.5" : "",
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  variant = "primary",
  block = false,
  className = "",
  href,
  children,
  ...props
}: ButtonProps) {
  const classes = buttonClassName(variant, block, className);

  if (href !== undefined) {
    return (
      <Link href={href} className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </Link>
    );
  }

  const { disabled, ...buttonProps } = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button className={classes} disabled={disabled} {...buttonProps}>
      {children}
    </button>
  );
}
