import React from 'react';
import './MiniGantt.css';

export interface WxbGanttTask { id: string; label: string; start: number; end: number; color?: string; progress?: number; }
export interface WxbMiniGanttProps { tasks: WxbGanttTask[]; totalDuration: number; title?: string; unit?: string; className?: string; }

export const WxbMiniGantt: React.FC<WxbMiniGanttProps> = ({
  tasks, totalDuration, title, unit = 'h', className = '',
}) => {
  const ROW_H = 28, PAD_L = 120, PAD_R = 16;
  const svgW = 500, svgH = tasks.length * ROW_H + 32;
  const chartW = svgW - PAD_L - PAD_R;
  const ticks = Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * totalDuration));

  return (
    <div className={`wxb-mini-gantt ${className}`}>
      {title && <div className="wxb-gantt-title">{title}</div>}
      <svg width="100%" height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} preserveAspectRatio="xMidYMid meet">
        {ticks.map((t, i) => {
          const x = PAD_L + (t / totalDuration) * chartW;
          return (
            <g key={i}>
              <line x1={x} y1={16} x2={x} y2={svgH - 4} stroke="var(--wx-divider,#EEF2F7)" strokeWidth="1" />
              <text x={x} y={12} textAnchor="middle" className="wxb-gantt-tick">{t}{unit}</text>
            </g>
          );
        })}
        {tasks.map((task, i) => {
          const y = 20 + i * ROW_H;
          const x = PAD_L + (task.start / totalDuration) * chartW;
          const w = Math.max(2, ((task.end - task.start) / totalDuration) * chartW);
          const clr = task.color || 'var(--wx-blue-500,#1F6FEB)';
          return (
            <g key={task.id}>
              <text x={PAD_L - 8} y={y + ROW_H / 2 + 1} textAnchor="end" className="wxb-gantt-label">{task.label}</text>
              <rect x={x} y={y + 4} width={w} height={ROW_H - 10} rx={3} fill={clr} opacity={0.2} />
              {task.progress !== undefined && (
                <rect x={x} y={y + 4} width={w * (task.progress / 100)} height={ROW_H - 10} rx={3} fill={clr} opacity={0.85} />
              )}
              {task.progress === undefined && (
                <rect x={x} y={y + 4} width={w} height={ROW_H - 10} rx={3} fill={clr} opacity={0.85} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
