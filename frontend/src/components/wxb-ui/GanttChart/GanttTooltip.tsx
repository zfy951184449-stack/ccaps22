/**
 * WxbGanttChart — GanttTooltip Component
 * Singleton DOM tooltip overlay for hover information
 */
import React from 'react';
import { GanttTask } from './types';

interface GanttTooltipProps {
  task: GanttTask | null;
  x: number;
  y: number;
  visible: boolean;
}

export const GanttTooltip: React.FC<GanttTooltipProps> = ({ task, x, y, visible }) => {
  if (!visible || !task) return null;

  const startDay = Math.floor(task.start / 24);
  const startH = Math.floor(task.start % 24);
  const startM = Math.round((task.start % 1) * 60);
  const endDay = Math.floor(task.end / 24);
  const endH = Math.floor(task.end % 24);
  const endM = Math.round((task.end % 1) * 60);
  const duration = task.end - task.start;

  const formatTime = (day: number, h: number, m: number) =>
    `Day ${day} ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

  return (
    <div
      className="wxb-gantt-tooltip"
      style={{
        position: 'fixed',
        left: x + 12,
        top: y - 10,
        zIndex: 10000,
        pointerEvents: 'none',
        transform: 'translateY(-100%)',
      }}
    >
      <div className="wxb-gantt-tooltip-accent" />
      {task.tooltip || (
        <>
          <div className="wxb-gantt-tooltip-title">{task.label}</div>
          <div className="wxb-gantt-tooltip-row">
            <span className="wxb-gantt-tooltip-label">开始</span>
            <span className="wxb-gantt-tooltip-value">{formatTime(startDay, startH, startM)}</span>
          </div>
          <div className="wxb-gantt-tooltip-row">
            <span className="wxb-gantt-tooltip-label">结束</span>
            <span className="wxb-gantt-tooltip-value">{formatTime(endDay, endH, endM)}</span>
          </div>
          <div className="wxb-gantt-tooltip-row">
            <span className="wxb-gantt-tooltip-label">时长</span>
            <span className="wxb-gantt-tooltip-value">{duration.toFixed(1)} 小时</span>
          </div>
          {task.status && (
            <div className="wxb-gantt-tooltip-row">
              <span className="wxb-gantt-tooltip-label">状态</span>
              <span className="wxb-gantt-tooltip-value">{task.status}</span>
            </div>
          )}
          {task.progress !== undefined && (
            <div className="wxb-gantt-tooltip-row">
              <span className="wxb-gantt-tooltip-label">进度</span>
              <span className="wxb-gantt-tooltip-value">{task.progress}%</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
