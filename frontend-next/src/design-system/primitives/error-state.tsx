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
    <div className="rounded-[var(--pl-radius-sm)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-5 py-8">
      <div className="max-w-2xl space-y-1.5">
        <div className="text-[11px] font-semibold leading-4 text-[var(--pl-danger)]">
          Error state
        </div>
        <h3 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-[var(--pl-text-primary)]">
          {title}
        </h3>
        <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
          {description}
        </p>
        {action ? <div className="pt-2.5">{action}</div> : null}
      </div>
    </div>
  );
}
