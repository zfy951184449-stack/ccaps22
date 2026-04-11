/* ── Operation Card ──────────────────────────────────────────────────
 *
 * Compact card for a single operation within the phase-timeline view.
 * Shows name, time, people, and optional share-group dot.
 */

"use client";

import React from "react";
import type { StageOperation, ShareGroup } from "@/features/process-template-gantt/types";
import { SHARE_GROUP_COLORS } from "../constants";

interface OperationCardProps {
  op: StageOperation;
  shareGroups?: ShareGroup[];
  isSelectMode?: boolean;
  isSelected?: boolean;
  onSelect?: (scheduleId: number) => void;
  onDelete?: (scheduleId: number) => void;
}

export function OperationCard({
  op,
  shareGroups = [],
  isSelectMode = false,
  isSelected = false,
  onSelect,
  onDelete,
}: OperationCardProps) {
  // Find share group this op belongs to
  const memberOf = shareGroups.filter((g) =>
    g.members?.some((m) => m.scheduleId === op.id),
  );

  return (
    <div
      className={[
        "group relative flex items-center gap-2 rounded-[var(--pl-radius-sm)] border px-3 py-2 transition-all duration-150",
        isSelectMode && isSelected
          ? "border-[var(--pl-accent)] bg-[var(--pl-accent-soft)]"
          : "border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] hover:border-[var(--pl-accent)]/40",
      ].join(" ")}
      onClick={isSelectMode ? () => onSelect?.(op.id) : undefined}
      role={isSelectMode ? "checkbox" : undefined}
      aria-checked={isSelectMode ? isSelected : undefined}
    >
      {/* Share group checkbox in select mode */}
      {isSelectMode && (
        <div
          className={[
            "flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
            isSelected
              ? "border-[var(--pl-accent)] bg-[var(--pl-accent)] text-white"
              : "border-[var(--pl-border)]",
          ].join(" ")}
        >
          {isSelected && (
            <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )}

      {/* Share group dots */}
      {memberOf.length > 0 && !isSelectMode && (
        <div className="flex shrink-0 flex-col gap-0.5">
          {memberOf.map((g, gi) => (
            <div
              key={g.id}
              className="size-2 rounded-full"
              style={{
                backgroundColor:
                  g.color ?? SHARE_GROUP_COLORS[gi % SHARE_GROUP_COLORS.length],
              }}
              title={`${g.groupName} (${g.shareMode === "SAME_TEAM" ? "同团队" : "不同团队"})`}
            />
          ))}
        </div>
      )}

      {/* Main info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          <span className="truncate text-[13px] font-medium leading-5 text-[var(--pl-text-primary)]">
            {op.operationName}
          </span>
          <span className="shrink-0 text-[10px] font-mono text-[var(--pl-text-tertiary)]">
            {op.operationCode}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--pl-text-tertiary)]">
          <span>{op.standardTime ?? 4}h</span>
          <span>{op.requiredPeople ?? 1}人</span>
          <span>Day {op.operationDay} · {op.recommendedTime}:00</span>
        </div>
      </div>

      {/* Delete button (only when not in select mode) */}
      {!isSelectMode && onDelete && (
        <button
          className="shrink-0 rounded-[4px] p-1 text-[var(--pl-text-tertiary)] opacity-0 transition-all duration-150 hover:bg-[var(--pl-danger-soft)] hover:text-[var(--pl-danger)] group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(op.id);
          }}
          title="删除工序"
        >
          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
