/**
 * WxbGanttChart v2 — Minimap overlay
 * Shows current viewport position and active tasks summary
 */
import React from 'react';
import { THEME, FONT_SANS } from './constants';

interface GanttMinimapProps {
  visible: boolean;
  currentDay: number;
  activeTasks: { id: string; label: string }[];
}

const GanttMinimap: React.FC<GanttMinimapProps> = ({ visible, currentDay, activeTasks }) => {
  if (!visible) return null;

  const displayed = activeTasks.slice(0, 4);
  const remaining = activeTasks.length - 4;

  return (
    <div
      className="wxb-gantt-minimap"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 100,
        minWidth: 160,
        padding: '10px 14px',
        background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 10,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        border: '1px solid rgba(255,255,255,0.3)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        transform: visible ? 'translateY(0)' : 'translateY(8px)',
        fontFamily: FONT_SANS,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 600, color: THEME.ink, lineHeight: 1.2, marginBottom: 4 }}>
        Day {currentDay}
      </div>

      {displayed.length > 0 ? (
        displayed.map(t => (
          <div key={t.id} style={{
            fontSize: 11,
            color: THEME.fg3,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 180,
          }}>
            {t.label}
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11, color: THEME.fg4, fontStyle: 'italic' }}>
          无活跃任务
        </div>
      )}

      {remaining > 0 && (
        <div style={{ fontSize: 10, color: THEME.fg4, marginTop: 2 }}>
          +{remaining} 更多...
        </div>
      )}
    </div>
  );
};

export default React.memo(GanttMinimap);
