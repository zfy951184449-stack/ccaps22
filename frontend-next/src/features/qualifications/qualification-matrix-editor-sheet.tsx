"use client";

import { useState } from "react";
import { Button } from "@/design-system/primitives/button";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import type {
  QualificationMatrixAssignment,
  QualificationMatrixEmployee,
  QualificationRecord,
} from "./contracts";
import { getQualificationLevelPresentation } from "./presentation";

function LevelButton({
  active,
  level,
  onClick,
}: {
  active: boolean;
  level: number;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "inline-flex h-11 min-w-14 items-center justify-center rounded-2xl border px-3 text-sm font-semibold transition-colors",
        active
          ? getQualificationLevelPresentation(level).solidClassName
          : getQualificationLevelPresentation(level).ghostClassName,
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {level} 级
    </button>
  );
}

export function QualificationMatrixEditorSheet({
  assignment,
  employee,
  errorMessage,
  onClose,
  onCreate,
  onDelete,
  onUpdate,
  open,
  pending,
  qualification,
}: {
  assignment: QualificationMatrixAssignment | null;
  employee: QualificationMatrixEmployee | null;
  errorMessage: string | null;
  onClose: () => void;
  onCreate: (qualificationLevel: number) => void;
  onDelete: () => void;
  onUpdate: (qualificationLevel: number) => void;
  open: boolean;
  pending: boolean;
  qualification: QualificationRecord | null;
}) {
  const [qualificationLevel, setQualificationLevel] = useState(
    assignment?.qualification_level ?? 3,
  );

  if (!employee || !qualification) {
    return null;
  }

  return (
    <SideSheet
      description="第一阶段仅在矩阵内维护员工资质等级。操作资质要求仍在操作管理页编辑。"
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          {assignment ? (
            <Button
              disabled={pending}
              onClick={onDelete}
              size="sm"
              variant="danger"
            >
              {pending ? "处理中..." : "移除资质"}
            </Button>
          ) : null}
          <Button onClick={onClose} size="sm" variant="ghost">
            取消
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              if (assignment) {
                onUpdate(qualificationLevel);
                return;
              }

              onCreate(qualificationLevel);
            }}
            size="sm"
          >
            {pending ? "处理中..." : assignment ? "保存等级" : "添加资质"}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={`${employee.employee_name} · ${qualification.qualification_name}`}
    >
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
              员工信息
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
              <div>{employee.employee_code} {employee.employee_name}</div>
              <div>{employee.unit_name || employee.department || "未分配组织"}</div>
              {employee.unit_name &&
              employee.department &&
              employee.unit_name !== employee.department ? (
                <div>{employee.department}</div>
              ) : null}
              <div>{employee.position || "未配置岗位"}</div>
            </div>
          </div>
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
              当前状态
            </div>
            <div className="mt-3">
              {assignment ? (
                <span
                  className={[
                    "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                    getQualificationLevelPresentation(
                      assignment.qualification_level,
                    ).badgeClassName,
                  ].join(" ")}
                >
                  已持有 {assignment.qualification_level} 级
                </span>
              ) : (
                <StatusBadge
                  label="尚未持有"
                  tone="neutral"
                />
              )}
            </div>
          </div>
        </div>

        <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
            资质等级
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5].map((level) => (
              <LevelButton
                active={qualificationLevel === level}
                key={level}
                level={level}
                onClick={() => setQualificationLevel(level)}
              />
            ))}
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-[var(--pl-radius-md)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-4 py-4 text-sm leading-6 text-[var(--pl-danger)]">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </SideSheet>
  );
}
