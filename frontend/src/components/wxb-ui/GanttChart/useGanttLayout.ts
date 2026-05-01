/**
 * WxbGanttChart — useGanttLayout Hook
 * Handles group expansion/collapse and row flattening
 */
import { useMemo, useState, useCallback } from 'react';
import { GanttTask, GanttGroup, FlatRow } from './types';

export function useGanttLayout(tasks: GanttTask[], groups: GanttGroup[]) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const set = new Set<string>();
    groups.forEach(g => { if (g.collapsed) set.add(g.id); });
    return set;
  });

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Build group hierarchy
  const { flatRows, taskRowMap } = useMemo(() => {
    const rows: FlatRow[] = [];
    const taskMap = new Map<string, number>(); // taskId -> rowIndex

    if (groups.length === 0) {
      // No groups - flat task list
      tasks.forEach((task, idx) => {
        rows.push({
          id: task.id,
          type: 'task',
          label: task.label,
          depth: 0,
          hasChildren: false,
          isExpanded: false,
          taskId: task.id,
          color: task.color,
        });
        taskMap.set(task.id, idx);
      });
      return { flatRows: rows, taskRowMap: taskMap };
    }

    // Build parent-children map
    const childGroupMap = new Map<string | undefined, GanttGroup[]>();
    for (const g of groups) {
      const parentKey = g.parentId || '__root__';
      const arr = childGroupMap.get(parentKey) || [];
      arr.push(g);
      childGroupMap.set(parentKey, arr);
    }

    // Build group -> tasks map
    const groupTaskMap = new Map<string, GanttTask[]>();
    const ungroupedTasks: GanttTask[] = [];
    for (const task of tasks) {
      if (task.groupId) {
        const arr = groupTaskMap.get(task.groupId) || [];
        arr.push(task);
        groupTaskMap.set(task.groupId, arr);
      } else {
        ungroupedTasks.push(task);
      }
    }

    // Recursive flatten
    const flatten = (parentId: string, depth: number) => {
      const children = childGroupMap.get(parentId) || [];
      for (const group of children) {
        const childGroups = childGroupMap.get(group.id) || [];
        const groupTasks = groupTaskMap.get(group.id) || [];
        const hasChildren = childGroups.length > 0 || groupTasks.length > 0;
        const isExpanded = !collapsedGroups.has(group.id);

        rows.push({
          id: `group_${group.id}`,
          type: 'group',
          label: group.label,
          depth,
          hasChildren,
          isExpanded,
          groupId: group.id,
          color: group.color,
        });

        if (isExpanded) {
          // Recurse into child groups
          flatten(group.id, depth + 1);
          // Add tasks under this group
          for (const task of groupTasks) {
            const rowIndex = rows.length;
            rows.push({
              id: task.id,
              type: 'task',
              label: task.label,
              depth: depth + 1,
              hasChildren: false,
              isExpanded: false,
              taskId: task.id,
              color: task.color,
            });
            taskMap.set(task.id, rowIndex);
          }
        }
      }
    };

    flatten('__root__', 0);

    // Add ungrouped tasks at the end
    for (const task of ungroupedTasks) {
      const rowIndex = rows.length;
      rows.push({
        id: task.id,
        type: 'task',
        label: task.label,
        depth: 0,
        hasChildren: false,
        isExpanded: false,
        taskId: task.id,
        color: task.color,
      });
      taskMap.set(task.id, rowIndex);
    }

    return { flatRows: rows, taskRowMap: taskMap };
  }, [tasks, groups, collapsedGroups]);

  return { flatRows, taskRowMap, collapsedGroups, toggleGroup };
}
