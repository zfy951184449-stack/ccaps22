"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SideSheet } from "@/design-system/primitives/side-sheet";
import { Button } from "@/design-system/primitives/button";
import { TextInput, SelectInput } from "@/design-system/primitives/field";
import type { Employee, OrganizationUnitNode } from "./contracts";
import {
  getEmployeeRoles,
  updateEmployee,
  organizationQueryKeys,
} from "./service";
import { EMPLOYMENT_STATUS_OPTIONS } from "./presentation";

interface EmployeeEditorSheetProps {
  employee: Employee | null;
  onClose: () => void;
  onSuccess: () => void;
  open: boolean;
  units: OrganizationUnitNode[];
}

interface FormValues {
  employeeName: string;
  primaryRoleId: string;
  employmentStatus: string;
  hireDate: string;
}

export function EmployeeEditorSheet({
  employee,
  onClose,
  onSuccess,
  open,
}: EmployeeEditorSheetProps) {
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: organizationQueryKeys.employeeRoles,
    queryFn: getEmployeeRoles,
    enabled: open,
  });

  const {
    formState: { errors },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>();

  // Reset form when employee changes
  useEffect(() => {
    if (open && employee) {
      reset({
        employeeName: employee.employee_name,
        primaryRoleId: employee.primary_role_id != null
          ? String(employee.primary_role_id)
          : "",
        employmentStatus: employee.employment_status || "ACTIVE",
        hireDate: employee.hire_date ?? "",
      });
    } else if (!open) {
      reset({
        employeeName: "",
        primaryRoleId: "",
        employmentStatus: "ACTIVE",
        hireDate: "",
      });
    }
  }, [open, employee, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      if (!employee) throw new Error("No employee selected");
      return updateEmployee(employee.id, {
        employeeName: values.employeeName,
        primaryRoleId: values.primaryRoleId
          ? Number(values.primaryRoleId)
          : null,
        employmentStatus: values.employmentStatus,
        hireDate: values.hireDate || null,
        unitId: employee.unit_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.employees,
      });
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.tree,
      });
      onSuccess();
    },
  });

  const roles = rolesQuery.data ?? [];

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
        {mutation.isPending ? "保存中..." : "保存修改"}
      </Button>
    </div>
  );

  return (
    <SideSheet
      description={
        employee
          ? `工号: ${employee.employee_code}`
          : undefined
      }
      footer={footer}
      onClose={onClose}
      open={open}
      title={employee ? "编辑员工" : "员工详情"}
    >
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        {/* Section: Basic Info */}
        <div className="space-y-4">
          <div className="text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]">
            基本信息
          </div>
          <TextInput
            error={errors.employeeName?.message}
            label="姓名"
            required
            {...register("employeeName", {
              required: "姓名不能为空",
              minLength: { value: 1, message: "姓名不能为空" },
            })}
          />
          <TextInput
            disabled
            label="工号"
            value={employee?.employee_code ?? ""}
          />
        </div>

        {/* Section: Professional */}
        <div className="space-y-4">
          <div className="text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]">
            职位信息
          </div>
          <SelectInput label="岗位" {...register("primaryRoleId")}>
            <option value="">请选择岗位</option>
            {roles.map((role) => (
              <option key={role.id} value={String(role.id)}>
                {role.role_name}
              </option>
            ))}
          </SelectInput>

          {/* Organization unit (read-only display) */}
          <div className="flex min-w-0 flex-col gap-2">
            <span className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
              所属组织
            </span>
            <div className="flex min-h-[40px] items-center rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3.5 text-sm text-[var(--pl-text-secondary)]">
              {employee?.unit_name ?? "未分配"}
            </div>
          </div>
        </div>

        {/* Section: Personal */}
        <div className="space-y-4">
          <div className="text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]">
            个人信息
          </div>
          <div className="grid grid-cols-2 gap-4">
            <SelectInput label="在岗状态" {...register("employmentStatus")}>
              {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectInput>
            <TextInput label="入职日期" type="date" {...register("hireDate")} />
          </div>
        </div>

        {/* Mutation error */}
        {mutation.isError && (
          <div className="rounded-[var(--pl-radius-sm)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-3.5 py-3 text-sm text-[var(--pl-danger)]">
            保存失败，请稍后重试
          </div>
        )}
      </form>
    </SideSheet>
  );
}
