"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/design-system/primitives/button";
import { ConfirmDialog } from "@/design-system/primitives/confirm-dialog";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import {
  DataTablePattern,
  type DataTableColumn,
} from "@/design-system/patterns/data-table-pattern";
import type { Employee, UnavailabilityRecord } from "./contracts";
import { resolveReasonTone } from "./presentation";
import {
  deleteUnavailability,
  getUnavailability,
  organizationQueryKeys,
} from "./service";
import { UnavailabilityEditorSheet } from "./unavailability-editor-sheet";

interface UnavailabilityTabProps {
  allEmployees: Employee[];
  onRefresh: () => void;
  selectedUnitId: number | null;
}

export function UnavailabilityTab({
  allEmployees,
  selectedUnitId,
}: UnavailabilityTabProps) {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<UnavailabilityRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UnavailabilityRecord | null>(null);

  // ─── Data query ──────────────────────────────────────────────
  const dataQuery = useQuery({
    queryKey: organizationQueryKeys.unavailability(selectedUnitId),
    queryFn: () => getUnavailability(selectedUnitId),
  });

  const records = useMemo(() => dataQuery.data ?? [], [dataQuery.data]);

  // ─── Filtered ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!searchText.trim()) return records;
    const q = searchText.toLowerCase();
    return records.filter(
      (r) =>
        r.employeeName.toLowerCase().includes(q) ||
        (r.notes && r.notes.toLowerCase().includes(q)),
    );
  }, [records, searchText]);

  // ─── Delete mutation ────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteUnavailability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationQueryKeys.unavailability(selectedUnitId),
      });
      setDeleteTarget(null);
    },
  });

  // ─── Columns ─────────────────────────────────────────────────
  const columns: DataTableColumn<UnavailabilityRecord>[] = useMemo(
    () => [
      {
        key: "employee",
        header: "员工",
        render: (row) => (
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--pl-accent-soft)] text-xs font-bold text-[var(--pl-accent-strong)]">
              {row.employeeName[0]}
            </span>
            <span className="font-medium text-[var(--pl-text-primary)]">
              {row.employeeName}
            </span>
          </div>
        ),
      },
      {
        key: "startDate",
        header: "起始日期",
        render: (row) => formatDate(row.startDate),
      },
      {
        key: "endDate",
        header: "结束日期",
        render: (row) => formatDate(row.endDate),
      },
      {
        key: "reason",
        header: "原因",
        render: (row) => (
          <StatusBadge
            label={row.reasonLabel}
            tone={resolveReasonTone(row.reasonCode)}
          />
        ),
      },
      {
        key: "notes",
        header: "备注",
        className: "max-w-[200px] truncate",
        render: (row) => (
          <span className="text-[var(--pl-text-tertiary)]">
            {row.notes || "—"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "操作",
        align: "right",
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              onClick={() => {
                setEditingRecord(row);
                setEditorOpen(true);
              }}
              size="sm"
              variant="ghost"
            >
              编辑
            </Button>
            <Button
              className="text-[var(--pl-danger)] hover:text-[var(--pl-danger)]"
              onClick={() => setDeleteTarget(row)}
              size="sm"
              variant="ghost"
            >
              删除
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--pl-text-tertiary)]">
            🔍
          </span>
          <input
            className="h-10 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface)] pl-9 pr-3.5 text-sm leading-5 text-[var(--pl-text-primary)] outline-none transition-colors placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索员工或备注..."
            type="search"
            value={searchText}
          />
        </div>

        <Button
          onClick={() => {
            setEditingRecord(null);
            setEditorOpen(true);
          }}
          size="sm"
          variant="primary"
        >
          + 添加不可用时段
        </Button>
      </div>

      {/* Table */}
      <DataTablePattern
        columns={columns}
        emptyDescription="当前时间段内暂无不可用记录"
        emptyTitle="暂无记录"
        errorDescription="加载不可用记录失败"
        getRowKey={(row) => String(row.id)}
        isLoading={dataQuery.isLoading}
        rows={filtered}
        title={`不可用时段 · ${filtered.length} 条记录`}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        confirmLabel="确认删除"
        description={`确定要删除「${deleteTarget?.employeeName}」的不可用记录吗？`}
        isPending={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        open={deleteTarget != null}
        title="删除不可用记录"
      />

      {/* Editor */}
      <UnavailabilityEditorSheet
        employees={allEmployees}
        onClose={() => {
          setEditorOpen(false);
          setEditingRecord(null);
        }}
        onSuccess={() => {
          setEditorOpen(false);
          setEditingRecord(null);
          queryClient.invalidateQueries({
            queryKey: organizationQueryKeys.unavailability(selectedUnitId),
          });
        }}
        open={editorOpen}
        record={editingRecord}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}
