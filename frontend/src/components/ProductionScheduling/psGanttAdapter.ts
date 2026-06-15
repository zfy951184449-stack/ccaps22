/**
 * 排产模型 → WxbGanttChart 数据适配器(纯函数)。
 * 仿 components/ProcessTemplateGantt/ganttAdapter.ts 的模式,但喂的是 PsSchedule(排产结果)。
 * 颜色一律用 wxb-theme CSS 变量(硬规:不许硬编码 hex)。
 */
import type { GanttDependency, GanttGroup, GanttTask } from '../wxb-ui/GanttChart/types';
import type { PsOpCategory, PsSchedule } from '../../types/productionScheduling';

const CATEGORY_COLOR: Record<PsOpCategory, string> = {
  'usp-main': 'var(--wx-blue-600)',
  'dsp-main': 'var(--wx-blue-400)',
  cip: 'var(--wx-amber-500)',
  sip: 'var(--wx-amber-700)',
  'buffer-prep': 'var(--wx-green-600)',
  'room-release': 'var(--wx-blue-800)',
  sampling: 'var(--wx-blue-200)',
  campaign: 'var(--wx-green-500)',
};

export const PS_CATEGORY_LABEL: Record<PsOpCategory, string> = {
  'usp-main': 'USP 主链',
  'dsp-main': 'DSP 主链',
  cip: 'CIP 清洗',
  sip: 'SIP 灭菌',
  'buffer-prep': '配液',
  'room-release': '房间放行',
  sampling: '取样',
  campaign: '攒批',
};

export function psCategoryColor(cat: PsOpCategory): string {
  return CATEGORY_COLOR[cat];
}

export function toGanttTasks(schedule: PsSchedule): GanttTask[] {
  return schedule.operations.map((op) => ({
    id: op.id,
    label: op.name,
    start: op.startHour,
    end: op.endHour,
    groupId: op.stageId,
    color: CATEGORY_COLOR[op.category],
    type: 'operation',
    windowStart: op.windowStartHour,
    windowEnd: op.windowEndHour,
    requiredPeople: op.requiredPeople,
    conflictType: op.conflict,
    readOnly: true,
    draggable: false,
    status: op.isAnchor ? '钉子' : op.kind === 'DERIVED' ? '派生' : undefined,
    data: {
      category: op.category,
      kind: op.kind,
      code: op.code,
      resource: op.resource,
      interruptible: op.interruptible,
      note: op.note,
    },
  }));
}

export function toGanttGroups(schedule: PsSchedule): GanttGroup[] {
  const groups: GanttGroup[] = [];
  schedule.batches.forEach((b) => groups.push({ id: b.id, label: b.code, type: 'batch' }));
  // 攒批跨批虚拟容器(顶层)
  groups.push({ id: '__campaign__', label: '攒批 campaign(跨批)', type: 'template' });
  schedule.stages.forEach((s) =>
    groups.push({ id: s.id, label: s.name, parentId: s.batchId, type: 'stage' }),
  );
  return groups;
}

export function toGanttDeps(schedule: PsSchedule): GanttDependency[] {
  return schedule.dependencies.map((d) => ({
    id: d.id,
    from: d.fromOpId,
    to: d.toOpId,
    type: d.type,
    lag: d.lagHours,
    level: d.hard ? 1 : 2,
    label:
      d.relation === 'handoff'
        ? '收获→AC ≤4h'
        : d.relation === 'expiry-maxlag'
          ? '效期 max-lag'
          : undefined,
  }));
}
