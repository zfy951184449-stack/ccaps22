/**
 * GanttSharePanel — Floating panel showing share-group related tasks on hover.
 * Appears when hovering an operation that belongs to a share group component.
 * Visual style aligns with GanttSelectionPanel.
 */
import React from 'react';

export interface ShareHoverTask {
  id: string;
  label: string;
  color?: string;
  isHovered: boolean; // true for the task being hovered
}

export interface GanttSharePanelProps {
  tasks: ShareHoverTask[];
  componentColor: string;
  /** Whether the selection panel is visible (affects vertical positioning) */
  selectionPanelVisible?: boolean;
}

const GanttSharePanel: React.FC<GanttSharePanelProps> = ({
  tasks,
  componentColor,
  selectionPanelVisible = false,
}) => {
  if (tasks.length === 0) return null;

  return (
    <div
      className="wxb-gantt-share"
      style={{ top: selectionPanelVisible ? 'auto' : 4 }}
    >
      {/* Header */}
      <div className="wxb-gantt-share-header">
        <span
          className="wxb-gantt-sel-dot"
          style={{ background: componentColor, width: 6, height: 6 }}
        />
        <span className="wxb-gantt-share-title">
          关联操作 ({tasks.length})
        </span>
      </div>

      {/* Task list */}
      <div style={{ padding: '2px 0 4px' }}>
        {tasks.map(t => (
          <div
            key={t.id}
            className={`wxb-gantt-share-task ${t.isHovered ? 'current' : ''}`}
          >
            <span
              className="wxb-gantt-sel-dot"
              style={{
                width: 4,
                height: 4,
                background: t.isHovered ? componentColor : (t.color || '#8898A8'),
              }}
            />
            <span className="wxb-gantt-share-task-label">{t.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(GanttSharePanel);
