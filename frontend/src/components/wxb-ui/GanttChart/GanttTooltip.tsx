/**
 * WxbGanttChart v2 — Singleton Tooltip
 */
import React from 'react';
import type { GanttTask } from './types';
import { THEME, FONT_SANS } from './constants';
import { formatHour } from './ganttUtils';

export interface GanttAvoidRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface GanttTooltipProps {
  task: GanttTask | null;
  x: number;
  y: number;
  visible: boolean;
  avoidRects?: GanttAvoidRect[];
}

const TOOLTIP_W = 304;
const TOOLTIP_BASE_H = 142;
const ASSIGNMENT_ROW_H = 20;
const MAX_VISIBLE_ASSIGNMENTS = 6;
const GAP = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const overlaps = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

const unionRects = (rects: GanttAvoidRect[]) => rects.reduce((acc, rect) => ({
  left: Math.min(acc.left, rect.left),
  top: Math.min(acc.top, rect.top),
  right: Math.max(acc.right, rect.right),
  bottom: Math.max(acc.bottom, rect.bottom),
}), rects[0]);

function resolvePosition(x: number, y: number, avoidRects: GanttAvoidRect[] = [], tooltipHeight = TOOLTIP_BASE_H) {
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const margin = 8;
  const maxLeft = Math.max(margin, vw - TOOLTIP_W - margin);
  const maxTop = Math.max(margin, vh - tooltipHeight - margin);

  const normalize = (left: number, top: number) => ({
    left: clamp(left, margin, maxLeft),
    top: clamp(top, margin, maxTop),
  });
  const candidateRect = (left: number, top: number) => ({
    left,
    top,
    right: left + TOOLTIP_W,
    bottom: top + tooltipHeight,
  });
  const fits = (left: number, top: number) => {
    const rect = candidateRect(left, top);
    return rect.left >= margin
      && rect.top >= margin
      && rect.right <= vw - margin
      && rect.bottom <= vh - margin
      && !avoidRects.some((avoid) => overlaps(rect, avoid));
  };

  if (!avoidRects.length) return normalize(x + GAP, y + GAP);

  const avoid = unionRects(avoidRects);
  const candidates = [
    { left: avoid.right + GAP, top: y - tooltipHeight / 2 },
    { left: avoid.left - TOOLTIP_W - GAP, top: y - tooltipHeight / 2 },
    { left: x + GAP, top: avoid.bottom + GAP },
    { left: x + GAP, top: avoid.top - tooltipHeight - GAP },
  ].map((position) => normalize(position.left, position.top));

  return candidates.find((position) => fits(position.left, position.top)) ?? normalize(avoid.right + GAP, y + GAP);
}

const formatEmployee = (assignment: NonNullable<GanttTask['personnelAssignments']>[number]) => {
  const name = assignment.employeeName || assignment.employeeCode || (
    Number.isFinite(assignment.employeeId) ? `员工 ${assignment.employeeId}` : '未指定员工'
  );

  if (assignment.employeeName && assignment.employeeCode) {
    return `${assignment.employeeName} (${assignment.employeeCode})`;
  }

  return name;
};

const formatPersonnelSummary = (assignedPeople: number | undefined, requiredPeople: number | undefined, detailCount: number) => {
  const assigned = detailCount > 0 ? detailCount : assignedPeople;
  if (requiredPeople === undefined) {
    return assigned !== undefined ? `${assigned} 人` : '—';
  }
  return `${assigned ?? 0}/${requiredPeople}`;
};

const GanttTooltip: React.FC<GanttTooltipProps> = ({ task, x, y, visible, avoidRects }) => {
  if (!visible || !task) return null;

  const duration = task.end - task.start;
  const durationText = duration >= 24
    ? `${(duration / 24).toFixed(1)} 天`
    : `${duration.toFixed(1)} 小时`;
  const displayStart = typeof task.data?.displayStart === 'string'
    ? task.data.displayStart
    : formatHour(task.start);
  const displayEnd = typeof task.data?.displayEnd === 'string'
    ? task.data.displayEnd
    : formatHour(task.end);
  const personnelAssignments = task.personnelAssignments ?? [];
  const visibleAssignments = personnelAssignments.slice(0, MAX_VISIBLE_ASSIGNMENTS);
  const hiddenAssignmentCount = personnelAssignments.length - visibleAssignments.length;
  const tooltipHeight = TOOLTIP_BASE_H
    + visibleAssignments.length * ASSIGNMENT_ROW_H
    + (hiddenAssignmentCount > 0 ? ASSIGNMENT_ROW_H : 0);
  const position = resolvePosition(x, y, avoidRects, tooltipHeight);

  return (
    <div
      className="wxb-gantt-tooltip"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        zIndex: 10000,
        pointerEvents: 'none',
        width: TOOLTIP_W,
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        overflow: 'hidden',
        fontFamily: FONT_SANS,
      }}
    >
      {/* Color top bar */}
      <div style={{ height: 3, background: task.color || THEME.primary }} />

      <div style={{ padding: '8px 12px' }}>
        {/* Title */}
        <div style={{ fontSize: 13, fontWeight: 600, color: THEME.ink, marginBottom: 6 }}>
          {task.label}
        </div>

        <div style={{ fontSize: 12, color: THEME.fg2, lineHeight: 1.6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.fg3 }}>开始</span>
            <span>{displayStart}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.fg3 }}>结束</span>
            <span>{displayEnd}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.fg3 }}>时长</span>
            <span>{durationText}</span>
          </div>
          {task.requiredPeople !== undefined && (
            <div style={{ marginTop: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: THEME.fg3 }}>人员</span>
                <span>{formatPersonnelSummary(task.assignedPeople, task.requiredPeople, personnelAssignments.length)}</span>
              </div>
              {visibleAssignments.length > 0 ? (
                <div style={{ marginTop: 4, display: 'grid', gap: 2 }}>
                  {visibleAssignments.map((assignment, index) => {
                    const meta = [assignment.role, assignment.shiftName].filter(Boolean).join(' · ');
                    const label = `位置 ${assignment.positionNumber ?? index + 1}`;
                    return (
                      <div
                        key={assignment.id ?? `${assignment.employeeId}-${index}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '64px 1fr',
                          columnGap: 8,
                          color: THEME.fg2,
                        }}
                      >
                        <span style={{ color: THEME.fg3 }}>{label}</span>
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {formatEmployee(assignment)}
                          {meta ? ` · ${meta}` : ''}
                        </span>
                      </div>
                    );
                  })}
                  {hiddenAssignmentCount > 0 && (
                    <div style={{ color: THEME.fg3 }}>
                      另有 {hiddenAssignmentCount} 人已安排
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 2, color: THEME.fg3 }}>
                  {(task.assignedPeople ?? 0) > 0 ? '已安排人员暂无明细' : '暂无已安排人员'}
                </div>
              )}
            </div>
          )}
          {task.status && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME.fg3 }}>状态</span>
              <span>{task.status}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default React.memo(GanttTooltip);
