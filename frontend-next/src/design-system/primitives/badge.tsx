import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

const toneClassName: Record<BadgeTone, string> = {
  neutral:
    "border-[var(--pl-border)] bg-[var(--pl-surface)] text-[var(--pl-text-secondary)]",
  accent:
    "border-[rgba(11,106,162,0.18)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]",
  success:
    "border-[rgba(24,121,78,0.18)] bg-[var(--pl-success-soft)] text-[var(--pl-success)]",
  warning:
    "border-[rgba(154,103,0,0.18)] bg-[var(--pl-warning-soft)] text-[var(--pl-warning)]",
  danger:
    "border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] text-[var(--pl-danger)]",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em]",
        toneClassName[tone],
        className,
      )}
      data-tone={tone}
      {...props}
    />
  );
}
