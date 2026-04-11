/* ── Phase Timeline – Stage Card Flow View ───────────────────────────
 *
 * Tab 1: Visual stage-based orchestration view.
 * Each stage is a collapsible card with operation cards inside.
 */

"use client";

import React, { useState } from "react";
import { Button } from "@/design-system/primitives/button";
import type { ProcessStage, StageOperation, ShareGroup } from "@/features/process-template-gantt/types";
import { STAGE_COLORS } from "../constants";
import { OperationCard } from "./operation-card";
import { QuickAddOperation } from "./quick-add-operation";

// Stable empty set to avoid re-render loops from default prop
const EMPTY_SET = new Set<number>();

interface PhaseTimelineProps {
  stages: ProcessStage[];
  operationsByStage: Record<string, StageOperation[]>;
  shareGroups: ShareGroup[];
  isSelectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (scheduleId: number) => void;
  onAddOperation: (payload: {
    stageId: number;
    operationId: number;
    operationDay: number;
    recommendedTime: number;
  }) => void;
  onDeleteOperation: (scheduleId: number) => void;
  onCreateStage: (payload: { stageName: string }) => void;
}

export function PhaseTimeline({
  stages,
  operationsByStage,
  shareGroups,
  isSelectMode = false,
  selectedIds = EMPTY_SET,
  onToggleSelect,
  onAddOperation,
  onDeleteOperation,
  onCreateStage,
}: PhaseTimelineProps) {
  const [expandedStages, setExpandedStages] = useState<Set<number>>(
    new Set(stages.map((s) => s.id)),
  );
  const [addingToStage, setAddingToStage] = useState<number | null>(null);
  const [newStageName, setNewStageName] = useState("");
  const [showNewStage, setShowNewStage] = useState(false);

  const toggleExpand = (stageId: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3 px-6 py-4">
      {stages.map((stage, idx) => {
        const ops = operationsByStage[String(stage.id)] ?? [];
        const color = STAGE_COLORS[idx % STAGE_COLORS.length];
        const isExpanded = expandedStages.has(stage.id);

        return (
          <div
            key={stage.id}
            className="overflow-hidden rounded-[var(--pl-radius-md)] border bg-[var(--pl-surface-elevated)] transition-shadow duration-200 hover:shadow-sm"
            style={{ borderLeftColor: color.border, borderLeftWidth: 3 }}
          >
            {/* Stage header */}
            <div className="flex w-full items-center justify-between px-4 py-3">
              <div
                className="flex flex-1 cursor-pointer items-center gap-2"
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(stage.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") toggleExpand(stage.id);
                }}
              >
                <svg
                  className={`size-3.5 text-[var(--pl-text-tertiary)] transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" d="M9 5l7 7-7 7" />
                </svg>
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: color.text }}
                >
                  {stage.stageName}
                </span>
                <span className="text-[11px] text-[var(--pl-text-tertiary)]">
                  Day {stage.startDay} · {ops.length} 个工序
                </span>
              </div>
              {!isSelectMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingToStage(stage.id)}
                >
                  + 添加工序
                </Button>
              )}
            </div>

            {/* Operations */}
            {isExpanded && (
              <div className="flex flex-col gap-1.5 px-4 pb-3">
                {ops.length === 0 && addingToStage !== stage.id && (
                  <div className="py-4 text-center text-[12px] text-[var(--pl-text-tertiary)]">
                    暂无工序 —&nbsp;
                    <button
                      className="text-[var(--pl-accent)] underline-offset-2 hover:underline"
                      onClick={() => setAddingToStage(stage.id)}
                    >
                      添加第一个
                    </button>
                  </div>
                )}
                {ops.map((op) => (
                  <OperationCard
                    key={op.id}
                    op={op}
                    shareGroups={shareGroups}
                    isSelectMode={isSelectMode}
                    isSelected={selectedIds.has(op.id)}
                    onSelect={onToggleSelect}
                    onDelete={onDeleteOperation}
                  />
                ))}
                {addingToStage === stage.id && (
                  <QuickAddOperation
                    stageId={stage.id}
                    onAdd={(payload) => {
                      onAddOperation(payload);
                      setAddingToStage(null);
                    }}
                    onCancel={() => setAddingToStage(null)}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Add new stage */}
      {showNewStage ? (
        <div className="flex items-center gap-2 rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] p-3">
          <input
            type="text"
            className="h-7 flex-1 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-2.5 text-sm text-[var(--pl-text-primary)] outline-none placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
            placeholder="阶段名称"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newStageName.trim()) {
                onCreateStage({ stageName: newStageName.trim() });
                setNewStageName("");
                setShowNewStage(false);
              }
            }}
            autoFocus
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (newStageName.trim()) {
                onCreateStage({ stageName: newStageName.trim() });
                setNewStageName("");
                setShowNewStage(false);
              }
            }}
            disabled={!newStageName.trim()}
          >
            创建
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowNewStage(false);
              setNewStageName("");
            }}
          >
            取消
          </Button>
        </div>
      ) : (
        <button
          className="flex items-center justify-center gap-1.5 rounded-[var(--pl-radius-md)] border border-dashed border-[var(--pl-border)] py-3 text-[13px] text-[var(--pl-text-tertiary)] transition-colors duration-150 hover:border-[var(--pl-accent)] hover:text-[var(--pl-accent)]"
          onClick={() => setShowNewStage(true)}
        >
          + 添加新阶段
        </button>
      )}
    </div>
  );
}
