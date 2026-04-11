/* ── Quick Add Operation ─────────────────────────────────────────────
 *
 * 3-step inline form: select operation → auto-fill defaults → confirm.
 * Hides window_* and day_offset parameters from the user.
 */

"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/design-system/primitives/button";
import * as api from "@/services/process-template-api";
import type { Operation } from "@/features/process-template-gantt/types";

interface QuickAddOperationProps {
  stageId: number;
  onAdd: (payload: {
    stageId: number;
    operationId: number;
    operationDay: number;
    recommendedTime: number;
  }) => void;
  onCancel: () => void;
  suggestedDay?: number;
  suggestedTime?: number;
}

export function QuickAddOperation({
  stageId,
  onAdd,
  onCancel,
  suggestedDay = 0,
  suggestedTime = 9,
}: QuickAddOperationProps) {
  const [search, setSearch] = useState("");
  const [selectedOp, setSelectedOp] = useState<Operation | null>(null);
  const [day, setDay] = useState(suggestedDay);
  const [time, setTime] = useState(suggestedTime);

  const { data: operations = [] } = useQuery({
    queryKey: ["operations-library"],
    queryFn: () => api.listOperations(),
    staleTime: 10 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!search) return operations;
    const q = search.toLowerCase();
    return operations.filter(
      (op) =>
        op.operationName.toLowerCase().includes(q) ||
        op.operationCode.toLowerCase().includes(q),
    );
  }, [operations, search]);

  const handleConfirm = () => {
    if (!selectedOp) return;
    onAdd({
      stageId,
      operationId: selectedOp.id,
      operationDay: day,
      recommendedTime: time,
    });
  };

  return (
    <div className="rounded-[var(--pl-radius-sm)] border border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] p-3">
      {!selectedOp ? (
        /* Step 1: Select operation */
        <div>
          <div className="mb-2 text-[11px] font-medium text-[var(--pl-text-tertiary)]">
            步骤 1/2：选择工序
          </div>
          <input
            type="text"
            className="mb-2 h-7 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-2.5 text-sm text-[var(--pl-text-primary)] outline-none placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
            placeholder="搜索工序名称或编码…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-36 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-center text-[12px] text-[var(--pl-text-tertiary)]">
                无匹配工序
              </div>
            ) : (
              filtered.slice(0, 20).map((op) => (
                <button
                  key={op.id}
                  onClick={() => setSelectedOp(op)}
                  className="flex w-full items-center gap-2 rounded-[var(--pl-radius-sm)] px-2 py-1.5 text-left transition-colors duration-100 hover:bg-[var(--pl-surface)]"
                >
                  <span className="text-[13px] font-medium text-[var(--pl-text-primary)]">
                    {op.operationName}
                  </span>
                  <span className="text-[10px] font-mono text-[var(--pl-text-tertiary)]">
                    {op.operationCode}
                  </span>
                  <span className="ml-auto text-[11px] text-[var(--pl-text-tertiary)]">
                    {op.standardTime}h · {op.requiredPeople}人
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        /* Step 2: Configure timing → confirm */
        <div>
          <div className="mb-2 text-[11px] font-medium text-[var(--pl-text-tertiary)]">
            步骤 2/2：设定时间
          </div>
          <div className="mb-2 rounded-[var(--pl-radius-sm)] bg-[var(--pl-surface)] px-3 py-2">
            <div className="text-[13px] font-medium text-[var(--pl-text-primary)]">
              {selectedOp.operationName}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--pl-text-tertiary)]">
              {selectedOp.standardTime}h · {selectedOp.requiredPeople}人
            </div>
          </div>
          <div className="flex gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--pl-text-tertiary)]">
                操作天 (相对阶段)
              </span>
              <input
                type="number"
                min={0}
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                className="h-7 w-20 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-2 text-sm tabular-nums text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[var(--pl-text-tertiary)]">
                建议时刻
              </span>
              <input
                type="number"
                min={0}
                max={23}
                value={time}
                onChange={(e) => setTime(Number(e.target.value))}
                className="h-7 w-20 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-2 text-sm tabular-nums text-[var(--pl-text-primary)] outline-none focus:border-[var(--pl-accent)]"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedOp(null)}>
              返回
            </Button>
            <Button variant="primary" size="sm" onClick={handleConfirm}>
              添加
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
