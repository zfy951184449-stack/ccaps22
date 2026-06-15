/**
 * 工艺流模板 → WxbGanttChart「相对示意甘特」投影(D17 双视图的甘特一侧)。
 * 模板层无绝对时间 → 按阶段顺序 + 标称时长排出相对布局(单位:相对小时,从 0 起)。
 * 甘特用 RELATIVE 模式(不传 timelineOriginDate)→ 显示「Day N」,须标「示意」。
 * 颜色一律 --wx-* CSS 变量(硬规)。
 */
import type { GanttGroup, GanttTask } from '../wxb-ui/GanttChart/types';
import type { PfTemplate } from '../../types/processFlowTemplate';

export function pfDurationHours(text?: string): number {
  if (!text) return 12;
  const m = /([\d.]+)\s*([hd])/i.exec(text);
  if (!m) return 12;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase() === 'd' ? n * 24 : n;
}

const TPL_GROUP = '__tpl__';

export interface PfProjection {
  tasks: GanttTask[];
  groups: GanttGroup[];
}

export function projectTemplateToGantt(tpl: PfTemplate): PfProjection {
  const tasks: GanttTask[] = [];
  const groups: GanttGroup[] = [{ id: TPL_GROUP, label: tpl.code, type: 'template' }];

  let cursor = 0; // 相对小时
  const opEnd: Record<string, number> = {};
  const opStart: Record<string, number> = {};

  tpl.stages.forEach((stage) => {
    groups.push({ id: stage.id, label: stage.name, parentId: TPL_GROUP, type: 'stage' });
    stage.operations.forEach((o) => {
      const dur = pfDurationHours(o.durationText);
      const start = cursor;
      const end = start + dur;
      opStart[o.id] = start;
      opEnd[o.id] = end;
      const isUsp = stage.phase === 'USP';
      const color = o.anchor
        ? isUsp
          ? 'var(--wx-blue-700)'
          : 'var(--wx-green-700)'
        : isUsp
          ? 'var(--wx-blue-400)'
          : 'var(--wx-green-500)';
      // 弹簧:给一点示意窗口(±25% 时长)表达「落点可挪」;钉子无窗
      const slack = o.anchor ? 0 : Math.max(6, Math.round(dur * 0.25));
      tasks.push({
        id: o.id,
        label: o.name,
        start,
        end,
        groupId: stage.id,
        color,
        type: 'operation',
        windowStart: slack ? Math.max(0, start - slack) : undefined,
        windowEnd: slack ? end + slack : undefined,
        readOnly: true,
        draggable: false,
        status: o.anchor ? '钉子' : '弹簧',
        data: { code: o.code, interruptible: o.interruptible, demands: o.demands.length, effects: o.effects.length },
      });
      cursor = end;
    });
  });

  // 钩子 → 示意标记(挂在所绑操作上方,amber 细条)
  tpl.hooks.forEach((h) => {
    const s = opStart[h.boundTo];
    const e = opEnd[h.boundTo];
    if (s === undefined || e === undefined) return;
    const stageId = tpl.stages.find((st) => st.operations.some((o) => o.id === h.boundTo))?.id;
    tasks.push({
      id: `hook-${h.id}`,
      label: `⛓ ${h.label}`,
      start: s,
      end: e,
      groupId: stageId,
      color: 'var(--wx-amber-500)',
      type: 'operation',
      readOnly: true,
      draggable: false,
      status: '生成规则',
      data: { hook: h.type, note: h.note },
    });
  });

  return { tasks, groups };
}
