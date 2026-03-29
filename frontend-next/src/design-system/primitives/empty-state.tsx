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
    <div className="rounded-[var(--pl-radius-sm)] border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-5 py-8">
      <div className="max-w-2xl space-y-1.5">
        {eyebrow ? (
          <div className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
            {eyebrow}
          </div>
        ) : null}
        <h3 className="text-lg font-semibold leading-6 tracking-[-0.02em]">{title}</h3>
        <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
          {description}
        </p>
        {action ? <div className="pt-2.5">{action}</div> : null}
      </div>
    </div>
  );
}
