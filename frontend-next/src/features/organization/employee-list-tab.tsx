"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/design-system/primitives/button";
import { ConfirmDialog } from "@/design-system/primitives/confirm-dialog";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import {
  DataTablePattern,
  type DataTableColumn,
} from "@/design-system/patterns/data-table-pattern";
import type { Employee, OrganizationUnitNode } from "./contracts";
import {
  resolveEmploymentStatusLabel,
  resolveEmploymentStatusTone,
} from "./presentation";
import { deleteEmployee, organizationQueryKeys } from "./service";
import { EmployeeEditorSheet } from "./employee-editor-sheet";

interface EmployeeListTabProps {
  employees: Employee[];
  isLoading: boolean;
  onRefresh: () => void;
  units: OrganizationUnitNode[];
}

export function EmployeeListTab({
  employees,
  isLoading,
  onRefresh,
  units,
}: EmployeeListTabProps) {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  // ─── Filtered data ──────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchText.trim()) return employees;
    const q = searchText.toLowerCase();
    return employees.filter(
      (e) =>
        e.employee_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q),
    );
  }, [employees, searchText]);

  // ─── Delete mutation ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEmployee(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.employees,
      });
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.tree,
      });
      setDeleteTarget(null);
      onRefresh();
    },
  });

  const handleEdit = useCallback((emp: Employee) => {
    setEditingEmployee(emp);
    setEditorOpen(true);
  }, []);

  // ─── Table columns ──────────────────────────────────────────
  const columns: DataTableColumn<Employee>[] = useMemo(
    () => [
      {
        key: "name",
        header: "姓名",
        render: (row) => (
          <span className="font-semibold text-[var(--pl-text-primary)]">
            {row.employee_name}
          </span>
        ),
      },
      {
        key: "code",
        header: "工号",
        render: (row) => (
          <span className="font-mono text-[var(--pl-text-tertiary)]">
            {row.employee_code}
          </span>
        ),
      },
      {
        key: "position",
        header: "岗位",
        render: (row) => (
          <span>{row.primary_role_name ?? row.org_role ?? "—"}</span>
        ),
      },
      {
        key: "status",
        header: "状态",
        render: (row) => (
          <StatusBadge
            label={resolveEmploymentStatusLabel(row.employment_status)}
            tone={resolveEmploymentStatusTone(row.employment_status)}
          />
        ),
      },
      {
        key: "actions",
        header: "操作",
        align: "right",
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              onClick={() => handleEdit(row)}
              size="sm"
              variant="ghost"
            >
              编辑
            </Button>
            <Button
              onClick={() => setDeleteTarget(row)}
              size="sm"
              variant="ghost"
              className="text-[var(--pl-danger)] hover:text-[var(--pl-danger)]"
            >
              删除
            </Button>
          </div>
        ),
      },
    ],
    [handleEdit],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search */}
        <div className="relative max-w-sm flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--pl-text-tertiary)]">
            🔍
          </span>
          <input
            className="h-10 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] pl-9 pr-3.5 text-sm leading-5 text-[var(--pl-text-primary)] outline-none transition-colors placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索姓名或工号..."
            type="search"
            value={searchText}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button disabled size="sm" variant="secondary">
            导出
          </Button>
          <Button disabled size="sm" variant="secondary">
            导入
          </Button>
        </div>
      </div>

      {/* Data table */}
      <DataTablePattern
        columns={columns}
        emptyDescription="当前组织单元下暂无人员记录"
        emptyTitle="暂无人员"
        errorDescription="加载人员列表失败，请稍后重试"
        getRowKey={(row) => String(row.id)}
        isLoading={isLoading}
        rows={filtered}
        title={`人员列表 · ${filtered.length} 条记录`}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        confirmLabel="确认删除"
        description={`确定要删除员工「${deleteTarget?.employee_name}」吗？此操作不可撤销。`}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
          }
        }}
        open={deleteTarget != null}
        title="删除员工"
      />

      {/* Employee editor */}
      <EmployeeEditorSheet
        employee={editingEmployee}
        onClose={() => {
          setEditorOpen(false);
          setEditingEmployee(null);
        }}
        onSuccess={() => {
          setEditorOpen(false);
          setEditingEmployee(null);
          onRefresh();
        }}
        open={editorOpen}
        units={units}
      />
    </div>
  );
}
