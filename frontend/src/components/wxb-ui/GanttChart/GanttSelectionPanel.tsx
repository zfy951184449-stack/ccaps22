/**
 * WxbGanttChart v2.1 — Selection Panel
 * Floating "shopping cart" style panel showing selected tasks.
 * Uses CSS classes (.wxb-gantt-sel-*) aligned with wxb-theme.css.
 */
import React, { useMemo } from 'react';
import type { GanttTask, GanttGroup } from './types';

export interface GanttSelectionPanelProps {
  selectedTaskIds: Set<string>;
  tasks: GanttTask[];
  groups: GanttGroup[];
  onDeselectTask: (taskId: string) => void;
  onDeselectAll: () => void;
  onSelectAllInGroup: (groupId: string) => void;
  /** Callback to create a share group from the currently selected tasks */
  onCreateShareGroup?: (selectedTaskIds: string[]) => void;
  /** Extra action buttons injected by consumer (e.g., equipment binding) */
  extraActions?: React.ReactNode;
}

interface GroupedSelection {
  groupId: string;
  groupLabel: string;
  groupColor: string;
  tasks: Array<{ id: string; label: string; color?: string }>;
}

const GanttSelectionPanel: React.FC<GanttSelectionPanelProps> = ({
  selectedTaskIds, tasks, groups, onDeselectTask, onDeselectAll, onSelectAllInGroup,
  onCreateShareGroup, extraActions,
}) => {
  // Pre-build task index for O(1) lookup instead of O(N) per selected task
  const taskMap = useMemo(() => {
    const map = new Map<string, GanttTask>();
    for (const t of tasks) map.set(t.id, t);
    return map;
  }, [tasks]);

  const groupMap = useMemo(() => {
    const map = new Map<string, GanttGroup>();
    for (const g of groups) map.set(g.id, g);
    return map;
  }, [groups]);

  // Group selected tasks by their groupId
  const groupedSelections = useMemo((): GroupedSelection[] => {
    const buckets = new Map<string, GroupedSelection>();
    const UNGROUPED = '__ungrouped__';

    for (const taskId of Array.from(selectedTaskIds)) {
      const task = taskMap.get(taskId);
      if (!task) continue;

      const gid = task.groupId || UNGROUPED;
      if (!buckets.has(gid)) {
        const group = groupMap.get(gid);
        buckets.set(gid, {
          groupId: gid,
          groupLabel: group?.label || '未分组',
          groupColor: group?.color || '#5A6B7E',
          tasks: [],
        });
      }
      buckets.get(gid)!.tasks.push({ id: task.id, label: task.label, color: task.color });
    }
    return Array.from(buckets.values());
  }, [selectedTaskIds, taskMap, groupMap]);

  if (selectedTaskIds.size === 0) return null;

  return (
    <div className="wxb-gantt-sel">
      {/* Header */}
      <div className="wxb-gantt-sel-header">
        <span className="wxb-gantt-sel-title">
          已选中 {selectedTaskIds.size} 个任务
        </span>
        <button className="wxb-gantt-sel-clear" onClick={onDeselectAll}>
          清空
        </button>
      </div>

      {/* Grouped task list */}
      <div style={{ padding: '4px 0' }}>
        {groupedSelections.map(group => (
          <div key={group.groupId}>
            {/* Group label with "select all" action */}
            <div className="wxb-gantt-sel-group-label" style={{ color: group.groupColor }}>
              <span className="wxb-gantt-sel-dot" style={{ background: group.groupColor }} />
              {group.groupLabel}
              <span className="count">({group.tasks.length})</span>
              {/* Select all in this group */}
              {group.groupId !== '__ungrouped__' && (
                <span
                  style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 10, color: '#8898A8' }}
                  onClick={() => onSelectAllInGroup(group.groupId)}
                  title="全选此组"
                >
                  全选
                </span>
              )}
            </div>

            {/* Task items */}
            {group.tasks.map(task => (
              <div key={task.id} className="wxb-gantt-sel-task">
                <span className="wxb-gantt-sel-dot" style={{ width: 4, height: 4, background: task.color || group.groupColor }} />
                <span className="wxb-gantt-sel-task-label">{task.label}</span>
                <span className="wxb-gantt-sel-remove" onClick={() => onDeselectTask(task.id)} title="取消选中">×</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Share group creation button */}
      {onCreateShareGroup && selectedTaskIds.size >= 2 && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            className="wxb-gantt-sel-share-btn"
            onClick={() => onCreateShareGroup(Array.from(selectedTaskIds))}
            style={{
              width: '100%',
              padding: '6px 10px',
              background: 'linear-gradient(135deg, rgba(24,144,255,0.15), rgba(24,144,255,0.08))',
              border: '1px solid rgba(24,144,255,0.3)',
              borderRadius: 6,
              color: '#5ba8f5',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(24,144,255,0.25)'; }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'linear-gradient(135deg, rgba(24,144,255,0.15), rgba(24,144,255,0.08))'; }}
          >
            从选中项创建共享组 ({selectedTaskIds.size})
          </button>
        </div>
      )}
      {extraActions && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {extraActions}
        </div>
      )}
    </div>
  );
};

export default React.memo(GanttSelectionPanel);
