/**
 * WxbGanttChart v2 — Singleton Tooltip
 */
import React from 'react';
import type { GanttTask } from './types';
import { THEME, FONT_SANS } from './constants';
import { formatHour } from './ganttUtils';

interface GanttTooltipProps {
  task: GanttTask | null;
  x: number;
  y: number;
  visible: boolean;
}

const GanttTooltip: React.FC<GanttTooltipProps> = ({ task, x, y, visible }) => {
  if (!visible || !task) return null;

  const duration = task.end - task.start;
  const durationText = duration >= 24
    ? `${(duration / 24).toFixed(1)} 天`
    : `${duration.toFixed(1)} 小时`;

  return (
    <div
      className="wxb-gantt-tooltip"
      style={{
        position: 'fixed',
        left: x + 12,
        top: y - 10,
        zIndex: 10000,
        pointerEvents: 'none',
        minWidth: 180,
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
            <span>{formatHour(task.start)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: THEME.fg3 }}>结束</span>
            <span>{formatHour(task.end)}</span>
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
