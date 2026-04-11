/* ── Process Template V1 – List Page ──────────────────────────────────
 *
 * Full CRUD list: search, create, copy, delete.
 * Mirrors Precision Lab design patterns from V2 template-list-page.tsx
 * but routes to the new V1 editor at /process-templates/[id].
 */

"use client";

import React, { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/design-system/primitives/button";
import { Badge } from "@/design-system/primitives/badge";
import { Loader } from "@/design-system/primitives/loader";
import { EmptyState } from "@/design-system/primitives/empty-state";
import * as api from "@/services/process-template-api";

export function ProcessTemplateListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Data ──────────────────────────────────────────────────────────
  const {
    data: templates = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["process-templates"],
    queryFn: () => api.listTemplates(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: { templateName: string; description?: string }) =>
      api.createTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-templates"] });
      setShowCreateForm(false);
      setNewName("");
      setNewDescription("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-templates"] });
      setDeletingId(null);
    },
  });

  const copyMutation = useMutation({
    mutationFn: (id: number) => api.copyTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-templates"] });
    },
  });

  // ── Filter ────────────────────────────────────────────────────────
  const filtered = templates.filter(
    (t) =>
      !search ||
      t.templateName.toLowerCase().includes(search.toLowerCase()) ||
      t.templateCode.toLowerCase().includes(search.toLowerCase()),
  );

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createMutation.mutate({
      templateName: newName.trim(),
      description: newDescription.trim() || undefined,
    });
  }, [newName, newDescription, createMutation]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold leading-6 tracking-[-0.02em] text-[var(--pl-text-primary)]">
            工艺模版
          </h1>
          <p className="mt-0.5 text-[13px] leading-5 text-[var(--pl-text-tertiary)]">
            管理生产工艺流程模版，定义阶段与操作排程
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreateForm(true)}
        >
          + 新建模版
        </Button>
      </div>

      {/* ── Inline create form ───────────────────────────────────── */}
      {showCreateForm && (
        <div className="mx-6 mb-3 rounded-[var(--pl-radius-sm)] border border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] px-4 py-3">
          <div className="flex items-end gap-3">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
                模版名称
              </span>
              <input
                type="text"
                className="h-8 w-56 rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 text-sm text-[var(--pl-text-primary)] outline-none transition-colors duration-200 placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
                placeholder="输入模版名称"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-medium leading-4 text-[var(--pl-text-tertiary)]">
                描述 (可选)
              </span>
              <input
                type="text"
                className="h-8 w-full rounded-[var(--pl-radius-sm)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-3 text-sm text-[var(--pl-text-primary)] outline-none transition-colors duration-200 placeholder:text-[var(--pl-text-tertiary)] focus:border-[var(--pl-accent)]"
                placeholder="简要描述工艺流程"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </label>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? "创建中…" : "创建"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowCreateForm(false);
                setNewName("");
                setNewDescription("");
              }}
            >
              取消
            </Button>
          </div>
        </div>
      )}

      {/* ── Data Table ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="overflow-hidden rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]">
          {/* Toolbar: search + count */}
          <div className="flex items-center justify-between border-b border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <svg
                className="size-4 text-[var(--pl-text-tertiary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="搜索模版名称或编码…"
                className="h-7 w-64 bg-transparent text-sm text-[var(--pl-text-primary)] outline-none placeholder:text-[var(--pl-text-tertiary)]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <span className="text-[11px] font-medium text-[var(--pl-text-tertiary)]">
              {filtered.length} / {templates.length} 个模版
            </span>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_80px_80px_100px_100px] border-b border-[var(--pl-border)] bg-[var(--pl-surface)]">
            {["模版名称", "编码", "阶段", "天数", "所属团队", "操作"].map(
              (col) => (
                <div
                  key={col}
                  className="px-4 py-2.5 text-[11px] font-semibold leading-4 text-[var(--pl-text-tertiary)]"
                >
                  {col}
                </div>
              ),
            )}
          </div>

          {/* Table body */}
          {isLoading ? (
            <div className="px-4 py-12">
              <Loader label="加载模版列表" />
            </div>
          ) : isError ? (
            <div className="px-4 py-12 text-center text-sm text-[var(--pl-danger)]">
              加载失败，请刷新重试
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12">
              <EmptyState
                title={search ? "无匹配模版" : "暂无工艺模版"}
                description={
                  search
                    ? "尝试修改搜索关键词"
                    : "点击「新建模版」创建第一个工艺流程"
                }
              />
            </div>
          ) : (
            <div>
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className="group grid cursor-pointer grid-cols-[1fr_120px_80px_80px_100px_100px] border-b border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] transition-colors duration-150 last:border-b-0 hover:bg-[var(--pl-surface)]"
                  onClick={() =>
                    router.push(`/process-templates/${t.id}` as Route)
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      router.push(`/process-templates/${t.id}` as Route);
                  }}
                >
                  {/* Name + description */}
                  <div className="flex min-w-0 flex-col justify-center px-4 py-3">
                    <span className="truncate text-sm font-medium leading-5 text-[var(--pl-text-primary)]">
                      {t.templateName}
                    </span>
                    {t.description && (
                      <span className="mt-0.5 truncate text-[12px] leading-4 text-[var(--pl-text-tertiary)]">
                        {t.description}
                      </span>
                    )}
                  </div>

                  {/* Code */}
                  <div className="flex items-center px-4 py-3">
                    <Badge tone="neutral">{t.templateCode}</Badge>
                  </div>

                  {/* Stage count */}
                  <div className="flex items-center px-4 py-3 text-sm tabular-nums text-[var(--pl-text-secondary)]">
                    {t.stageCount ?? "—"}
                  </div>

                  {/* Total days */}
                  <div className="flex items-center px-4 py-3 text-sm tabular-nums text-[var(--pl-text-secondary)]">
                    {t.totalDays}
                  </div>

                  {/* Team */}
                  <div className="flex items-center px-4 py-3">
                    {t.teamName ? (
                      <Badge tone="accent">{t.teamName}</Badge>
                    ) : (
                      <span className="text-sm text-[var(--pl-text-tertiary)]">
                        —
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    className="flex items-center gap-1 px-4 py-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => copyMutation.mutate(t.id)}
                      className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-[var(--pl-text-secondary)] transition-colors duration-150 hover:bg-[var(--pl-accent-soft)] hover:text-[var(--pl-accent)]"
                      title="复制模版"
                      disabled={copyMutation.isPending}
                    >
                      复制
                    </button>
                    {deletingId === t.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteMutation.mutate(t.id)}
                          className="rounded-[6px] bg-[var(--pl-danger)] px-2 py-1 text-[12px] font-medium text-white"
                        >
                          确认
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="rounded-[6px] px-2 py-1 text-[12px] text-[var(--pl-text-tertiary)]"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingId(t.id)}
                        className="rounded-[6px] px-2 py-1 text-[12px] font-medium text-[var(--pl-text-secondary)] transition-colors duration-150 hover:bg-[var(--pl-danger-soft)] hover:text-[var(--pl-danger)]"
                        title="删除模版"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
