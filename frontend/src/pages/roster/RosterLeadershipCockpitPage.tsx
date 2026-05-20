import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import {
  WxbAlert,
  WxbButton,
  WxbCard,
  WxbCollapse,
  WxbDataTable,
  WxbDivider,
  WxbEmpty,
  WxbGauge,
  WxbIcon,
  WxbInput,
  WxbKpiCard,
  WxbPageGrid,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbProgress,
  WxbSegmented,
  WxbSparkline,
  WxbSpinner,
  WxbTag,
  WxbTooltip,
} from '../../components/wxb-ui';
import {
  KeyPersonDependency,
  QualificationRiskItem,
  RiskLevel,
  RosterLeadershipCockpitSnapshot,
} from './rosterLeadershipCockpitModel';
import { loadRosterLeadershipCockpit } from './rosterLeadershipCockpitService';
import './RosterLeadershipCockpitPage.css';

type TrendKey = keyof Pick<
  RosterLeadershipCockpitSnapshot['workforceTrend'][number],
  'taskRequiredPeople' | 'rosteredPeople' | 'qualifiedAvailablePeople' | 'flexiblePeople' | 'gapPeople'
> | keyof Pick<
  RosterLeadershipCockpitSnapshot['hourTrend'][number],
  'taskDemandHours' | 'rosterProvidedHours' | 'qualifiedAvailableHours' | 'assignedHours' | 'flexibleHours' | 'overtimeRiskHours'
>;

interface TrendSeries {
  key: TrendKey;
  label: string;
  color: string;
}

interface TrendChartProps<T extends Record<string, string | number>> {
  data: T[];
  series: TrendSeries[];
  unit: string;
}

const windowOptions = [
  { label: '本季度', value: 'CURRENT_QUARTER' },
  { label: '下季度', value: 'NEXT_QUARTER' },
  { label: '今年', value: 'CURRENT_YEAR' },
  { label: '未来一年', value: 'ROLLING_YEAR' },
  { label: '自定义', value: 'CUSTOM' },
];

type WindowPreset = 'CURRENT_QUARTER' | 'NEXT_QUARTER' | 'CURRENT_YEAR' | 'ROLLING_YEAR' | 'CUSTOM';

const toDateValue = (value: Dayjs) => value.format('YYYY-MM-DD');

const daysInclusive = (start: Dayjs, end: Dayjs) => (
  Math.max(1, end.startOf('day').diff(start.startOf('day'), 'day') + 1)
);

const getQuarterBounds = (base: Dayjs, offset = 0) => {
  const quarterStartMonth = Math.floor(base.month() / 3) * 3;
  const quarterStart = base.month(quarterStartMonth).startOf('month').add(offset * 3, 'month');
  return {
    end: quarterStart.add(3, 'month').subtract(1, 'day'),
    start: quarterStart,
  };
};

const buildWindowSelection = (
  preset: WindowPreset,
  customStart: string,
  customEnd: string,
) => {
  const today = dayjs().startOf('day');
  if (preset === 'CURRENT_QUARTER') {
    const quarter = getQuarterBounds(today);
    const start = today.isAfter(quarter.start) ? today : quarter.start;
    return { days: daysInclusive(start, quarter.end), end: toDateValue(quarter.end), start: toDateValue(start) };
  }
  if (preset === 'NEXT_QUARTER') {
    const quarter = getQuarterBounds(today, 1);
    return { days: daysInclusive(quarter.start, quarter.end), end: toDateValue(quarter.end), start: toDateValue(quarter.start) };
  }
  if (preset === 'CURRENT_YEAR') {
    const end = today.endOf('year').startOf('day');
    return { days: daysInclusive(today, end), end: toDateValue(end), start: toDateValue(today) };
  }
  if (preset === 'CUSTOM') {
    const start = dayjs(customStart).isValid() ? dayjs(customStart).startOf('day') : today;
    const rawEnd = dayjs(customEnd).isValid() ? dayjs(customEnd).startOf('day') : start;
    const end = rawEnd.isBefore(start) ? start : rawEnd;
    return { days: daysInclusive(start, end), end: toDateValue(end), start: toDateValue(start) };
  }

  const end = today.add(1, 'year').subtract(1, 'day');
  return { days: daysInclusive(today, end), end: toDateValue(end), start: toDateValue(today) };
};

const getCustomMaxEnd = (start: string) => {
  const startAt = dayjs(start).isValid() ? dayjs(start).startOf('day') : dayjs().startOf('day');
  return startAt.add(365, 'day').format('YYYY-MM-DD');
};

const normalizeCustomEnd = (start: string, end: string) => {
  const startAt = dayjs(start).isValid() ? dayjs(start).startOf('day') : dayjs().startOf('day');
  const endAt = dayjs(end).isValid() ? dayjs(end).startOf('day') : startAt;
  const maxEnd = startAt.add(365, 'day');

  if (endAt.isBefore(startAt)) return toDateValue(startAt);
  if (endAt.isAfter(maxEnd)) return toDateValue(maxEnd);
  return toDateValue(endAt);
};

const riskTagColor: Record<RiskLevel, React.ComponentProps<typeof WxbTag>['color']> = {
  BOTTLENECK: 'red',
  CRITICAL: 'red',
  LOW: 'green',
  WATCH: 'amber',
};

const riskLabel: Record<RiskLevel, string> = {
  BOTTLENECK: 'BOTTLENECK',
  CRITICAL: 'CRITICAL',
  LOW: 'LOW',
  WATCH: 'WATCH',
};

const sourceLabel = {
  LIVE_READONLY: { color: 'green' as const, label: 'LIVE_READONLY' },
  MOCK_FALLBACK: { color: 'amber' as const, label: 'MOCK_FALLBACK' },
};

const quadrantDescriptions: Record<QualificationRiskItem['quadrant'], string> = {
  '高需求 / 低脆弱': '常用能力，但供给深度足够，不一定需要立即升级。',
  '高需求 / 高脆弱': '真正瓶颈，计划中容易卡住，需要管理动作。',
  '低需求 / 低脆弱': '安全能力，保持常规维护即可。',
  '低需求 / 高脆弱': '潜在风险，低频但一旦出现任务就缺少替补。',
};

const TrendChart = <T extends Record<string, string | number>>({
  data,
  series,
  unit,
}: TrendChartProps<T>) => {
  const width = 760;
  const height = 260;
  const padding = { bottom: 42, left: 44, right: 24, top: 16 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key] ?? 0)));
  const max = Math.max(1, ...values);
  const labelInterval = data.length > 18 ? Math.ceil(data.length / 12) : 1;

  const pathFor = (key: TrendKey) => data.map((point, index) => {
    const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth);
    const y = padding.top + chartHeight - (Number(point[key] ?? 0) / max) * chartHeight;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div className="roster-cockpit-trend-chart">
      <div className="roster-cockpit-chart-legend">
        {series.map((item) => (
          <span className="roster-cockpit-legend-item" key={item.key}>
            <span className="roster-cockpit-legend-swatch" style={{ color: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg aria-hidden="true" viewBox={`0 0 ${width} ${height}`} role="img">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
          const y = padding.top + chartHeight - fraction * chartHeight;
          return (
            <g key={fraction}>
              <line className="roster-cockpit-chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="roster-cockpit-chart-axis" x={padding.left - 10} y={y + 4} textAnchor="end">
                {Math.round(max * fraction)}
              </text>
            </g>
          );
        })}
        {series.map((item) => (
          <path
            className="roster-cockpit-chart-line"
            d={pathFor(item.key)}
            key={item.key}
            stroke={item.color}
          />
        ))}
        {data.map((point, index) => {
          const shouldShowLabel = index === 0 || index === data.length - 1 || index % labelInterval === 0;
          if (!shouldShowLabel) return null;
          const x = padding.left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * chartWidth);
          return (
            <text className="roster-cockpit-chart-axis" key={String(point.date)} textAnchor="middle" x={x} y={height - 12}>
              {String(point.label)}
            </text>
          );
        })}
        <text className="roster-cockpit-chart-unit" x={width - padding.right} y={padding.top + 2} textAnchor="end">
          {unit}
        </text>
      </svg>
    </div>
  );
};

const RiskBadge: React.FC<{ level: RiskLevel }> = ({ level }) => (
  <WxbTag color={riskTagColor[level]}>{riskLabel[level]}</WxbTag>
);

const MetricMini: React.FC<{ label: string; value: React.ReactNode; caption?: React.ReactNode }> = ({
  caption,
  label,
  value,
}) => (
  <div className="roster-cockpit-mini-metric">
    <span className="roster-cockpit-mini-label">{label}</span>
    <span className="roster-cockpit-mini-value">{value}</span>
    {caption ? <span className="roster-cockpit-mini-caption">{caption}</span> : null}
  </div>
);

const RosterLeadershipCockpitPage: React.FC = () => {
  const [windowPreset, setWindowPreset] = useState<WindowPreset>('ROLLING_YEAR');
  const [customStart, setCustomStart] = useState(() => dayjs().startOf('day').format('YYYY-MM-DD'));
  const [customEnd, setCustomEnd] = useState(() => dayjs().add(1, 'year').subtract(1, 'day').format('YYYY-MM-DD'));
  const [snapshot, setSnapshot] = useState<RosterLeadershipCockpitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedWindow = useMemo(
    () => buildWindowSelection(windowPreset, customStart, customEnd),
    [customEnd, customStart, windowPreset],
  );

  const loadData = useCallback(async (window: { days: number; start: string }) => {
    setLoading(true);
    const result = await loadRosterLeadershipCockpit(window.days, window.start);
    setSnapshot(result);
    setLoading(false);
  }, []);

  const handleCustomStartChange = useCallback((value: string) => {
    setCustomStart(value);
    setCustomEnd((currentEnd) => normalizeCustomEnd(value, currentEnd));
  }, []);

  const handleCustomEndChange = useCallback((value: string) => {
    setCustomEnd(normalizeCustomEnd(customStart, value));
  }, [customStart]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadRosterLeadershipCockpit(selectedWindow.days, selectedWindow.start).then((result) => {
      if (!mounted) return;
      setSnapshot(result);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [selectedWindow.days, selectedWindow.start]);

  const keyPeopleColumns: ColumnsType<KeyPersonDependency> = useMemo(() => [
    {
      key: 'employee',
      title: '人员',
      render: (_, item) => (
        <div className="roster-cockpit-person-cell">
          <span className="roster-cockpit-person-name">{item.employeeName}</span>
          <span className="roster-cockpit-person-code">{item.employeeCode}</span>
        </div>
      ),
    },
    {
      dataIndex: 'criticalTaskHours',
      key: 'criticalTaskHours',
      title: '关键任务工时',
      width: 130,
      render: (value) => `${value}h`,
    },
    {
      key: 'qualifications',
      title: '关联瓶颈资质',
      render: (_, item) => (
        <div className="roster-cockpit-tag-row">
          {item.bottleneckQualifications.map((name) => (
            <WxbTag color="red" key={name}>{name}</WxbTag>
          ))}
        </div>
      ),
    },
    {
      key: 'impact',
      title: '缺勤影响',
      width: 170,
      render: (_, item) => `${item.affectedTaskCount} 个任务 / ${item.affectedSupplyCount} 项资质供给`,
    },
    {
      dataIndex: 'action',
      key: 'action',
      title: '建议动作',
    },
  ], []);

  if (loading && !snapshot) {
    return (
      <WxbPageShell size="full" gap="lg" className="roster-cockpit-page">
        <div className="roster-cockpit-loading">
          <WxbSpinner size={28} tip="加载工厂人力韧性驾驶舱" />
        </div>
      </WxbPageShell>
    );
  }

  if (!snapshot) {
    return (
      <WxbPageShell size="full" gap="lg" className="roster-cockpit-page">
        <WxbEmpty description="暂时无法生成看板" />
      </WxbPageShell>
    );
  }

  const source = sourceLabel[snapshot.dataMode];
  const topQualification = snapshot.qualifications[0];
  const sparkline = snapshot.workforceTrend.map((item) => item.gapPeople);
  const scoreStatus = snapshot.summary.readinessScore >= 80
    ? 'success'
    : snapshot.summary.readinessScore >= 60
      ? 'warning'
      : 'error';

  const qualificationCollapseItems = snapshot.qualifications.slice(0, 8).map((item) => ({
    children: (
      <div className="roster-cockpit-qualification-detail">
        <div className="roster-cockpit-detail-metrics">
          <MetricMini label="需求次数" value={item.demandCount} />
          <MetricMini label="需求工时" value={`${item.demandHours}h`} />
          <MetricMini label="峰值并发" value={`${item.peakConcurrentDemand} 人`} />
          <MetricMini label="峰值可用合格人员" value={`${item.peakQualifiedAvailable} 人`} />
          <MetricMini label="候选人深度" value={item.candidateCoverageDepth} />
          <MetricMini label="低覆盖任务" value={item.lowCoverageTaskCount} />
          <MetricMini label="单人缺勤敏感性" value={`${Math.round(item.absenceSensitivity * 100)}%`} />
          <MetricMini label="热门资质竞争" value={item.competingHotSkillCount} />
        </div>
        <div className="roster-cockpit-reason-grid">
          <div>
            <div className="roster-cockpit-subtitle">为什么是这个等级</div>
            <ul className="roster-cockpit-reason-list">
              {item.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="roster-cockpit-subtitle">影响任务</div>
            <div className="roster-cockpit-tag-row">
              {item.affectedTasks.map((task) => (
                <WxbTag color="blue" key={task}>{task}</WxbTag>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    key: String(item.id),
    label: (
      <div className="roster-cockpit-collapse-label">
        <span className="roster-cockpit-qualification-title">
          <RiskBadge level={item.riskLevel} />
          <span>{item.name}</span>
        </span>
        <span className="roster-cockpit-collapse-meta">
          Risk {item.riskScore}/100 · 深度 {item.candidateCoverageDepth} · 峰值 {item.peakConcurrentDemand}
        </span>
      </div>
    ),
  }));

  return (
    <WxbPageShell size="full" gap="lg" className="roster-cockpit-page">
      <WxbPageHeader
        eyebrow="Roster Leadership Cockpit"
        title="工厂人力韧性驾驶舱"
        description={`Read-only，不会自动修改排班。窗口：${snapshot.windowStart} 至 ${snapshot.windowEnd}`}
        meta={(
          <div className="roster-cockpit-header-tags">
            <WxbTag color={source.color}>{source.label}</WxbTag>
            <WxbTag color="neutral">Generated {snapshot.generatedAt}</WxbTag>
          </div>
        )}
        actions={(
          <div className="roster-cockpit-actions">
            <WxbSegmented
              options={windowOptions}
              value={windowPreset}
              onChange={(value) => setWindowPreset(value as WindowPreset)}
              size="sm"
            />
            {windowPreset === 'CUSTOM' ? (
              <div className="roster-cockpit-custom-range">
                <WxbInput
                  aria-label="自定义开始日期"
                  type="date"
                  value={customStart}
                  onChange={(event) => handleCustomStartChange(event.currentTarget.value)}
                  onInput={(event) => handleCustomStartChange(event.currentTarget.value)}
                />
                <span>至</span>
                <WxbInput
                  aria-label="自定义结束日期"
                  max={getCustomMaxEnd(customStart)}
                  min={customStart}
                  type="date"
                  value={customEnd}
                  onChange={(event) => handleCustomEndChange(event.currentTarget.value)}
                  onInput={(event) => handleCustomEndChange(event.currentTarget.value)}
                />
                <span className="roster-cockpit-custom-range-hint">最长一年</span>
              </div>
            ) : null}
            <WxbTooltip title="重新读取只读数据">
              <WxbButton
                aria-label="刷新看板"
                disabled={loading}
                onClick={() => loadData(selectedWindow)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <span className="roster-cockpit-button-icon">
                  <WxbIcon name="hold-time" size={16} />
                </span>
                Refresh
              </WxbButton>
            </WxbTooltip>
          </div>
        )}
      />

      {snapshot.dataQualityWarnings.length > 0 ? (
        <WxbAlert title="Data Quality Warning">
          <div className="roster-cockpit-data-warning">
            <div className="roster-cockpit-tag-row">
              {snapshot.dataMode === 'MOCK_FALLBACK' ? <WxbTag color="amber">MOCK_FALLBACK</WxbTag> : null}
              <WxbTag color="amber">DATA GAP</WxbTag>
            </div>
            <ul>
              {snapshot.dataQualityWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </WxbAlert>
      ) : null}

      <WxbPageSection
        title="领导层总览"
        description="Roster Readiness Score 聚合人力、工时、资质瓶颈、人员依赖和异常韧性。"
        variant="plain"
      >
        <div className="roster-cockpit-overview">
          <WxbCard className="roster-cockpit-score-card">
            <div className="roster-cockpit-score-copy">
              <span className="roster-cockpit-section-eyebrow">Roster Readiness Score</span>
              <strong>{snapshot.summary.readinessScore}</strong>
              <span>分数越低，说明未来窗口越需要主管提前介入。</span>
            </div>
            <WxbGauge
              color={`var(--wx-${scoreStatus === 'success' ? 'green' : scoreStatus === 'warning' ? 'amber' : 'red'}-500)`}
              label="Readiness"
              percent={snapshot.summary.readinessScore}
              size={156}
            />
          </WxbCard>
          <div className="roster-cockpit-kpi-grid">
            <WxbKpiCard title="最大人力缺口" value={snapshot.summary.maxPeopleGap} unit="人" trend="neutral" trendText="peak gap">
              <WxbSparkline color="var(--wx-red-500)" data={sparkline} />
            </WxbKpiCard>
            <WxbKpiCard title="最大工时缺口" value={snapshot.summary.maxHourGap} unit="h" trend="neutral" trendText="qualified hours" />
            <WxbKpiCard title="Critical 资质数量" value={snapshot.summary.criticalQualificationCount} trend={snapshot.summary.criticalQualificationCount > 0 ? 'down' : 'neutral'} trendText="must act" />
            <WxbKpiCard title="Watch 资质数量" value={snapshot.summary.watchQualificationCount} trend="neutral" trendText="monitor" />
            <WxbKpiCard title="异常敏感资质数量" value={snapshot.summary.absenceSensitiveQualificationCount} trend="neutral" trendText="one-person absence" />
            <WxbKpiCard title="高依赖人员数量" value={snapshot.summary.highDependencyPeopleCount} trend="neutral" trendText="plan dependency" />
            <WxbKpiCard title="需要主管关注的问题" value={snapshot.summary.supervisorIssueCount} trend={snapshot.summary.supervisorIssueCount > 0 ? 'down' : 'neutral'} trendText="supervisor action" />
          </div>
        </div>
      </WxbPageSection>

      <WxbPageSection title="管理层洞察" description="面向工厂领导层的自动摘要，不展示技术日志。">
        <div className="roster-cockpit-insight-grid">
          {snapshot.insights.map((insight, index) => (
            <WxbCard className="roster-cockpit-insight-card" key={insight}>
              <span className="roster-cockpit-insight-index">{String(index + 1).padStart(2, '0')}</span>
              <p>{insight}</p>
            </WxbCard>
          ))}
        </div>
      </WxbPageSection>

      <WxbPageGrid minItemWidth="520px" gap="lg" mode="auto-fit">
        <WxbPageSection
          title="人力供需趋势"
          description="区分任务需求、在岗人数、合格可用人数、可调配人数和缺口。"
          variant="framed"
        >
          <TrendChart
            data={snapshot.workforceTrend as unknown as Record<string, string | number>[]}
            series={[
              { color: 'var(--wx-blue-700)', key: 'taskRequiredPeople', label: '计划任务需要人数' },
              { color: 'var(--wx-green-500)', key: 'rosteredPeople', label: '已排班在岗人数' },
              { color: 'var(--wx-blue-400)', key: 'qualifiedAvailablePeople', label: '具备所需资质的可用人数' },
              { color: 'var(--wx-fg-3)', key: 'flexiblePeople', label: '未被其他任务占用的可调配人数' },
              { color: 'var(--wx-red-500)', key: 'gapPeople', label: '缺口人数' },
            ]}
            unit="people"
          />
        </WxbPageSection>
        <WxbPageSection
          title="工时供需趋势"
          description="区分需求工时、班表工时、合格工时、已分配工时和潜在加班风险。"
          variant="framed"
        >
          <TrendChart
            data={snapshot.hourTrend as unknown as Record<string, string | number>[]}
            series={[
              { color: 'var(--wx-blue-700)', key: 'taskDemandHours', label: '任务需求工时' },
              { color: 'var(--wx-green-500)', key: 'rosterProvidedHours', label: '班表提供工时' },
              { color: 'var(--wx-blue-400)', key: 'qualifiedAvailableHours', label: '合格人员可用工时' },
              { color: 'var(--wx-fg-3)', key: 'assignedHours', label: '已分配工时' },
              { color: 'var(--wx-amber-500)', key: 'overtimeRiskHours', label: '潜在加班风险工时' },
            ]}
            unit="hours"
          />
        </WxbPageSection>
      </WxbPageGrid>

      <WxbPageSection
        title="资质瓶颈分析"
        description="瓶颈不是“持证人数少”，而是“真实计划中容易卡住”。"
        variant="plain"
      >
        <div className="roster-cockpit-bottleneck-layout">
          <WxbCard className="roster-cockpit-focus-card">
            <span className="roster-cockpit-section-eyebrow">Highest Risk Qualification</span>
            {topQualification ? (
              <>
                <div className="roster-cockpit-focus-title">
                  <RiskBadge level={topQualification.riskLevel} />
                  <strong>{topQualification.name}</strong>
                </div>
                <WxbProgress
                  percent={topQualification.riskScore}
                  status={topQualification.riskLevel === 'CRITICAL' ? 'error' : 'warning'}
                  label={`${topQualification.riskScore}/100`}
                />
                <p>{topQualification.reasons[0]}</p>
              </>
            ) : (
              <WxbEmpty description="当前窗口没有资质需求" />
            )}
          </WxbCard>
          <div className="roster-cockpit-collapse-panel">
            <WxbCollapse
              defaultActiveKeys={qualificationCollapseItems[0] ? [qualificationCollapseItems[0].key] : []}
              items={qualificationCollapseItems}
            />
          </div>
        </div>
      </WxbPageSection>

      <WxbPageSection
        title="资质四象限"
        description="帮助领导判断哪些能力是真正瓶颈，哪些只是高频常用。"
        variant="plain"
      >
        <div className="roster-cockpit-quadrant-grid">
          {Object.entries(snapshot.quadrantGroups).map(([quadrant, items]) => (
            <WxbCard className="roster-cockpit-quadrant-card" key={quadrant}>
              <div className="roster-cockpit-quadrant-header">
                <strong>{quadrant}</strong>
                <WxbTag color={quadrant.includes('高脆弱') ? 'red' : 'green'}>{items.length}</WxbTag>
              </div>
              <p>{quadrantDescriptions[quadrant as QualificationRiskItem['quadrant']]}</p>
              <div className="roster-cockpit-quadrant-items">
                {items.slice(0, 5).map((item) => (
                  <span className="roster-cockpit-quadrant-item" key={item.id}>
                    <RiskBadge level={item.riskLevel} />
                    {item.name}
                  </span>
                ))}
                {items.length === 0 ? <span className="roster-cockpit-muted">无</span> : null}
              </div>
            </WxbCard>
          ))}
        </div>
      </WxbPageSection>

      <WxbPageSection
        title="关键人员依赖"
        description="这里表达的是计划依赖风险，不是员工绩效评价。"
        variant="framed"
      >
        <WxbDataTable<KeyPersonDependency>
          columns={keyPeopleColumns}
          dataSource={snapshot.keyPeople}
          emptyState={{ description: '当前窗口未识别到明显的高依赖人员。' }}
          pagination={false}
          rowKey="employeeId"
          size="middle"
        />
      </WxbPageSection>

      <WxbPageGrid minItemWidth="420px" gap="lg" mode="auto-fit">
        <WxbPageSection
          title="异常韧性摘要"
          description="用于判断临时缺勤是否能通过替补修复，以及哪里需要主管介入。"
          variant="framed"
        >
          <div className="roster-cockpit-resilience-grid">
            <MetricMini
              label="可通过替补修复的缺口比例"
              value={`${snapshot.resilience.replaceableGapRate}%`}
              caption={<WxbProgress percent={snapshot.resilience.replaceableGapRate} status={snapshot.resilience.replaceableGapRate >= 70 ? 'success' : 'warning'} showInfo={false} />}
            />
            <MetricMini label="无法修复的缺口数量" value={snapshot.resilience.unrecoverableGapCount} />
            <MetricMini label="平均候选人深度" value={snapshot.resilience.averageCandidateDepth} />
            <MetricMini label="单人缺勤最大影响" value={`${snapshot.resilience.maxSingleAbsenceImpact} 人`} />
            <MetricMini label="可能需要重新求解的数量" value={snapshot.resilience.rerunLikelyCount} />
            <MetricMini label="可能需要主管介入的数量" value={snapshot.resilience.supervisorActionCount} />
          </div>
        </WxbPageSection>

        <WxbPageSection
          title="建议动作"
          description="看板只给管理建议，不会自动执行任何排班修改。"
          variant="framed"
        >
          <div className="roster-cockpit-action-list">
            {snapshot.recommendations.map((recommendation, index) => (
              <div className="roster-cockpit-action-item" key={recommendation}>
                <span>{index + 1}</span>
                <p>{recommendation}</p>
              </div>
            ))}
          </div>
          <WxbDivider />
          <div className="roster-cockpit-readonly-note">
            <WxbIcon name="kanban" size={18} />
            Read-only，不会自动修改排班。
          </div>
        </WxbPageSection>
      </WxbPageGrid>
    </WxbPageShell>
  );
};

export default RosterLeadershipCockpitPage;
