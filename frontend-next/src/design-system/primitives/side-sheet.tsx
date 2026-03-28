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
        className="absolute inset-0 bg-[rgba(13,27,42,0.34)] backdrop-blur-[2px]"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-modal="true"
        className={cn(
          "relative flex h-full w-full max-w-[560px] flex-col border-l border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-strong)]",
        )}
        role="dialog"
      >
        <header className="border-b border-[var(--pl-border)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--pl-text-primary)]">
                {title}
              </h2>
              {description ? (
                <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--pl-border)] bg-[var(--pl-surface)] text-xl leading-none text-[var(--pl-text-secondary)] transition-colors hover:text-[var(--pl-text-primary)]"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </header>
        <div className="pl-scrollbar flex-1 overflow-y-auto px-6 py-6">{children}</div>
        {footer ? (
          <footer className="border-t border-[var(--pl-border)] bg-[var(--pl-surface)] px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
