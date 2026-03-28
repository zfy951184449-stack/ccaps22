import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function PageHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  eyebrow?: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--pl-radius-lg)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.86)] px-7 py-6 shadow-[var(--pl-shadow-soft)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-4xl space-y-2">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="text-[28px] font-semibold tracking-[-0.05em] text-[var(--pl-text-primary)]">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-[var(--pl-text-secondary)]">
            {subtitle}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
