import { cn } from "@/lib/cn";

export type StatusBadgeTone =
  | "neutral"
  | "info"
  | "accent"
  | "warning"
  | "danger";

const toneClassName: Record<StatusBadgeTone, string> = {
  neutral:
    "border-[var(--pl-border)] bg-[var(--pl-surface)] text-[var(--pl-text-secondary)]",
  info: "border-[rgba(11,106,162,0.18)] bg-[rgba(223,239,250,0.9)] text-[var(--pl-accent-strong)]",
  accent:
    "border-[rgba(11,106,162,0.22)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]",
  warning:
    "border-[rgba(154,103,0,0.18)] bg-[var(--pl-warning-soft)] text-[var(--pl-warning)]",
  danger:
    "border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] text-[var(--pl-danger)]",
};

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: StatusBadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
        toneClassName[tone],
      )}
      data-tone={tone}
    >
      {label}
    </span>
  );
}
