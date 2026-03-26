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
        "rounded-[var(--pl-radius-lg)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-6 shadow-[var(--pl-shadow-soft)]",
        className,
      )}
      {...props}
    >
      {(eyebrow || title || description || action) ? (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            {eyebrow ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--pl-text-tertiary)]">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--pl-text-primary)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-[var(--pl-text-secondary)]">
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
