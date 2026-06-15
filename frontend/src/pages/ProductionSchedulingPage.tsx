/**
 * 排产(production scheduling)结果甘特页 —— 第一刀:契约 + 真实 mock + 结果甘特。
 * 权威设计:docs/production_scheduling/50_end_to_end_flow.md(阶段 7「任务派发闸」的结果视图)。
 * 现接 WBP2486 mock;后续替换为新建排产引擎(纯传播)产出。
 */
import React, { useMemo } from 'react';
import {
  WxbGanttChart,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
} from '../components/wxb-ui';
import { buildWbp2486MockSchedule } from '../mock/wbp2486Schedule';
import {
  PS_CATEGORY_LABEL,
  psCategoryColor,
  toGanttDeps,
  toGanttGroups,
  toGanttTasks,
} from '../components/ProductionScheduling/psGanttAdapter';
import type { PsOpCategory } from '../types/productionScheduling';
import './ProductionSchedulingPage.css';

const LEGEND_ORDER: PsOpCategory[] = [
  'usp-main',
  'dsp-main',
  'cip',
  'sip',
  'buffer-prep',
  'room-release',
  'sampling',
  'campaign',
];

const ProductionSchedulingPage: React.FC = () => {
  const schedule = useMemo(() => buildWbp2486MockSchedule(), []);
  const tasks = useMemo(() => toGanttTasks(schedule), [schedule]);
  const groups = useMemo(() => toGanttGroups(schedule), [schedule]);
  const dependencies = useMemo(() => toGanttDeps(schedule), [schedule]);
  const campaign = schedule.campaigns[0];

  return (
    <WxbPageShell size="full" gap="lg" className="ps-page">
      <WxbPageHeader
        eyebrow="排产 · Production Scheduling"
        title="排产结果甘特(WBP2486 · mock)"
        description="贴真实工艺的 mock:USP ~32 天 → DSP ~17 天,含派生 CIP/SIP/配液/房间放行、攒批 campaign 与 Day5 CIP 尖峰。数据后续由新建排产引擎(纯传播、无求解器)替换。"
        meta={
          <span className="ps-meta">
            原点 {schedule.originDate} · {schedule.operations.length} 道操作 · {schedule.cipPeak?.label}
          </span>
        }
      />
      <WxbPageSection variant="framed" density="compact" className="ps-section">
        <div className="ps-legend" role="list" aria-label="操作类别图例">
          {LEGEND_ORDER.map((c) => (
            <span className="ps-legend-item" role="listitem" key={c}>
              <span className="ps-legend-swatch" style={{ background: psCategoryColor(c) }} />
              {PS_CATEGORY_LABEL[c]}
            </span>
          ))}
        </div>
        {campaign && (
          <div className="ps-campaign-note">
            <strong>攒批:</strong> {campaign.materialName} {campaign.totalQty}
            {campaign.unit} 一次配制,分装服务 {campaign.draws.length} 批(各 {campaign.draws[0]?.qty}
            {campaign.unit})· 效期 {campaign.shelfLifeHours / 24} 天 · 省 {campaign.cipSaved} 次 CIP
          </div>
        )}
        <div className="ps-gantt">
          <WxbGanttChart
            tasks={tasks}
            groups={groups}
            dependencies={dependencies}
            timelineOriginDate={schedule.originDate}
            timeUnit="day"
            readOnly
            showToday={false}
            enableFullscreen
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </WxbPageSection>
    </WxbPageShell>
  );
};

export default ProductionSchedulingPage;
