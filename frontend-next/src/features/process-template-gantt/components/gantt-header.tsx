/* ── GanttHeader ──────────────────────────────────────────────────
 *
 * Precision Lab toolbar: back, title, zoom, actions.
 * Uses --pl-* design tokens for consistent surfaces.
 */

"use client";

import React from "react";
import { Button } from "@/design-system/primitives/button";
import { Badge } from "@/design-system/primitives/badge";
import type { ProcessTemplate } from "../types";

interface GanttHeaderProps {
  template: ProcessTemplate;
  onBack: () => void;
  zoomScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  isDirty: boolean;
  onSave: () => Promise<void>;
  onAutoSchedule: () => Promise<void>;
  scheduling: boolean;
  onToggleSharePanel: () => void;
  shareGroupCount: number;
  isShareGroupMode: boolean;
  selectedOperationCount: number;
  onEnterShareGroupMode: () => void;
  onConfirmShareGroup: () => void;
  onCancelShareGroup: () => void;
  onValidate: () => void;
  readOnly?: boolean;
}

export function GanttHeader({
  template,
  onBack,
  zoomScale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  isDirty,
  onSave,
  onAutoSchedule,
  scheduling,
  onToggleSharePanel,
  shareGroupCount,
  isShareGroupMode,
  selectedOperationCount,
  onEnterShareGroupMode,
  onConfirmShareGroup,
  onCancelShareGroup,
  onValidate,
  readOnly,
}: GanttHeaderProps) {
  return (
    <div className="flex h-11 items-center justify-between border-b border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-4">
      {/* ── Left: back + title + dirty badge ─────────────────────── */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[13px] text-[var(--pl-text-secondary)] transition-colors duration-150 hover:bg-[var(--pl-surface)] hover:text-[var(--pl-text-primary)]"
          aria-label="返回模板列表"
        >
          <svg
            className="size-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>返回</span>
        </button>

        <div className="h-4 w-px bg-[var(--pl-border)]" />

        <h1 className="text-[13px] font-semibold leading-5 text-[var(--pl-text-primary)]">
          {template.templateName}
        </h1>

        {isDirty && (
          <Badge tone="warning">未保存</Badge>
        )}
      </div>

      {/* ── Center: zoom controls ────────────────────────────────── */}
      <div className="flex items-center rounded-[8px] border border-[var(--pl-border)] bg-[var(--pl-surface)]">
        <button
          onClick={onZoomOut}
          className="flex size-7 items-center justify-center text-[13px] text-[var(--pl-text-secondary)] transition-colors duration-150 hover:text-[var(--pl-text-primary)]"
          aria-label="缩小"
        >
          −
        </button>
        <button
          onClick={onZoomReset}
          className="flex h-7 min-w-[3.5rem] items-center justify-center border-x border-[var(--pl-border)] text-[12px] font-medium tabular-nums text-[var(--pl-text-primary)] transition-colors duration-150 hover:bg-[var(--pl-surface-elevated)]"
        >
          {Math.round(zoomScale * 100)}%
        </button>
        <button
          onClick={onZoomIn}
          className="flex size-7 items-center justify-center text-[13px] text-[var(--pl-text-secondary)] transition-colors duration-150 hover:text-[var(--pl-text-primary)]"
          aria-label="放大"
        >
          +
        </button>
      </div>

      {/* ── Right: action buttons ────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {!readOnly && (
          <>
            {isShareGroupMode ? (
              <>
                <span className="mr-1 text-[12px] tabular-nums text-[var(--pl-text-tertiary)]">
                  已选 {selectedOperationCount} 个操作
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onConfirmShareGroup}
                  disabled={selectedOperationCount < 2}
                >
                  确认创建
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelShareGroup}>
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={onValidate}>
                  校验
                </Button>
                <Button variant="ghost" size="sm" onClick={onToggleSharePanel}>
                  共享组{shareGroupCount > 0 ? ` (${shareGroupCount})` : ""}
                </Button>
                <Button variant="ghost" size="sm" onClick={onEnterShareGroupMode}>
                  快速建组
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAutoSchedule}
                  disabled={scheduling}
                >
                  {scheduling ? "排程中…" : "自动排程"}
                </Button>

                <div className="mx-1.5 h-4 w-px bg-[var(--pl-border)]" />

                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  disabled={!isDirty}
                >
                  保存
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
