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
        "rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-5 py-4",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-4xl space-y-1.5">
          {eyebrow ? (
            <div className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
              {eyebrow}
            </div>
          ) : null}
          <h2 className="break-words text-[24px] font-semibold leading-tight tracking-[-0.03em] text-[var(--pl-text-primary)]">
            {title}
          </h2>
          <p className="max-w-3xl text-sm leading-5 text-[var(--pl-text-secondary)]">
            {subtitle}
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
