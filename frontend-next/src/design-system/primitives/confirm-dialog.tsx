"use client";

import { Button } from "./button";

export function ConfirmDialog({
  confirmLabel = "Confirm",
  description,
  isPending = false,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  confirmLabel?: string;
  description: string;
  isPending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6">
      <button
        aria-label="Close confirmation dialog"
        className="absolute inset-0 bg-[rgba(13,27,42,0.42)]"
        onClick={onCancel}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative w-full max-w-[520px] rounded-[var(--pl-radius-lg)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-6 shadow-[var(--pl-shadow-strong)]"
        role="dialog"
      >
        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--pl-danger)]">
            Confirm action
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--pl-text-primary)]">
            {title}
          </h2>
          <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
            {description}
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button onClick={onCancel} size="sm" variant="ghost">
            取消
          </Button>
          <Button
            disabled={isPending}
            onClick={onConfirm}
            size="sm"
            variant="danger"
          >
            {isPending ? "处理中..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
