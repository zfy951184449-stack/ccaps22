"use client";

import { useState } from "react";
import { Button } from "@/design-system/primitives/button";
import { TextInput } from "@/design-system/primitives/field";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { qualificationMutationSchema } from "./contracts";

export function QualificationEditorSheet({
  defaultValue,
  errorMessage,
  mode,
  onClose,
  onSubmit,
  open,
  pending,
}: {
  defaultValue?: string;
  errorMessage?: string | null;
  mode: "create" | "edit";
  onClose: () => void;
  onSubmit: (payload: { qualification_name: string }) => void;
  open: boolean;
  pending: boolean;
}) {
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [qualificationName, setQualificationName] = useState(defaultValue ?? "");

  const submitLabel = mode === "create" ? "保存资质" : "保存修改";

  return (
    <SideSheet
      description="资质是人员能力和操作要求的共享字典项。先在这里维护命名，再到相关页面完成绑定。"
      footer={
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} size="sm" variant="ghost">
            取消
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              const parsedPayload = qualificationMutationSchema.safeParse({
                qualification_name: qualificationName,
              });

              if (!parsedPayload.success) {
                setFieldError(parsedPayload.error.issues[0]?.message ?? "请输入有效的资质名称");
                return;
              }

              setFieldError(null);
              onSubmit(parsedPayload.data);
            }}
            size="sm"
          >
            {pending ? "处理中..." : submitLabel}
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      title={mode === "create" ? "新增资质" : "编辑资质"}
    >
      <div className="space-y-6">
        <TextInput
          autoFocus
          error={fieldError ?? undefined}
          hint={`字数 ${qualificationName.trim().length} / 100`}
          label="资质名称"
          maxLength={100}
          onChange={(event) => {
            setQualificationName(event.target.value);
            setFieldError(null);
          }}
          placeholder="例如：无菌灌装操作证"
          required
          value={qualificationName}
        />
        <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
            预期影响
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
            {mode === "create"
              ? "新建后可在“组织与人员”和“操作管理”中被引用。"
              : "修改名称后，相关人员和操作引用会自动沿用同一资质。"}
          </p>
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
