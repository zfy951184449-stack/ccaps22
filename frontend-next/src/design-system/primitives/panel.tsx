import { cn } from "@/lib/cn";
import type { HTMLAttributes, ReactNode } from "react";

export type PanelProps = HTMLAttributes<HTMLDivElement> & {
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: ReactNode;
};

export function Panel({
  action,
  children,
  className,
  description,
  eyebrow,
  title,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-5",
        className,
      )}
      {...props}
    >
      {(eyebrow || title || description || action) ? (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <div className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="break-words text-lg font-semibold leading-6 tracking-[-0.02em] text-[var(--pl-text-primary)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-3xl text-sm leading-5 text-[var(--pl-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
