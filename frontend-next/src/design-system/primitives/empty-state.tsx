import type { ReactNode } from "react";

export function EmptyState({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-6 py-10">
      <div className="max-w-2xl space-y-2">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-text-tertiary)]">
            {eyebrow}
          </div>
        ) : null}
        <h3 className="text-xl font-semibold tracking-[-0.03em]">{title}</h3>
        <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
          {description}
        </p>
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </div>
  );
}
