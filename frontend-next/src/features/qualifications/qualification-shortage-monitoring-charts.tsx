"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/design-system/primitives/empty-state";
import { Panel } from "@/design-system/primitives/panel";
import type {
  QualificationShortageMonitoringResponse,
  QualificationShortageRiskItem,
} from "./contracts";
import {
  buildQualificationRiskKey,
  formatQualificationRiskItemLabel,
  getRiskScoreColor,
} from "./presentation";

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, unknown> }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const datum = payload[0]?.payload;
  if (!datum) {
    return null;
  }

  return (
    <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-3 text-xs leading-5 text-[var(--pl-text-secondary)] shadow-[var(--pl-shadow-soft)]">
      <div className="font-semibold text-[var(--pl-text-primary)]">
        {String(datum.label ?? datum.qualification_name ?? "风险项")}
      </div>
      {"risk_score" in datum ? <div>风险分 {String(datum.risk_score)}</div> : null}
      {"peak_gap_people" in datum ? <div>峰值缺口 {String(datum.peak_gap_people)}</div> : null}
      {"gap_rate" in datum ? <div>缺口率 {String(datum.gap_rate)}</div> : null}
      {"demand_hours" in datum ? <div>需求工时 {String(datum.demand_hours)}h</div> : null}
      {"demand_hours_per_qualified_employee" in datum ? (
        <div>单人负荷 {String(datum.demand_hours_per_qualified_employee)}h</div>
      ) : null}
      {"coverage_fragility" in datum ? (
        <div>覆盖脆弱度 {String(datum.coverage_fragility)}</div>
      ) : null}
    </div>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ name?: string; value?: number | string }>;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-[var(--pl-radius-md)] border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 py-3 text-xs leading-5 text-[var(--pl-text-secondary)] shadow-[var(--pl-shadow-soft)]">
      <div className="font-semibold text-[var(--pl-text-primary)]">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name}>
          {entry.name} {String(entry.value)}
        </div>
      ))}
    </div>
  );
}

function MonitoringEmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center">
      <EmptyState
        description="当前范围没有足够的资质风险数据来绘制图表。"
        title={title}
      />
    </div>
  );
}

function buildRankingData(items: QualificationShortageRiskItem[]) {
  return items.slice(0, 10).map((item) => ({
    ...item,
    label: formatQualificationRiskItemLabel(item),
    risk_key: buildQualificationRiskKey(item),
  }));
}

export function QualificationShortageMonitoringCharts({
  monitoring,
  onSelectRisk,
  selectedRiskKey,
}: {
  monitoring: QualificationShortageMonitoringResponse | undefined;
  onSelectRisk: (riskKey: string | null) => void;
  selectedRiskKey: string | null;
}) {
  const rankingData = buildRankingData(monitoring?.ranking ?? []);
  const comparisonData = rankingData;
  const trendData = monitoring?.trend ?? [];
  const heatmapQualifications = Array.from(
    new Map(
      (monitoring?.heatmap ?? []).map((cell) => [
        `${cell.qualification_rank}:${cell.qualification_id}`,
        {
          qualification_id: cell.qualification_id,
          qualification_name: cell.qualification_name,
          qualification_rank: cell.qualification_rank,
        },
      ]),
    ).values(),
  ).sort((left, right) => left.qualification_rank - right.qualification_rank);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel
        description="Top 10 风险项直接按 0-100 风险分排序，优先暴露当前最需要处理的资质等级短板。"
        eyebrow="Risk ranking"
        title="风险分排行"
      >
        {rankingData.length === 0 ? (
          <MonitoringEmptyState title="暂无风险排行" />
        ) : (
          <div className="overflow-x-auto">
            <BarChart data={rankingData} height={Math.max(320, rankingData.length * 42)} layout="vertical" width={920}>
              <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.18)" />
              <XAxis domain={[0, 100]} tick={{ fontSize: 11 }} type="number" />
              <YAxis dataKey="label" tick={{ fontSize: 11 }} type="category" width={220} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(11,106,162,0.06)" }} />
              <Bar
                cursor="pointer"
                dataKey="risk_score"
                fill="#0b6aa2"
                onClick={(data) => {
                  const payload = (data as { payload?: { risk_key?: string } })?.payload;
                  if (payload?.risk_key) {
                    onSelectRisk(payload.risk_key);
                  }
                }}
                radius={[0, 10, 10, 0]}
              >
                {rankingData.map((entry) => (
                  <Cell
                    fill={getRiskScoreColor(entry.risk_score)}
                    key={entry.risk_key}
                    stroke={selectedRiskKey === entry.risk_key ? "#0f172a" : "transparent"}
                    strokeWidth={selectedRiskKey === entry.risk_key ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </div>
        )}
      </Panel>

      <Panel
        description="横向比较峰值需求人数与当前可覆盖人数，帮助区分是高等级供给太薄，还是需求并发过高。"
        eyebrow="Supply vs demand"
        title="需求/供给对比"
      >
        {comparisonData.length === 0 ? (
          <MonitoringEmptyState title="暂无供需对比" />
        ) : (
          <div className="overflow-x-auto">
            <BarChart data={comparisonData} height={Math.max(320, comparisonData.length * 42)} layout="vertical" width={920}>
              <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.18)" />
              <XAxis tick={{ fontSize: 11 }} type="number" />
              <YAxis dataKey="label" tick={{ fontSize: 11 }} type="category" width={220} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(11,106,162,0.06)" }} />
              <Legend />
              <Bar
                cursor="pointer"
                dataKey="peak_required_people"
                fill="#d97706"
                name="峰值需求人数"
                onClick={(data) => {
                  const payload = (data as { payload?: { risk_key?: string } })?.payload;
                  if (payload?.risk_key) {
                    onSelectRisk(payload.risk_key);
                  }
                }}
                radius={[0, 8, 8, 0]}
              />
              <Bar
                cursor="pointer"
                dataKey="qualified_employee_count"
                fill="#0b6aa2"
                name="可覆盖人数"
                onClick={(data) => {
                  const payload = (data as { payload?: { risk_key?: string } })?.payload;
                  if (payload?.risk_key) {
                    onSelectRisk(payload.risk_key);
                  }
                }}
                radius={[0, 8, 8, 0]}
              />
            </BarChart>
          </div>
        )}
      </Panel>

      <Panel
        description="热力图把 Top 资质在 1-5 级上的风险强度压到同一视图里，便于管理层识别高等级能力带来的脆弱点。"
        eyebrow="Level heatmap"
        title="等级风险热力图"
      >
        {heatmapQualifications.length === 0 ? (
          <MonitoringEmptyState title="暂无等级热力图" />
        ) : (
          <div className="space-y-2 overflow-x-auto">
            <div
              className="grid min-w-[720px] gap-2"
              style={{ gridTemplateColumns: "180px repeat(5, minmax(0, 1fr))" }}
            >
              <div />
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--pl-text-tertiary)]"
                  key={level}
                >
                  ≥{level}级
                </div>
              ))}
              {heatmapQualifications.map((qualification) => (
                <div
                  className="contents"
                  key={`${qualification.qualification_rank}:${qualification.qualification_id}`}
                >
                  <div className="pr-3 text-sm font-semibold text-[var(--pl-text-primary)]">
                    {qualification.qualification_name}
                  </div>
                  {[1, 2, 3, 4, 5].map((level) => {
                    const cell = monitoring?.heatmap.find(
                      (item) =>
                        item.qualification_id === qualification.qualification_id &&
                        item.required_level === level,
                    );
                    const riskScore = cell?.risk_score ?? null;
                    const riskKey =
                      riskScore !== null && cell
                        ? `${cell.qualification_id}:${cell.required_level}`
                        : null;
                    const selected = riskKey !== null && riskKey === selectedRiskKey;

                    return (
                      <button
                        className={[
                          "min-h-[58px] rounded-[14px] border px-2 py-2 text-left text-xs transition-colors",
                          cell?.risk_score === null
                            ? "border-[var(--pl-border)] bg-[rgba(148,163,184,0.06)] text-[var(--pl-text-tertiary)]"
                            : "text-white shadow-[var(--pl-shadow-soft)]",
                          selected ? "ring-2 ring-[var(--pl-text-primary)]" : "",
                        ].join(" ")}
                        disabled={riskKey === null}
                        key={`${qualification.qualification_id}:${level}`}
                        onClick={() => onSelectRisk(riskKey)}
                        style={{
                          backgroundColor:
                            riskScore === null
                              ? undefined
                              : getRiskScoreColor(riskScore),
                        }}
                        title={
                          riskScore === null
                            ? `${qualification.qualification_name} ≥${level}级暂无需求`
                            : `${qualification.qualification_name} ≥${level}级 · 风险分 ${riskScore} · 峰值缺口 ${cell?.peak_gap_people ?? 0} · 需求 ${cell?.demand_hours ?? 0}h`
                        }
                        type="button"
                      >
                        {riskScore === null ? (
                          <div className="text-center font-semibold">-</div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-base font-semibold">{riskScore}</div>
                            <div className="text-[10px] uppercase tracking-[0.08em] opacity-85">
                              缺{cell?.peak_gap_people ?? 0} · {cell?.demand_hours ?? 0}h
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel
        description="近 6 个月趋势使用同一评分模型回放，帮助管理层判断风险是在改善还是恶化。"
        eyebrow="Monthly trend"
        title="月度趋势"
      >
        {trendData.length === 0 ? (
          <MonitoringEmptyState title="暂无趋势数据" />
        ) : (
          <div className="overflow-x-auto">
            <LineChart data={trendData} height={320} width={920}>
              <CartesianGrid stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} yAxisId="left" />
              <YAxis orientation="right" tick={{ fontSize: 11 }} yAxisId="right" />
              <Tooltip content={<TrendTooltip />} />
              <Legend />
              <Line
                dataKey="shortage_count"
                dot={false}
                name="硬短板数量"
                stroke="#b42318"
                strokeWidth={2}
                type="monotone"
                yAxisId="left"
              />
              <Line
                dataKey="high_risk_coverable_count"
                dot={false}
                name="高风险可覆盖数量"
                stroke="#d97706"
                strokeWidth={2}
                type="monotone"
                yAxisId="left"
              />
              <Line
                dataKey="average_risk_score"
                dot={false}
                name="平均风险分"
                stroke="#0b6aa2"
                strokeWidth={2}
                type="monotone"
                yAxisId="left"
              />
              <Line
                dataKey="total_demand_hours"
                dot={false}
                name="总需求工时"
                stroke="#0f766e"
                strokeWidth={2}
                type="monotone"
                yAxisId="right"
              />
            </LineChart>
          </div>
        )}
      </Panel>
    </div>
  );
}
