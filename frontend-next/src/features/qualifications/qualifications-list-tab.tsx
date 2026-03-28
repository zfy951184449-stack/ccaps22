"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/design-system/primitives/confirm-dialog";
import { Button } from "@/design-system/primitives/button";
import { Panel } from "@/design-system/primitives/panel";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import { ToastStack, type ToastItem } from "@/design-system/primitives/toast";
import { FilterBar } from "@/design-system/patterns/filter-bar";
import { OverviewStrip } from "@/design-system/patterns/overview-strip";
import { PageHeader } from "@/design-system/patterns/page-header";
import {
  DataTablePattern,
  type DataTableColumn,
} from "@/design-system/patterns/data-table-pattern";
import { StatCard } from "@/design-system/patterns/stat-card";
import { SelectInput, TextInput } from "@/design-system/primitives/field";
import { ApiError } from "@/services/http/client";
import {
  type QualificationImpact,
  type QualificationOverviewItem,
} from "./contracts";
import {
  filterAndSortQualifications,
  getUsageStatePresentation,
  type QualificationSortOrder,
  type QualificationUsageFilter,
  type QualificationWorkbenchTab,
} from "./presentation";
import {
  QualificationDeleteBlockedError,
  createQualification,
  deleteQualification,
  getQualificationImpact,
  getQualificationsOverview,
  qualificationQueryKeys,
  updateQualification,
} from "./service";
import { qualificationDeleteBlockedSchema } from "./contracts";
import { QualificationEditorSheet } from "./qualification-editor-sheet";
import { QualificationImpactSheet } from "./qualification-impact-sheet";
import { QualificationViewTabs } from "./qualification-view-tabs";

const linkButtonClassName =
  "inline-flex h-11 items-center justify-center rounded-full border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] px-4 text-sm font-medium text-[var(--pl-text-primary)] transition-colors hover:border-[var(--pl-accent)] hover:text-[var(--pl-accent)]";

type EditorState =
  | { mode: "create"; open: false }
  | { mode: "create"; open: true }
  | {
      item: QualificationOverviewItem;
      mode: "edit";
      open: true;
    };

type ImpactSheetState = {
  errorMessage: string | null;
  impact: QualificationImpact | null;
  loading: boolean;
  mode: "view" | "blocked";
  open: boolean;
};

function buildToast(title: string, tone: ToastItem["tone"], description?: string) {
  return {
    description,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    tone,
  } satisfies ToastItem;
}

export function QualificationsListTab({
  activeTab,
  onSelectTab,
}: {
  activeTab: QualificationWorkbenchTab;
  onSelectTab: (tab: QualificationWorkbenchTab) => void;
}) {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<QualificationSortOrder>("NAME_ASC");
  const [usageFilter, setUsageFilter] = useState<QualificationUsageFilter>("ALL");
  const [editorState, setEditorState] = useState<EditorState>({
    mode: "create",
    open: false,
  });
  const [editorErrorMessage, setEditorErrorMessage] = useState<string | null>(null);
  const [impactSheetState, setImpactSheetState] = useState<ImpactSheetState>({
    errorMessage: null,
    impact: null,
    loading: false,
    mode: "view",
    open: false,
  });
  const [confirmDeleteImpact, setConfirmDeleteImpact] = useState<QualificationImpact | null>(null);
  const [activeRowActionId, setActiveRowActionId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const overviewQuery = useQuery({
    queryFn: getQualificationsOverview,
    queryKey: qualificationQueryKeys.overview,
  });

  const createMutation = useMutation({
    mutationFn: createQualification,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: qualificationQueryKeys.overview,
      });
      setEditorState({ mode: "create", open: false });
      setEditorErrorMessage(null);
      pushToast("资质已创建", "success", "新的资质已加入运营视图。");
    },
    onError: (error) => {
      setEditorErrorMessage(resolveMutationErrorMessage(error, "创建资质失败"));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      payload,
      qualificationId,
    }: {
      payload: { qualification_name: string };
      qualificationId: number;
    }) => updateQualification(qualificationId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: qualificationQueryKeys.overview,
      });
      setEditorState({ mode: "create", open: false });
      setEditorErrorMessage(null);
      pushToast("资质已更新", "success", "资质名称已同步到运营视图。");
    },
    onError: (error) => {
      setEditorErrorMessage(resolveMutationErrorMessage(error, "更新资质失败"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (qualificationId: number) => deleteQualification(qualificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: qualificationQueryKeys.overview,
      });
      setConfirmDeleteImpact(null);
      pushToast("资质已删除", "success", "未被引用的资质已安全删除。");
    },
    onError: (error) => {
      if (error instanceof QualificationDeleteBlockedError) {
        setConfirmDeleteImpact(null);
        setImpactSheetState({
          errorMessage: null,
          impact: error.impact,
          loading: false,
          mode: "blocked",
          open: true,
        });
        pushToast("删除已阻止", "warning", error.message);
        return;
      }

      if (error instanceof ApiError) {
        const parsedPayload = qualificationDeleteBlockedSchema.safeParse(error.payload);
        if (parsedPayload.success) {
          setConfirmDeleteImpact(null);
          setImpactSheetState({
            errorMessage: null,
            impact: parsedPayload.data.impact,
            loading: false,
            mode: "blocked",
            open: true,
          });
          pushToast("删除已阻止", "warning", parsedPayload.data.message);
          return;
        }
      }

      pushToast(
        "删除失败",
        "danger",
        resolveMutationErrorMessage(error, "未能删除这个资质。"),
      );
    },
  });

  const filteredItems = useMemo(
    () =>
      filterAndSortQualifications(overviewQuery.data?.items ?? [], {
        searchTerm,
        sortOrder,
        usageFilter,
      }),
    [overviewQuery.data?.items, searchTerm, sortOrder, usageFilter],
  );

  const columns: DataTableColumn<QualificationOverviewItem>[] = [
    {
      key: "qualification_name",
      header: "资质名称",
      render: (item) => (
        <div>
          <div className="font-semibold text-[var(--pl-text-primary)]">
            {item.qualification_name}
          </div>
          <div className="text-xs text-[var(--pl-text-tertiary)]">
            ID {item.id}
          </div>
        </div>
      ),
    },
    {
      key: "usage_state",
      header: "使用状态",
      render: (item) => {
        const presentation = getUsageStatePresentation(item.usage_state);
        return <StatusBadge label={presentation.label} tone={presentation.tone} />;
      },
    },
    {
      key: "employee_binding_count",
      header: "人员引用",
      align: "center",
      render: (item) => (
        <span className="font-medium text-[var(--pl-text-primary)]">
          {item.employee_binding_count}
        </span>
      ),
    },
    {
      key: "operation_binding_count",
      header: "操作引用",
      align: "center",
      render: (item) => (
        <span className="font-medium text-[var(--pl-text-primary)]">
          {item.operation_binding_count}
        </span>
      ),
    },
    {
      key: "total_binding_count",
      header: "总影响",
      align: "center",
      render: (item) => (
        <span className="font-medium text-[var(--pl-text-primary)]">
          {item.total_binding_count}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      className: "min-w-[248px]",
      render: (item) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            disabled={activeRowActionId === item.id}
            onClick={() => {
              void openImpactSheet(item);
            }}
            size="sm"
            variant="ghost"
          >
            查看影响
          </Button>
          <Button
            onClick={() => {
              setEditorErrorMessage(null);
              setEditorState({ item, mode: "edit", open: true });
            }}
            size="sm"
            variant="ghost"
          >
            编辑
          </Button>
          <Button
            disabled={activeRowActionId === item.id}
            onClick={() => {
              void handleDeleteIntent(item);
            }}
            size="sm"
            variant="ghost"
          >
            {activeRowActionId === item.id ? "处理中..." : "删除"}
          </Button>
        </div>
      ),
    },
  ];

  function pushToast(title: string, tone: ToastItem["tone"], description?: string) {
    const toast = buildToast(title, tone, description);
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 4000);
  }

  async function openImpactSheet(item: QualificationOverviewItem) {
    setActiveRowActionId(item.id);
    setImpactSheetState({
      errorMessage: null,
      impact: null,
      loading: true,
      mode: "view",
      open: true,
    });

    try {
      const impact = await queryClient.fetchQuery({
        queryFn: () => getQualificationImpact(item.id),
        queryKey: qualificationQueryKeys.impact(item.id),
      });

      setImpactSheetState({
        errorMessage: null,
        impact,
        loading: false,
        mode: "view",
        open: true,
      });
    } catch (error) {
      setImpactSheetState({
        errorMessage: resolveMutationErrorMessage(error, "未能加载资质影响详情。"),
        impact: null,
        loading: false,
        mode: "view",
        open: true,
      });
    } finally {
      setActiveRowActionId(null);
    }
  }

  async function handleDeleteIntent(item: QualificationOverviewItem) {
    setActiveRowActionId(item.id);

    try {
      const impact = await queryClient.fetchQuery({
        queryFn: () => getQualificationImpact(item.id),
        queryKey: qualificationQueryKeys.impact(item.id),
      });

      if (impact.deletable) {
        setConfirmDeleteImpact(impact);
        return;
      }

      setImpactSheetState({
        errorMessage: null,
        impact,
        loading: false,
        mode: "blocked",
        open: true,
      });
      pushToast("删除已阻止", "warning", "该资质仍被引用，必须先清理关联。");
    } catch (error) {
      pushToast(
        "无法检查删除影响",
        "danger",
        resolveMutationErrorMessage(error, "请稍后重试。"),
      );
    } finally {
      setActiveRowActionId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <button
              className={linkButtonClassName}
              onClick={() => onSelectTab("matrix")}
              type="button"
            >
              前往资质矩阵
            </button>
            <Button
              onClick={() => {
                setEditorErrorMessage(null);
                setEditorState({ mode: "create", open: true });
              }}
            >
              新增资质
            </Button>
          </>
        }
        eyebrow="Wave 1 Pilot"
        subtitle="将资质字典、覆盖矩阵和需求加权短板整合到一个运营界面中，旧版 CRA 路由与接口保持不变。"
        title="资质运营台"
      />

      <QualificationViewTabs onChange={onSelectTab} value={activeTab} />

      <OverviewStrip>
        <StatCard
          label="总资质数"
          tone="accent"
          value={String(overviewQuery.data?.totals.qualification_count ?? 0)}
        />
        <StatCard
          label="在用"
          tone="success"
          value={String(overviewQuery.data?.totals.in_use_count ?? 0)}
        />
        <StatCard
          label="人员绑定"
          tone="warning"
          value={String(overviewQuery.data?.totals.employee_binding_count ?? 0)}
        />
        <StatCard
          label="操作绑定"
          tone="neutral"
          value={String(overviewQuery.data?.totals.operation_binding_count ?? 0)}
        />
      </OverviewStrip>

      <FilterBar className="space-y-4">
        <TextInput
          label="搜索资质"
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="搜索资质名称"
          value={searchTerm}
        />
        <SelectInput
          label="使用状态"
          onChange={(event) =>
            setUsageFilter(event.target.value as QualificationUsageFilter)
          }
          value={usageFilter}
        >
          <option value="ALL">全部</option>
          <option value="IN_USE">在用</option>
          <option value="UNUSED">未使用</option>
          <option value="EMPLOYEE_ONLY">仅人员引用</option>
          <option value="OPERATION_ONLY">仅操作引用</option>
          <option value="MIXED">人员+操作均引用</option>
        </SelectInput>
        <SelectInput
          label="名称排序"
          onChange={(event) =>
            setSortOrder(event.target.value as QualificationSortOrder)
          }
          value={sortOrder}
        >
          <option value="NAME_ASC">名称 A-Z</option>
          <option value="NAME_DESC">名称 Z-A</option>
        </SelectInput>
        <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
            快捷入口
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={linkButtonClassName} href="/organization-workbench">
              组织与人员
            </a>
            <a className={linkButtonClassName} href="/operations">
              操作管理
            </a>
            <button
              className={linkButtonClassName}
              onClick={() => onSelectTab("matrix")}
              type="button"
            >
              资质矩阵
            </button>
            <button
              className={linkButtonClassName}
              onClick={() => onSelectTab("shortages")}
              type="button"
            >
              查看短板
            </button>
          </div>
        </div>
      </FilterBar>

      <DataTablePattern
        columns={columns}
        emptyDescription="调整搜索或筛选条件，或者创建新的资质条目。"
        emptyTitle="没有匹配的资质"
        errorAction={
          <Button onClick={() => void overviewQuery.refetch()} size="sm" variant="secondary">
            重新加载
          </Button>
        }
        errorDescription="资质运营视图暂时不可用，请重新加载或检查后端状态。"
        getRowKey={(item) => String(item.id)}
        isError={overviewQuery.isError}
        isLoading={overviewQuery.isLoading}
        loadingLabel="正在加载资质运营视图..."
        rows={filteredItems}
        title="资质清单"
      />

      <Panel
        description="本页只处理资质字典、影响范围和安全删除。人员绑定与需求加权短板已经拆分到矩阵和短板视图中。"
        eyebrow="Operating boundary"
        title="当前边界"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 text-sm leading-6 text-[var(--pl-text-secondary)]">
            资质清单页内不直接编辑操作要求。
          </div>
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 text-sm leading-6 text-[var(--pl-text-secondary)]">
            员工资质等级编辑集中在资质矩阵视图内处理。
          </div>
          <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-4 text-sm leading-6 text-[var(--pl-text-secondary)]">
            删除必须经过后端删除保护，不依赖前端单边判断。
          </div>
        </div>
      </Panel>

      <QualificationEditorSheet
        key={
          editorState.open
            ? `${editorState.mode}-${editorState.mode === "edit" ? editorState.item.id : "new"}`
            : "closed"
        }
        defaultValue={
          editorState.open && editorState.mode === "edit"
            ? editorState.item.qualification_name
            : ""
        }
        errorMessage={editorErrorMessage}
        mode={editorState.open && editorState.mode === "edit" ? "edit" : "create"}
        onClose={() => {
          setEditorErrorMessage(null);
          setEditorState({ mode: "create", open: false });
        }}
        onSubmit={(payload) => {
          setEditorErrorMessage(null);
          if (editorState.open && editorState.mode === "edit") {
            updateMutation.mutate({
              payload,
              qualificationId: editorState.item.id,
            });
            return;
          }

          createMutation.mutate(payload);
        }}
        open={editorState.open}
        pending={createMutation.isPending || updateMutation.isPending}
      />

      <QualificationImpactSheet
        errorMessage={impactSheetState.errorMessage}
        impact={impactSheetState.impact}
        loading={impactSheetState.loading}
        mode={impactSheetState.mode}
        onClose={() =>
          setImpactSheetState({
            errorMessage: null,
            impact: null,
            loading: false,
            mode: "view",
            open: false,
          })
        }
        open={impactSheetState.open}
      />

      <ConfirmDialog
        confirmLabel="确认删除"
        description={
          confirmDeleteImpact
            ? `删除后将移除资质“${confirmDeleteImpact.qualification.qualification_name}”。当前没有任何人员或操作引用它。`
            : ""
        }
        isPending={deleteMutation.isPending}
        onCancel={() => setConfirmDeleteImpact(null)}
        onConfirm={() => {
          if (!confirmDeleteImpact) {
            return;
          }
          deleteMutation.mutate(confirmDeleteImpact.qualification.id);
        }}
        open={Boolean(confirmDeleteImpact)}
        title="确认删除资质"
      />

      <ToastStack
        onDismiss={(toastId) =>
          setToasts((current) => current.filter((toast) => toast.id !== toastId))
        }
        toasts={toasts}
      />
    </div>
  );
}

function resolveMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof QualificationDeleteBlockedError) {
    return error.message;
  }

  if (error instanceof ApiError && typeof error.payload === "object" && error.payload) {
    const payload = error.payload as { error?: string; message?: string };
    return payload.message ?? payload.error ?? fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
