"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/design-system/primitives/button";
import { Loader } from "@/design-system/primitives/loader";
import { Panel } from "@/design-system/primitives/panel";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import { ToastStack, type ToastItem } from "@/design-system/primitives/toast";
import { FilterBar } from "@/design-system/patterns/filter-bar";
import { OverviewStrip } from "@/design-system/patterns/overview-strip";
import { PageHeader } from "@/design-system/patterns/page-header";
import { StatCard } from "@/design-system/patterns/stat-card";
import { SelectInput, TextInput } from "@/design-system/primitives/field";
import { ApiError } from "@/services/http/client";
import type {
  QualificationMatrixAssignment,
  QualificationMatrixEmployee,
  QualificationRecord,
} from "./contracts";
import { QualificationMatrixEditorSheet } from "./qualification-matrix-editor-sheet";
import {
  buildOrganizationDescendantMap,
  flattenOrganizationUnits,
  buildMatrixAssignmentMap,
  getQualificationLevelPresentation,
  type QualificationWorkbenchTab,
} from "./presentation";
import { QualificationViewTabs } from "./qualification-view-tabs";
import {
  createEmployeeQualificationAssignment,
  deleteEmployeeQualificationAssignment,
  getQualificationMatrix,
  getQualificationOrganizationTree,
  getQualificationShortages,
  qualificationQueryKeys,
  updateEmployeeQualificationAssignment,
} from "./service";

type EditorState = {
  assignment: QualificationMatrixAssignment | null;
  employee: QualificationMatrixEmployee | null;
  errorMessage: string | null;
  open: boolean;
  qualification: QualificationRecord | null;
};

const cellButtonClassName =
  "flex h-7 w-full min-w-[42px] items-center justify-center rounded-[10px] border px-1 text-[11px] font-semibold leading-none tracking-[-0.04em] transition-colors";

function buildToast(title: string, tone: ToastItem["tone"], description?: string) {
  return {
    description,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    tone,
  } satisfies ToastItem;
}

function resolveCurrentYearMonth() {
  const currentDate = new Date();
  const month = `${currentDate.getMonth() + 1}`.padStart(2, "0");
  return `${currentDate.getFullYear()}-${month}`;
}

export function QualificationMatrixTab({
  activeTab,
  onSelectTab,
}: {
  activeTab: QualificationWorkbenchTab;
  onSelectTab: (tab: QualificationWorkbenchTab) => void;
}) {
  const queryClient = useQueryClient();
  const matrixScrollerRef = useRef<HTMLDivElement | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState("ALL");
  const [shortageOnly, setShortageOnly] = useState(false);
  const [yearMonth] = useState(resolveCurrentYearMonth);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [editorState, setEditorState] = useState<EditorState>({
    assignment: null,
    employee: null,
    errorMessage: null,
    open: false,
    qualification: null,
  });

  const matrixQuery = useQuery({
    queryFn: getQualificationMatrix,
    queryKey: qualificationQueryKeys.matrix,
  });

  const organizationTreeQuery = useQuery({
    queryFn: getQualificationOrganizationTree,
    queryKey: qualificationQueryKeys.organizationTree,
  });

  const shortagesQuery = useQuery({
    queryFn: () =>
      getQualificationShortages({
        mode: "current_month",
        yearMonth,
      }),
    queryKey: qualificationQueryKeys.shortages("current_month", yearMonth),
  });

  const mutation = useMutation({
    mutationFn: async (payload: {
      assignment: QualificationMatrixAssignment | null;
      qualificationLevel?: number;
      type: "create" | "update" | "delete";
    }) => {
      const { assignment, qualificationLevel, type } = payload;

      if (!editorState.employee || !editorState.qualification) {
        throw new Error("未选择矩阵单元");
      }

      if (type === "create") {
        return createEmployeeQualificationAssignment({
          employee_id: editorState.employee.id,
          qualification_id: editorState.qualification.id,
          qualification_level: qualificationLevel ?? 1,
        });
      }

      if (type === "update" && assignment) {
        return updateEmployeeQualificationAssignment(assignment.id, {
          employee_id: editorState.employee.id,
          qualification_id: editorState.qualification.id,
          qualification_level: qualificationLevel ?? assignment.qualification_level,
        });
      }

      if (type === "delete" && assignment) {
        return deleteEmployeeQualificationAssignment(assignment.id);
      }

      throw new Error("矩阵编辑操作无效");
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qualificationQueryKeys.matrix }),
        queryClient.invalidateQueries({
          queryKey: qualificationQueryKeys.shortages("current_month", yearMonth),
        }),
        queryClient.invalidateQueries({ queryKey: qualificationQueryKeys.overview }),
      ]);

      setEditorState({
        assignment: null,
        employee: null,
        errorMessage: null,
        open: false,
        qualification: null,
      });

      const title =
        variables.type === "delete"
          ? "资质已移除"
          : variables.type === "create"
            ? "资质已添加"
            : "资质等级已更新";

      pushToast(title, "success");
    },
    onError: (error) => {
      setEditorState((current) => ({
        ...current,
        errorMessage: resolveMutationErrorMessage(error, "矩阵编辑失败"),
      }));
    },
  });

  const assignmentMap = useMemo(
    () => buildMatrixAssignmentMap(matrixQuery.data?.assignments ?? []),
    [matrixQuery.data?.assignments],
  );

  const shortageIds = useMemo(
    () =>
      new Set(
        (shortagesQuery.data?.qualification_items ?? [])
          .filter((item) => item.worst_peak_gap_people > 0)
          .map((item) => item.qualification_id),
      ),
    [shortagesQuery.data?.qualification_items],
  );

  const organizationOptions = useMemo(
    () => flattenOrganizationUnits(organizationTreeQuery.data?.units ?? []),
    [organizationTreeQuery.data?.units],
  );

  const descendantMap = useMemo(
    () => buildOrganizationDescendantMap(organizationTreeQuery.data?.units ?? []),
    [organizationTreeQuery.data?.units],
  );

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = employeeSearch.trim().toLowerCase();

    return (matrixQuery.data?.employees ?? []).filter((employee) => {
      if (
        normalizedSearch &&
        !`${employee.employee_name} ${employee.employee_code}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }

      if (unitFilter !== "ALL") {
        const allowedUnitIds = descendantMap.get(Number(unitFilter));
        if (!employee.unit_id || !allowedUnitIds?.has(employee.unit_id)) {
          return false;
        }
      }

      return true;
    });
  }, [descendantMap, employeeSearch, matrixQuery.data?.employees, unitFilter]);

  const filteredQualifications = useMemo(() => {
    return (matrixQuery.data?.qualifications ?? []).filter((qualification) => {
      if (!shortageOnly) {
        return true;
      }

      return shortageIds.has(qualification.id);
    });
  }, [matrixQuery.data?.qualifications, shortageIds, shortageOnly]);

  function pushToast(title: string, tone: ToastItem["tone"], description?: string) {
    const toast = buildToast(title, tone, description);
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 4000);
  }

  function openEditor(employee: QualificationMatrixEmployee, qualification: QualificationRecord) {
    const assignment =
      assignmentMap.get(`${qualification.id}:${employee.id}`) ?? null;

    setEditorState({
      assignment,
      employee,
      errorMessage: null,
      open: true,
      qualification,
    });
  }

  function scrollMatrix(direction: "left" | "right") {
    matrixScrollerRef.current?.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -240 : 240,
    });
  }

  const shortageSummary = shortagesQuery.data?.summary;
  const shortageQualificationCount =
    shortagesQuery.data?.qualification_items.filter(
      (item) => item.worst_peak_gap_people > 0,
    ).length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button onClick={() => onSelectTab("shortages")} variant="secondary">
            查看短板分析
          </Button>
        }
        eyebrow="Integrated workspace"
        subtitle="矩阵视图按员工展开资质覆盖，并允许直接维护员工资质等级。旧版 CRA 的矩阵页面和接口保持原样。"
        title="资质运营台"
      />

      <QualificationViewTabs onChange={onSelectTab} value={activeTab} />

      <OverviewStrip>
        <StatCard
          label="在职员工"
          tone="accent"
          value={String(matrixQuery.data?.employees.length ?? 0)}
        />
        <StatCard
          label="资质条目"
          tone="success"
          value={String(matrixQuery.data?.qualifications.length ?? 0)}
        />
        <StatCard
          label="已赋等级"
          tone="warning"
          value={String(matrixQuery.data?.assignments.length ?? 0)}
        />
        <StatCard
          label="峰值有缺口"
          tone="danger"
          value={String(shortageSummary?.shortage_count ?? 0)}
        />
      </OverviewStrip>

      <FilterBar className="space-y-4">
        <TextInput
          label="搜索员工"
          onChange={(event) => setEmployeeSearch(event.target.value)}
          placeholder="搜索姓名或工号"
          value={employeeSearch}
        />
        <SelectInput
          disabled={organizationTreeQuery.isLoading || organizationTreeQuery.isError}
          hint={
            organizationTreeQuery.isError
              ? "组织树加载失败，暂时无法按层级筛选。"
              : "可选择任意组织节点，自动包含其下级班组与班次。"
          }
          label="组织节点"
          onChange={(event) => setUnitFilter(event.target.value)}
          value={unitFilter}
        >
          <option value="ALL">全部组织</option>
          {organizationOptions.map((unit) => (
            <option key={unit.id} value={String(unit.id)}>
              {unit.label}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          label="矩阵范围"
          onChange={(event) => setShortageOnly(event.target.value === "SHORTAGES")}
          value={shortageOnly ? "SHORTAGES" : "ALL"}
        >
          <option value="ALL">全部资质</option>
          <option value="SHORTAGES">仅看有峰值缺口</option>
        </SelectInput>
        <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
            需求参考
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge
              label={`当前月 ${yearMonth}`}
              tone="accent"
            />
            <StatusBadge
              label={`缺口资质 ${shortageQualificationCount}`}
              tone="danger"
            />
          </div>
        </div>
      </FilterBar>

      <Panel
        description="矩阵按高密度工作台处理，优先提高单屏可见列数。完整员工信息保留在列头提示和编辑侧栏中。"
        eyebrow="Qualification matrix"
        title="资质矩阵"
      >
        {matrixQuery.isLoading || shortagesQuery.isLoading ? (
          <Loader label="正在加载资质矩阵..." />
        ) : matrixQuery.isError || shortagesQuery.isError ? (
          <div className="rounded-[var(--pl-radius-md)] border border-[rgba(180,35,24,0.18)] bg-[var(--pl-danger-soft)] px-4 py-4 text-sm leading-6 text-[var(--pl-danger)]">
            资质矩阵暂时不可用，请重新加载后重试。
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.78)] px-2.5 py-2">
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
                  等级颜色
                </div>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <span
                      className={[
                        "inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                        getQualificationLevelPresentation(level).badgeClassName,
                      ].join(" ")}
                      key={level}
                    >
                      {getQualificationLevelPresentation(level).label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] text-[var(--pl-text-tertiary)]">
                  支持左右滑动查看更多员工列
                </div>
                <Button
                  aria-label="向左浏览员工"
                  onClick={() => scrollMatrix("left")}
                  size="sm"
                  variant="ghost"
                >
                  向左
                </Button>
                <Button
                  aria-label="向右浏览员工"
                  onClick={() => scrollMatrix("right")}
                  size="sm"
                  variant="secondary"
                >
                  向右
                </Button>
              </div>
            </div>

            <div
              className="overflow-x-auto pb-2"
              ref={matrixScrollerRef}
              style={{ touchAction: "pan-x" }}
            >
            <table className="w-max border-separate border-spacing-0">
              <thead>
                <tr className="border-b border-[var(--pl-border)] bg-[var(--pl-surface)]">
                  <th className="sticky left-0 z-10 min-w-[132px] bg-[var(--pl-surface)] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pl-text-tertiary)]">
                    资质摘要
                  </th>
                  {filteredEmployees.map((employee) => (
                    <th
                      className="w-[46px] min-w-[46px] max-w-[46px] px-0.5 py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pl-text-tertiary)]"
                      key={employee.id}
                      scope="col"
                      title={`${employee.employee_name} · ${employee.employee_code}${employee.unit_name ? ` · ${employee.unit_name}` : ""}`}
                    >
                      <div className="flex h-[88px] flex-col items-center justify-between overflow-hidden leading-tight">
                        <div
                          className="line-clamp-3 text-[12px] font-semibold normal-case text-[var(--pl-text-primary)]"
                          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                        >
                          {employee.employee_name}
                        </div>
                        <div className="w-full truncate text-center text-[9px] tracking-[-0.04em]">
                          {employee.employee_code}
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredQualifications.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-10 text-sm text-[var(--pl-text-secondary)]"
                      colSpan={Math.max(1, filteredEmployees.length + 1)}
                    >
                      当前筛选条件下没有可展示的资质矩阵数据。
                    </td>
                  </tr>
                ) : (
                  filteredQualifications.map((qualification, index) => {
                    const shortageItem = shortagesQuery.data?.qualification_items.find(
                      (item) => item.qualification_id === qualification.id,
                    );
                    const worstLevel =
                      shortageItem?.level_breakdown.find(
                        (item) =>
                          item.required_level === shortageItem.worst_required_level,
                      ) ?? shortageItem?.level_breakdown[0];
                    const rowSurfaceClassName =
                      index % 2 === 0
                        ? "bg-[rgba(255,255,255,0.84)]"
                        : "bg-[rgba(244,248,251,0.92)]";

                    return (
                      <tr
                        className={`border-b border-[var(--pl-border)] align-top last:border-b-0 ${rowSurfaceClassName}`}
                        key={qualification.id}
                      >
                        <td
                          className={`sticky left-0 z-10 px-2 py-1.5 ${rowSurfaceClassName}`}
                          title={`${qualification.qualification_name} · 最坏等级 ≥${shortageItem?.worst_required_level ?? 1}级 · 风险分 ${shortageItem?.worst_risk_score ?? 0} · 峰值缺口 ${shortageItem?.worst_peak_gap_people ?? 0} · 需求 ${shortageItem?.demand_hours ?? 0}h`}
                        >
                          <div className="space-y-1">
                            <div>
                              <div className="line-clamp-2 text-[12px] font-semibold leading-4 text-[var(--pl-text-primary)]">
                                {qualification.qualification_name}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px] leading-4">
                              <span className="rounded-full bg-[rgba(11,106,162,0.1)] px-1.5 py-0.5 font-semibold text-[var(--pl-accent-strong)]">
                                ≥{shortageItem?.worst_required_level ?? 1}
                              </span>
                              <span
                                className={[
                                  "rounded-full px-1.5 py-0.5 font-semibold",
                                  shortageItem && shortageItem.worst_peak_gap_people > 0
                                    ? "bg-[rgba(180,35,24,0.1)] text-[var(--pl-danger)]"
                                    : "bg-[rgba(100,116,139,0.1)] text-[var(--pl-text-tertiary)]",
                                ].join(" ")}
                              >
                                缺{shortageItem?.worst_peak_gap_people ?? 0}
                              </span>
                              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-1.5 py-0.5 font-semibold text-[var(--pl-text-secondary)]">
                                {shortageItem?.worst_risk_score ?? 0}分
                              </span>
                              <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-1.5 py-0.5 font-semibold text-[var(--pl-text-secondary)]">
                                {worstLevel?.qualified_employee_count ?? 0}人
                              </span>
                            </div>
                          </div>
                        </td>
                        {filteredEmployees.map((employee) => {
                          const assignment =
                            assignmentMap.get(`${qualification.id}:${employee.id}`) ?? null;
                          const levelPresentation = assignment
                            ? getQualificationLevelPresentation(
                                assignment.qualification_level,
                              )
                            : null;

                          return (
                            <td className="px-0.5 py-1.5" key={employee.id}>
                              <button
                                aria-label={
                                  assignment
                                    ? `${levelPresentation?.label ?? assignment.qualification_level} · ${employee.employee_name} · ${qualification.qualification_name}`
                                    : `未持有 · ${employee.employee_name} · ${qualification.qualification_name}`
                                }
                                className={[
                                  cellButtonClassName,
                                  assignment
                                    ? levelPresentation?.solidClassName
                                    : "border-[var(--pl-border)] bg-[var(--pl-surface)] text-[var(--pl-text-tertiary)] hover:border-[var(--pl-accent)] hover:text-[var(--pl-accent)]",
                                ].join(" ")}
                                onClick={() => openEditor(employee, qualification)}
                                title={
                                  assignment
                                    ? `${employee.employee_name} · ${qualification.qualification_name} · ${levelPresentation?.label}`
                                    : `${employee.employee_name} · ${qualification.qualification_name} · 未持有`
                                }
                                type="button"
                              >
                                {assignment ? assignment.qualification_level : "空"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </Panel>

      <QualificationMatrixEditorSheet
        assignment={editorState.assignment}
        employee={editorState.employee}
        errorMessage={editorState.errorMessage}
        key={
          editorState.open && editorState.employee && editorState.qualification
            ? `${editorState.employee.id}-${editorState.qualification.id}-${editorState.assignment?.id ?? "new"}`
            : "closed"
        }
        onClose={() =>
          setEditorState({
            assignment: null,
            employee: null,
            errorMessage: null,
            open: false,
            qualification: null,
          })
        }
        onCreate={(qualificationLevel) =>
          mutation.mutate({
            assignment: null,
            qualificationLevel,
            type: "create",
          })
        }
        onDelete={() =>
          mutation.mutate({
            assignment: editorState.assignment,
            type: "delete",
          })
        }
        onUpdate={(qualificationLevel) =>
          mutation.mutate({
            assignment: editorState.assignment,
            qualificationLevel,
            type: "update",
          })
        }
        open={editorState.open}
        pending={mutation.isPending}
        qualification={editorState.qualification}
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
  if (error instanceof ApiError && typeof error.payload === "object" && error.payload) {
    const payload = error.payload as { error?: string; message?: string };
    return payload.message ?? payload.error ?? fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}
