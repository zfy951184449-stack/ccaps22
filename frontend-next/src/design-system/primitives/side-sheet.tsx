"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function SideSheet({
  children,
  description,
  footer,
  onClose,
  open,
  title,
}: {
  children: ReactNode;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close sheet overlay"
        className="absolute inset-0 bg-[rgba(13,27,42,0.32)]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className={cn(
          "relative flex h-full w-full max-w-[520px] flex-col border-l border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-soft)]",
        )}
        role="dialog"
      >
        <header className="border-b border-[var(--pl-border)] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1.5">
              <h2 className="break-words text-xl font-semibold leading-6 tracking-[-0.03em] text-[var(--pl-text-primary)]">
                {title}
              </h2>
              {description ? (
                <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] text-lg leading-none text-[var(--pl-text-secondary)] transition-colors hover:text-[var(--pl-text-primary)]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </header>
        <div className="pl-scrollbar flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="border-t border-[var(--pl-border)] bg-[var(--pl-surface)] px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
