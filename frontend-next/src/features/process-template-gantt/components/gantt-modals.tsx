/* ── GanttModals ──────────────────────────────────────────────────
 *
 * Modal/side-sheet collection for editing stages, operations,
 * constraints, share groups, and validation results.
 * Uses design-system SideSheet + Field.
 */

"use client";

import React, { useEffect, useState } from "react";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import type {
  GanttNode,
  Operation,
  ProcessStage,
  StageOperation,
  ConstraintValidationResult,
  ShareGroup,
} from "../types";

// ── Stage Edit Sheet ────────────────────────────────────────────────

interface StageEditSheetProps {
  open: boolean;
  onClose: () => void;
  node: GanttNode | null;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}

export function StageEditSheet({ open, onClose, node, onSave }: StageEditSheetProps) {
  const stage = node?.data as ProcessStage | undefined;
  const [stageName, setStageName] = useState("");
  const [startDay, setStartDay] = useState(0);
  const [stageOrder, setStageOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (stage) {
      setStageName(stage.stageName ?? "");
      setStartDay(stage.startDay ?? 0);
      setStageOrder(stage.stageOrder ?? 0);
    }
  }, [stage]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({ stageName, startDay, stageOrder });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <SideSheet open={open} onClose={onClose} title="编辑阶段">
      <div className="flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--pl-text-secondary)]">阶段名称</span>
          <input
            type="text"
            className="rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 py-1.5 text-sm text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]"
            value={stageName}
            onChange={(e) => setStageName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--pl-text-secondary)]">开始日 (Day)</span>
          <input
            type="number"
            className="rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 py-1.5 text-sm text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]"
            value={startDay}
            onChange={(e) => setStartDay(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--pl-text-secondary)]">排序</span>
          <input
            type="number"
            className="rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 py-1.5 text-sm text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]"
            value={stageOrder}
            onChange={(e) => setStageOrder(Number(e.target.value))}
          />
        </label>

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--pl-border)] px-3 py-1.5 text-sm text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-canvas)]"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-[var(--pl-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--pl-accent-strong)] disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </SideSheet>
  );
}

// ── Operation Edit Sheet ────────────────────────────────────────────

interface OperationEditSheetProps {
  open: boolean;
  onClose: () => void;
  node: GanttNode | null;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}

export function OperationEditSheet({ open, onClose, node, onSave }: OperationEditSheetProps) {
  const opData = node?.data as StageOperation | undefined;
  const [operationDay, setOperationDay] = useState(0);
  const [recommendedTime, setRecommendedTime] = useState(9);
  const [windowStartTime, setWindowStartTime] = useState(7);
  const [windowEndTime, setWindowEndTime] = useState(18);
  const [windowStartDayOffset, setWindowStartDayOffset] = useState(0);
  const [windowEndDayOffset, setWindowEndDayOffset] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (opData) {
      setOperationDay(opData.operationDay ?? 0);
      setRecommendedTime(opData.recommendedTime ?? 9);
      setWindowStartTime(opData.windowStartTime ?? 7);
      setWindowEndTime(opData.windowEndTime ?? 18);
      setWindowStartDayOffset(opData.windowStartDayOffset ?? 0);
      setWindowEndDayOffset(opData.windowEndDayOffset ?? 0);
    }
  }, [opData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        operationDay,
        recommendedTime,
        windowStartTime,
        windowEndTime,
        windowStartDayOffset,
        windowEndDayOffset,
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 py-1.5 text-sm text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]";

  return (
    <SideSheet open={open} onClose={onClose} title={`编辑操作 · ${node?.title ?? ""}`}>
      <div className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--pl-text-secondary)]">操作日 (相对阶段)</span>
          <input type="number" className={fieldClass} value={operationDay} onChange={(e) => setOperationDay(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--pl-text-secondary)]">建议时间</span>
          <input type="number" step="0.5" className={fieldClass} value={recommendedTime} onChange={(e) => setRecommendedTime(Number(e.target.value))} />
        </label>

        <div className="mt-2 border-t border-[var(--pl-border)] pt-3">
          <span className="text-xs font-semibold text-[var(--pl-text-primary)]">时间窗口</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--pl-text-tertiary)]">开始时间</span>
            <input type="number" step="0.5" className={fieldClass} value={windowStartTime} onChange={(e) => setWindowStartTime(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--pl-text-tertiary)]">开始偏移天</span>
            <input type="number" className={fieldClass} value={windowStartDayOffset} onChange={(e) => setWindowStartDayOffset(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--pl-text-tertiary)]">结束时间</span>
            <input type="number" step="0.5" className={fieldClass} value={windowEndTime} onChange={(e) => setWindowEndTime(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-[var(--pl-text-tertiary)]">结束偏移天</span>
            <input type="number" className={fieldClass} value={windowEndDayOffset} onChange={(e) => setWindowEndDayOffset(Number(e.target.value))} />
          </label>
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-[var(--pl-border)] px-3 py-1.5 text-sm text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-canvas)]">取消</button>
          <button onClick={handleSave} disabled={saving} className="rounded-md bg-[var(--pl-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--pl-accent-strong)] disabled:opacity-50">
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </SideSheet>
  );
}

// ── Operation Add Sheet ─────────────────────────────────────────────

interface OperationAddSheetProps {
  open: boolean;
  onClose: () => void;
  availableOperations: Operation[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  submitting: boolean;
}

export function OperationAddSheet({
  open,
  onClose,
  availableOperations,
  onSubmit,
  submitting,
}: OperationAddSheetProps) {
  const [selectedOpId, setSelectedOpId] = useState<number | null>(null);
  const [operationDay, setOperationDay] = useState(0);
  const [recommendedTime, setRecommendedTime] = useState(9);
  const [search, setSearch] = useState("");

  const filtered = availableOperations.filter(
    (op) =>
      !search ||
      op.operationName.toLowerCase().includes(search.toLowerCase()) ||
      op.operationCode.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSubmit = () => {
    if (selectedOpId === null) return;
    onSubmit({
      operationId: selectedOpId,
      operationDay,
      recommendedTime,
      windowStartTime: 7,
      windowEndTime: 18,
    });
  };

  const fieldClass = "rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 py-1.5 text-sm text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]";

  return (
    <SideSheet open={open} onClose={onClose} title="添加操作">
      <div className="flex flex-col gap-3 p-4">
        <input
          type="text"
          placeholder="搜索操作…"
          className={fieldClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-48 overflow-y-auto rounded border border-[var(--pl-border)]">
          {filtered.map((op) => (
            <div
              key={op.id}
              onClick={() => setSelectedOpId(op.id)}
              className={`cursor-pointer border-b border-[var(--pl-border)] px-3 py-2 text-sm transition-colors last:border-b-0 ${
                selectedOpId === op.id
                  ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]"
                  : "text-[var(--pl-text-primary)] hover:bg-[var(--pl-canvas)]"
              }`}
            >
              <div className="font-medium">{op.operationName}</div>
              <div className="text-xs text-[var(--pl-text-tertiary)]">
                {op.operationCode} · {op.standardTime}h · {op.requiredPeople}人
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-[var(--pl-text-tertiary)]">
              无匹配操作
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pl-text-secondary)]">操作日</span>
            <input type="number" className={fieldClass} value={operationDay} onChange={(e) => setOperationDay(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pl-text-secondary)]">建议时间</span>
            <input type="number" step="0.5" className={fieldClass} value={recommendedTime} onChange={(e) => setRecommendedTime(Number(e.target.value))} />
          </label>
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-[var(--pl-border)] px-3 py-1.5 text-sm text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-canvas)]">取消</button>
          <button onClick={handleSubmit} disabled={submitting || selectedOpId === null} className="rounded-md bg-[var(--pl-accent)] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[var(--pl-accent-strong)] disabled:opacity-50">
            {submitting ? "添加中…" : "添加"}
          </button>
        </div>
      </div>
    </SideSheet>
  );
}

// ── Validation Drawer ───────────────────────────────────────────────

interface ValidationDrawerProps {
  open: boolean;
  onClose: () => void;
  result: ConstraintValidationResult | null;
  loading: boolean;
  onHighlight: (ops: string[], constraints: number[]) => void;
}

export function ValidationDrawer({
  open,
  onClose,
  result,
  loading,
  onHighlight,
}: ValidationDrawerProps) {
  return (
    <SideSheet open={open} onClose={onClose} title="约束校验结果">
      <div className="p-4">
        {loading && (
          <div className="py-8 text-center text-sm text-[var(--pl-text-tertiary)]">
            校验中…
          </div>
        )}

        {!loading && result && (
          <>
            <div
              className={`mb-4 rounded-md px-3 py-2 text-sm font-medium ${
                result.isValid
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {result.isValid ? "✓ 所有约束校验通过" : `✕ 发现 ${result.conflicts.length} 个冲突`}
            </div>

            {result.conflicts.map((conflict, i) => (
              <div
                key={i}
                className="mb-2 cursor-pointer rounded border border-[var(--pl-border)] p-3 text-sm transition-colors hover:bg-[var(--pl-canvas)]"
                onClick={() =>
                  onHighlight(
                    conflict.operationScheduleIds.map((id) => `operation_${id}`),
                    conflict.constraintIds,
                  )
                }
              >
                <div className={`text-xs font-medium ${conflict.severity === "error" ? "text-red-600" : "text-amber-600"}`}>
                  {conflict.severity === "error" ? "错误" : "警告"}
                </div>
                <div className="mt-1 text-[var(--pl-text-primary)]">
                  {conflict.message}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </SideSheet>
  );
}

// ── Share Group Panel ───────────────────────────────────────────────

interface ShareGroupPanelProps {
  open: boolean;
  onClose: () => void;
  shareGroups: ShareGroup[];
  onDelete: (groupId: number) => void;
}

export function ShareGroupPanel({
  open,
  onClose,
  shareGroups,
}: ShareGroupPanelProps) {
  if (!open) return null;

  return (
    <SideSheet open={open} onClose={onClose} title={`共享组 (${shareGroups.length})`}>
      <div className="p-4">
        {shareGroups.length === 0 && (
          <div className="py-8 text-center text-sm text-[var(--pl-text-tertiary)]">
            暂无共享组
          </div>
        )}

        {shareGroups.map((group) => (
          <div
            key={group.id}
            className="mb-2 rounded border border-[var(--pl-border)] p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--pl-text-primary)]">
                {group.groupName}
              </span>
              <span className="rounded bg-[var(--pl-canvas)] px-1.5 py-0.5 text-[11px] text-[var(--pl-text-tertiary)]">
                {group.shareMode === "SAME_TEAM" ? "同组" : "异组"}
              </span>
            </div>
            {group.members && group.members.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {group.members.map((m) => (
                  <span
                    key={m.id}
                    className="rounded bg-[var(--pl-accent-soft)] px-1.5 py-0.5 text-[11px] text-[var(--pl-accent)]"
                  >
                    {m.operationName}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </SideSheet>
  );
}
