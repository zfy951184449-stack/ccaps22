import type { ReactNode } from "react";

export function ErrorState({
  action,
  description,
  title,
}: {
  action?: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <div className="rounded-[var(--pl-radius-md)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-6 py-10">
      <div className="max-w-2xl space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-danger)]">
          Error state
        </div>
        <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--pl-text-primary)]">
          {title}
        </h3>
        <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
          {description}
        </p>
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </div>
  );
}
