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
        className="absolute inset-0 bg-[rgba(13,27,42,0.36)]"
        onClick={onCancel}
        type="button"
      />
      <div
        aria-modal="true"
        className="relative w-full max-w-[500px] rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-5 shadow-[var(--pl-shadow-soft)]"
        role="dialog"
      >
        <div className="space-y-2">
          <div className="text-[11px] font-semibold leading-4 text-[var(--pl-danger)]">
            Confirm action
          </div>
          <h2 className="text-xl font-semibold leading-6 tracking-[-0.03em] text-[var(--pl-text-primary)]">
            {title}
          </h2>
          <p className="text-sm leading-5 text-[var(--pl-text-secondary)]">
            {description}
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
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
