import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--pl-accent)] text-white shadow-[var(--pl-shadow-soft)] hover:bg-[var(--pl-accent-strong)]",
  secondary:
    "border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] text-[var(--pl-text-primary)] hover:border-[var(--pl-accent)] hover:text-[var(--pl-accent)]",
  ghost:
    "bg-transparent text-[var(--pl-text-secondary)] hover:bg-[rgba(11,106,162,0.08)] hover:text-[var(--pl-accent)]",
  danger:
    "bg-[var(--pl-danger)] text-white shadow-[var(--pl-shadow-soft)] hover:bg-[#971f15]",
};

const sizeClassName: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        variantClassName[variant],
        sizeClassName[size],
        className,
      )}
      data-size={size}
      data-variant={variant}
      type={type}
      {...props}
    />
  );
}
