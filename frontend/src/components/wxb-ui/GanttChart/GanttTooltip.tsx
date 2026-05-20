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

const TOOLTIP_W = 260;
const TOOLTIP_H = 168;
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

function resolvePosition(x: number, y: number, avoidRects: GanttAvoidRect[] = []) {
  const vw = typeof window === 'undefined' ? 1440 : window.innerWidth;
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  const margin = 8;
  const maxLeft = Math.max(margin, vw - TOOLTIP_W - margin);
  const maxTop = Math.max(margin, vh - TOOLTIP_H - margin);

  const normalize = (left: number, top: number) => ({
    left: clamp(left, margin, maxLeft),
    top: clamp(top, margin, maxTop),
  });
  const candidateRect = (left: number, top: number) => ({
    left,
    top,
    right: left + TOOLTIP_W,
    bottom: top + TOOLTIP_H,
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
    { left: avoid.right + GAP, top: y - TOOLTIP_H / 2 },
    { left: avoid.left - TOOLTIP_W - GAP, top: y - TOOLTIP_H / 2 },
    { left: x + GAP, top: avoid.bottom + GAP },
    { left: x + GAP, top: avoid.top - TOOLTIP_H - GAP },
  ].map((position) => normalize(position.left, position.top));

  return candidates.find((position) => fits(position.left, position.top)) ?? normalize(avoid.right + GAP, y + GAP);
}

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
  const position = resolvePosition(x, y, avoidRects);

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
          {task.progress !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME.fg3 }}>进度</span>
              <span>{task.progress}%</span>
            </div>
          )}
          {task.requiredPeople !== undefined && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: THEME.fg3 }}>人员</span>
              <span>{task.assignedPeople ?? '—'}/{task.requiredPeople}</span>
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
