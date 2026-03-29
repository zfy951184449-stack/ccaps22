"use client";

import { cn } from "@/lib/cn";

type ToastTone = "accent" | "success" | "warning" | "danger";

const toneClassName: Record<ToastTone, string> = {
  accent:
    "border-[rgba(11,106,162,0.2)] bg-[var(--pl-accent-soft)] text-[var(--pl-accent-strong)]",
  success:
    "border-[rgba(24,121,78,0.18)] bg-[var(--pl-success-soft)] text-[var(--pl-success)]",
  warning:
    "border-[rgba(154,103,0,0.18)] bg-[var(--pl-warning-soft)] text-[var(--pl-warning)]",
  danger:
    "border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] text-[var(--pl-danger)]",
};

export type ToastItem = {
  description?: string;
  id: string;
  title: string;
  tone: ToastTone;
};

export function ToastStack({
  onDismiss,
  toasts,
}: {
  onDismiss: (id: string) => void;
  toasts: ToastItem[];
}) {
  if (!toasts.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-full max-w-[360px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "pointer-events-auto rounded-[var(--pl-radius-sm)] border px-3.5 py-3",
            toneClassName[toast.tone],
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-semibold">{toast.title}</div>
              {toast.description ? (
                <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <button
              className="rounded-[var(--pl-radius-sm)] px-2 py-1 text-sm font-semibold text-[var(--pl-text-secondary)] transition-colors hover:text-[var(--pl-text-primary)]"
              onClick={() => onDismiss(toast.id)}
              type="button"
            >
              关闭
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
