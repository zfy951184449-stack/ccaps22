"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { Button } from "@/design-system/primitives/button";
import { TextInput, SelectInput } from "@/design-system/primitives/field";
import type { Employee, UnavailabilityRecord } from "./contracts";
import {
  createUnavailability,
  updateUnavailability,
} from "./service";
import { UNAVAILABILITY_REASONS } from "./presentation";

interface UnavailabilityEditorSheetProps {
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
  record: UnavailabilityRecord | null;
}

interface FormValues {
  employeeId: string;
  startDate: string;
  endDate: string;
  reasonCode: string;
  notes: string;
}

export function UnavailabilityEditorSheet({
  employees,
  onClose,
  onSuccess,
  open,
  record,
}: UnavailabilityEditorSheetProps) {
  const isEdit = record != null;

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>();

  useEffect(() => {
    if (open) {
      if (record) {
        reset({
          employeeId: String(record.employeeId),
          startDate: record.startDate.slice(0, 10),
          endDate: record.endDate.slice(0, 10),
          reasonCode: record.reasonCode,
          notes: record.notes ?? "",
        });
      } else {
        reset({
          employeeId: "",
          startDate: "",
          endDate: "",
          reasonCode: "",
          notes: "",
        });
      }
    }
  }, [open, record, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        employeeId: Number(values.employeeId),
        startDatetime: new Date(values.startDate).toISOString(),
        endDatetime: new Date(values.endDate).toISOString(),
        reasonCode: values.reasonCode as "AL" | "SL" | "PL" | "OT",
        notes: values.notes || undefined,
      };

      if (isEdit && record) {
        return updateUnavailability(record.id, payload);
      }
      return createUnavailability(payload);
    },
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
        {mutation.isPending ? "保存中..." : isEdit ? "保存修改" : "创建"}
      </Button>
    </div>
  );

  return (
    <SideSheet
      description={isEdit ? "编辑不可用时段记录" : "为员工添加不可用时段"}
      footer={footer}
      onClose={onClose}
      open={open}
      title={isEdit ? "编辑不可用时段" : "添加不可用时段"}
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <SelectInput
          disabled={isEdit}
          error={errors.employeeId?.message}
          label="员工"
          required
          {...register("employeeId", { required: "请选择员工" })}
        >
          <option value="">请选择员工</option>
          {employees.map((emp) => (
            <option key={emp.id} value={String(emp.id)}>
              {emp.employee_name} ({emp.employee_code})
            </option>
          ))}
        </SelectInput>

        <div className="grid grid-cols-2 gap-4">
          <TextInput
            error={errors.startDate?.message}
            label="起始日期"
            required
            type="date"
            {...register("startDate", { required: "请选择起始日期" })}
          />
          <TextInput
            error={errors.endDate?.message}
            label="结束日期"
            required
            type="date"
            {...register("endDate", { required: "请选择结束日期" })}
          />
        </div>

        <SelectInput
          error={errors.reasonCode?.message}
          label="原因"
          required
          {...register("reasonCode", { required: "请选择原因" })}
        >
          <option value="">请选择原因</option>
          {UNAVAILABILITY_REASONS.map((reason) => (
            <option key={reason.value} value={reason.value}>
              {reason.label}
            </option>
          ))}
        </SelectInput>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
            备注
          </span>
          <textarea
            className="min-h-[80px] w-full resize-y rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 py-2.5 text-sm leading-5 text-[var(--pl-text-primary)] outline-none transition-colors placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
            placeholder="选填备注信息..."
            {...register("notes")}
          />
        </div>

        {/* Mutation error */}
        {mutation.isError && (
          <div className="rounded-[var(--pl-radius-sm)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-3.5 py-3 text-sm text-[var(--pl-danger)]">
            {isEdit ? "更新失败" : "创建失败"}，请稍后重试
          </div>
        )}
      </form>
    </SideSheet>
  );
}
