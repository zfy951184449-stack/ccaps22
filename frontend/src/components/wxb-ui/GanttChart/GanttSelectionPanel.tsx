/**
 * WxbGanttChart v2.1 — Selection Panel
 * Floating "shopping cart" style panel showing selected tasks
 * Appears when selectedTaskIds.size >= 1
 */
import React, { useMemo } from 'react';
import type { GanttTask, GanttGroup } from './types';
import { THEME, FONT_SANS } from './constants';

export interface GanttSelectionPanelProps {
  selectedTaskIds: Set<string>;
  tasks: GanttTask[];
  groups: GanttGroup[];
  onDeselectTask: (taskId: string) => void;
  onDeselectAll: () => void;
  onSelectAllInGroup: (groupId: string) => void;
}

interface GroupedSelection {
  groupId: string;
  groupLabel: string;
  groupColor: string;
  tasks: Array<{ id: string; label: string; color?: string }>;
}

const GanttSelectionPanel: React.FC<GanttSelectionPanelProps> = ({
  selectedTaskIds,
  tasks,
  groups,
  onDeselectTask,
  onDeselectAll,
}) => {
  // Group selected tasks by their groupId
  const groupedSelections = useMemo((): GroupedSelection[] => {
    const groupMap = new Map<string, GanttGroup>();
    for (const g of groups) groupMap.set(g.id, g);

    const buckets = new Map<string, GroupedSelection>();
    const UNGROUPED = '__ungrouped__';

    for (const taskId of Array.from(selectedTaskIds)) {
      const task = tasks.find(t => t.id === taskId);
      if (!task) continue;

      const gid = task.groupId || UNGROUPED;
      if (!buckets.has(gid)) {
        const group = groupMap.get(gid);
        buckets.set(gid, {
          groupId: gid,
          groupLabel: group?.label || '未分组',
          groupColor: group?.color || THEME.fg3,
          tasks: [],
        });
      }
      buckets.get(gid)!.tasks.push({
        id: task.id,
        label: task.label,
        color: task.color,
      });
    }
    return Array.from(buckets.values());
  }, [selectedTaskIds, tasks, groups]);

  if (selectedTaskIds.size === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 48,
        width: 240,
        maxHeight: 320,
        overflowY: 'auto',
        background: THEME.bg,
        border: `1px solid ${THEME.border}`,
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.05)',
        fontFamily: FONT_SANS,
        zIndex: 80,
        animation: 'wxb-panel-slidein 0.18s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderBottom: `1px solid ${THEME.divider}`,
          background: THEME.surface1,
          borderRadius: '8px 8px 0 0',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: THEME.ink }}>
          ☑ 已选中 {selectedTaskIds.size} 个任务
        </span>
        <button
          onClick={onDeselectAll}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            color: THEME.fg3,
            background: 'transparent',
            border: `1px solid ${THEME.border}`,
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = THEME.surface2;
            (e.currentTarget as HTMLButtonElement).style.color = THEME.danger;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = THEME.fg3;
          }}
        >
          清空
        </button>
      </div>

      {/* Grouped task list */}
      <div style={{ padding: '4px 0' }}>
        {groupedSelections.map(group => (
          <div key={group.groupId}>
            {/* Group label */}
            <div
              style={{
                padding: '4px 12px 2px',
                fontSize: 10,
                fontWeight: 600,
                color: group.groupColor,
                letterSpacing: '0.03em',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: group.groupColor,
                  flexShrink: 0,
                }}
              />
              {group.groupLabel}
              <span style={{ color: THEME.fg4, fontWeight: 400 }}>({group.tasks.length})</span>
            </div>

            {/* Task items */}
            {group.tasks.map(task => (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '3px 12px 3px 22px',
                  fontSize: 11,
                  color: THEME.fg2,
                  gap: 6,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = THEME.surface1;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                }}
              >
                {/* Color dot */}
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    background: task.color || group.groupColor,
                    flexShrink: 0,
                  }}
                />
                {/* Label */}
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.label}
                </span>
                {/* Remove button */}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeselectTask(task.id);
                  }}
                  style={{
                    fontSize: 12,
                    cursor: 'pointer',
                    color: THEME.fg4,
                    padding: '0 2px',
                    borderRadius: 2,
                    lineHeight: 1,
                    transition: 'color 0.1s',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLSpanElement).style.color = THEME.danger;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLSpanElement).style.color = THEME.fg4;
                  }}
                  title="取消选中"
                >
                  ×
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Inline animation */}
      <style>{`
        @keyframes wxb-panel-slidein {
          from { opacity: 0; transform: translateX(12px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default React.memo(GanttSelectionPanel);
