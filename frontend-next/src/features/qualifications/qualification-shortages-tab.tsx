"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/design-system/primitives/button";
import { ErrorState } from "@/design-system/primitives/error-state";
import { Loader } from "@/design-system/primitives/loader";
import { StatusBadge } from "@/design-system/primitives/status-badge";
import { FilterBar } from "@/design-system/patterns/filter-bar";
import { OverviewStrip } from "@/design-system/patterns/overview-strip";
import { PageHeader } from "@/design-system/patterns/page-header";
import {
  DataTablePattern,
  type DataTableColumn,
} from "@/design-system/patterns/data-table-pattern";
import { Panel } from "@/design-system/primitives/panel";
import { StatCard } from "@/design-system/patterns/stat-card";
import { SelectInput, TextInput } from "@/design-system/primitives/field";
import type { QualificationShortageMode, QualificationShortageRiskItem } from "./contracts";
import { QualificationShortageMonitoringCharts } from "./qualification-shortage-monitoring-charts";
import {
  buildQualificationRiskKey,
  formatQualificationRiskItemLabel,
  getRiskScorePresentation,
  getShortagePresentation,
  partitionQualificationShortages,
  type QualificationWorkbenchTab,
} from "./presentation";
import {
  getQualificationShortageMonitoring,
  getQualificationShortages,
  qualificationQueryKeys,
} from "./service";
import { QualificationViewTabs } from "./qualification-view-tabs";

function resolveCurrentYearMonth() {
  const currentDate = new Date();
  const month = `${currentDate.getMonth() + 1}`.padStart(2, "0");
  return `${currentDate.getFullYear()}-${month}`;
}

function ScoreBreakdownSummary({
  item,
}: {
  item: QualificationShortageRiskItem;
}) {
  const parts = item.score_breakdown;

  return (
    <div className="space-y-1 text-xs leading-5 text-[var(--pl-text-secondary)]">
      <div>缺口率 {parts.gap_rate}{" -> "}{parts.gap_rate_score}分</div>
      <div>缺口规模 {parts.gap_volume_factor}{" -> "}{parts.gap_volume_score}分</div>
      <div>需求规模 {parts.demand_scale_factor}{" -> "}{parts.demand_scale_score}分</div>
      <div>单人负荷 {parts.load_pressure_factor}{" -> "}{parts.load_pressure_score}分</div>
      <div>覆盖脆弱度 {parts.coverage_fragility}{" -> "}{parts.coverage_fragility_score}分</div>
    </div>
  );
}

export function QualificationShortagesTab({
  activeTab,
  onSelectTab,
}: {
  activeTab: QualificationWorkbenchTab;
  onSelectTab: (tab: QualificationWorkbenchTab) => void;
}) {
  const [mode, setMode] = useState<QualificationShortageMode>("current_month");
  const [yearMonth, setYearMonth] = useState(resolveCurrentYearMonth);
  const [selectedRiskKey, setSelectedRiskKey] = useState<string | null>(null);

  const shortagesQuery = useQuery({
    queryFn: () =>
      getQualificationShortages({
        mode,
        yearMonth: mode === "current_month" ? yearMonth : null,
      }),
    queryKey: qualificationQueryKeys.shortages(
      mode,
      mode === "current_month" ? yearMonth : null,
    ),
  });

  const monitoringQuery = useQuery({
    queryFn: () =>
      getQualificationShortageMonitoring({
        mode,
        months: 6,
        yearMonth,
      }),
    queryKey: qualificationQueryKeys.monitoring(mode, yearMonth, 6),
  });

  const filteredRiskItems = useMemo(() => {
    const items = shortagesQuery.data?.risk_items ?? [];
    if (!selectedRiskKey) {
      return items;
    }

    return items.filter((item) => buildQualificationRiskKey(item) === selectedRiskKey);
  }, [selectedRiskKey, shortagesQuery.data?.risk_items]);

  const partitions = useMemo(
    () => partitionQualificationShortages(filteredRiskItems),
    [filteredRiskItems],
  );

  const columns: DataTableColumn<QualificationShortageRiskItem>[] = [
    {
      key: "qualification",
      header: "风险项",
      className: "min-w-[260px]",
      render: (item) => (
        <div className="space-y-2">
          <div className="font-semibold text-[var(--pl-text-primary)]">
            {formatQualificationRiskItemLabel(item)}
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              label={getShortagePresentation(item).label}
              tone={getShortagePresentation(item).tone}
            />
            <span
              className={[
                "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                getRiskScorePresentation(item.risk_score).badgeClassName,
              ].join(" ")}
            >
              风险分 {item.risk_score}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "gap",
      header: "硬缺口",
      render: (item) => (
        <div className="space-y-1 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <div>峰值缺口 {item.peak_gap_people}</div>
          <div>峰值需求 {item.peak_required_people}</div>
          <div>缺口率 {item.gap_rate}</div>
        </div>
      ),
    },
    {
      key: "load",
      header: "需求压力",
      render: (item) => (
        <div className="space-y-1 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <div>需求工时 {item.demand_hours}h</div>
          <div>需求人次 {item.demand_person_instances}</div>
          <div>单人负荷 {item.demand_hours_per_qualified_employee}h</div>
        </div>
      ),
    },
    {
      key: "coverage",
      header: "供给覆盖",
      render: (item) => (
        <div className="space-y-1 text-sm leading-6 text-[var(--pl-text-secondary)]">
          <div>可覆盖人数 {item.qualified_employee_count}</div>
          <div>活跃批次 {item.active_batch_count}</div>
          <div>活跃操作 {item.active_operation_count}</div>
          <div>覆盖脆弱度 {item.coverage_fragility}</div>
        </div>
      ),
    },
    {
      key: "score",
      header: "评分构成",
      className: "min-w-[260px]",
      render: (item) => <ScoreBreakdownSummary item={item} />,
    },
  ];

  const summary = shortagesQuery.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button onClick={() => onSelectTab("matrix")} variant="secondary">
            打开资质矩阵
          </Button>
        }
        eyebrow="Risk monitoring"
        subtitle="短板分析已切到“资质 + 需求等级”风险项，并采用透明评分体系。图表用于监控当前最危险什么，以及风险是否在持续恶化。"
        title="资质运营台"
      />

      <QualificationViewTabs onChange={onSelectTab} value={activeTab} />

      <OverviewStrip>
        <StatCard
          label="硬短板数量"
          tone="danger"
          value={String(summary?.shortage_count ?? 0)}
        />
        <StatCard
          label="高风险可覆盖数量"
          tone="warning"
          value={String(summary?.high_risk_coverable_count ?? 0)}
        />
        <StatCard
          label="平均风险分"
          tone="accent"
          value={String(summary?.average_risk_score ?? 0)}
        />
        <StatCard
          label="最大风险分"
          tone="danger"
          value={String(summary?.max_risk_score ?? 0)}
        />
      </OverviewStrip>

      <FilterBar className="space-y-4">
        <SelectInput
          label="需求范围"
          onChange={(event) => {
            setSelectedRiskKey(null);
            setMode(event.target.value as QualificationShortageMode);
          }}
          value={mode}
        >
          <option value="current_month">当前月已激活排产</option>
          <option value="all_activated">全部已激活排产</option>
        </SelectInput>
        <TextInput
          label="统计月份"
          onChange={(event) => {
            setSelectedRiskKey(null);
            setYearMonth(event.target.value);
          }}
          type="month"
          value={yearMonth}
        />
        <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[rgba(255,255,255,0.72)] px-4 py-3 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--pl-text-tertiary)]">
                分析说明
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--pl-text-secondary)]">
                风险项按 `资质 + 需求等级` 计算，评分由缺口率、缺口规模、需求规模、单人负荷和覆盖脆弱度共同构成。
              </p>
            </div>
            {selectedRiskKey ? (
              <Button onClick={() => setSelectedRiskKey(null)} size="sm" variant="ghost">
                清除图表筛选
              </Button>
            ) : null}
          </div>
        </div>
      </FilterBar>

      {monitoringQuery.isLoading ? (
        <Panel
          description="正在加载风险监控图表..."
          eyebrow="Monitoring"
          title="图表区"
        >
          <Loader label="正在加载风险监控图表..." />
        </Panel>
      ) : monitoringQuery.isError ? (
        <Panel
          description="监控图表暂时不可用，请重新加载或检查后端状态。"
          eyebrow="Monitoring"
          title="图表区"
        >
          <ErrorState
            action={
              <Button onClick={() => void monitoringQuery.refetch()} size="sm" variant="secondary">
                重新加载
              </Button>
            }
            description="图表接口加载失败。"
            title="Unable to load charts"
          />
        </Panel>
      ) : (
        <QualificationShortageMonitoringCharts
          monitoring={monitoringQuery.data}
          onSelectRisk={setSelectedRiskKey}
          selectedRiskKey={selectedRiskKey}
        />
      )}

      <DataTablePattern
        columns={columns}
        emptyDescription="当前范围内没有形成硬短板的资质等级风险项。"
        emptyTitle="暂无硬短板"
        errorAction={
          <Button onClick={() => void shortagesQuery.refetch()} size="sm" variant="secondary">
            重新加载
          </Button>
        }
        errorDescription="短板风险主表暂时不可用，请重新加载或检查后端状态。"
        getRowKey={(item) => buildQualificationRiskKey(item)}
        isError={shortagesQuery.isError}
        isLoading={shortagesQuery.isLoading}
        loadingLabel="正在加载等级风险项..."
        rows={partitions.shortages}
        title="硬短板"
      />

      <DataTablePattern
        columns={columns}
        emptyDescription="当前范围内没有高风险但尚可覆盖的资质等级风险项。"
        emptyTitle="暂无高风险可覆盖项"
        errorDescription="高风险可覆盖风险项暂时不可用。"
        getRowKey={(item) => `coverable-${buildQualificationRiskKey(item)}`}
        rows={partitions.coverable}
        title="高风险可覆盖"
      />
    </div>
  );
}
