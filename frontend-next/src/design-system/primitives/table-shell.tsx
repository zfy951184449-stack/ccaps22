import type { ReactNode } from "react";

export function TableShell({
  children,
  columns,
  title,
}: {
  children?: ReactNode;
  columns: string[];
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]">
      <div className="border-b border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3">
        <h3 className="text-xs font-semibold leading-4 text-[var(--pl-text-tertiary)]">
          {title}
        </h3>
      </div>
      <div className="grid grid-cols-[1.2fr_repeat(3,minmax(0,1fr))] gap-px bg-[var(--pl-border)]">
        {columns.map((column) => (
          <div
            key={column}
            className="bg-[var(--pl-surface)] px-3 py-2.5 text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]"
          >
            {column}
          </div>
        ))}
        {children}
      </div>
    </div>
  );
}
