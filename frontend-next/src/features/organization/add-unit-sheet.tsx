"use client";

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { Button } from "@/design-system/primitives/button";
import { TextInput, SelectInput } from "@/design-system/primitives/field";
import type { OrganizationUnitNode } from "./contracts";
import { createUnit } from "./service";

interface AddUnitSheetProps {
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
  parentUnitId: number | null;
  units: OrganizationUnitNode[];
}

interface FormValues {
  unit_name: string;
  unit_type: string;
  parent_id: string;
  unit_code: string;
  sort_order: string;
}

/** Flatten org tree into a list of { id, label, depth } for a flat <select>. */
function flattenForSelect(
  nodes: OrganizationUnitNode[],
  depth = 0,
): { id: number; label: string; depth: number }[] {
  const result: { id: number; label: string; depth: number }[] = [];
  for (const node of nodes) {
    result.push({ id: node.id, label: node.unitName, depth });
    if (node.children.length > 0) {
      result.push(...flattenForSelect(node.children, depth + 1));
    }
  }
  return result;
}

export function AddUnitSheet({
  onClose,
  onSuccess,
  open,
  parentUnitId,
  units,
}: AddUnitSheetProps) {
  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>();

  useEffect(() => {
    if (open) {
      reset({
        unit_name: "",
        unit_type: "TEAM",
        parent_id: parentUnitId != null ? String(parentUnitId) : "",
        unit_code: "",
        sort_order: "0",
      });
    }
  }, [open, parentUnitId, reset]);

  const flatUnits = useMemo(() => flattenForSelect(units), [units]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createUnit({
        unit_name: values.unit_name,
        unit_type: values.unit_type as "DEPARTMENT" | "TEAM" | "GROUP" | "SHIFT",
        parent_id: values.parent_id ? Number(values.parent_id) : null,
        unit_code: values.unit_code || undefined,
        sort_order: values.sort_order ? Number(values.sort_order) : 0,
      }),
    onSuccess: () => {
      onSuccess();
    },
  });

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <Button onClick={onClose} size="sm" variant="ghost">
        取消
      </Button>
      <Button
        disabled={mutation.isPending}
        onClick={handleSubmit((values) => mutation.mutate(values))}
        size="sm"
        variant="primary"
      >
        {mutation.isPending ? "创建中..." : "创建"}
      </Button>
    </div>
  );

  return (
    <SideSheet
      description="创建一个新的组织单元，可指定上级单元"
      footer={footer}
      onClose={onClose}
      open={open}
      title="添加组织单元"
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <TextInput
          error={errors.unit_name?.message}
          label="单元名称"
          placeholder="请输入名称..."
          required
          {...register("unit_name", {
            required: "单元名称不能为空",
            minLength: { value: 1, message: "单元名称不能为空" },
          })}
        />

        <SelectInput
          label="单元类型"
          required
          {...register("unit_type", { required: "请选择类型" })}
        >
          <option value="DEPARTMENT">部门 (Department)</option>
          <option value="TEAM">团队 (Team)</option>
          <option value="GROUP">工段 (Group)</option>
          <option value="SHIFT">班组 (Shift)</option>
        </SelectInput>

        <SelectInput label="上级单元" {...register("parent_id")}>
          <option value="">根级别（无上级）</option>
          {flatUnits.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {"　".repeat(u.depth)}{u.label}
            </option>
          ))}
        </SelectInput>

        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="单元编码"
            placeholder="例如 DEPT-01"
            {...register("unit_code")}
          />
          <TextInput
            label="排序"
            min={0}
            type="number"
            {...register("sort_order")}
          />
        </div>

        {/* Mutation error */}
        {mutation.isError && (
          <div className="rounded-[var(--pl-radius-sm)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-3.5 py-3 text-sm text-[var(--pl-danger)]">
            创建失败，请稍后重试
          </div>
        )}
      </form>
    </SideSheet>
  );
}
