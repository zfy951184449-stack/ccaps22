/**
 * WxbGanttChart v2 — Tree Layout: flatten groups/tasks into rows
 */
import { useMemo } from 'react';
import type { GanttTask, GanttGroup, FlatRow } from './types';

export interface LayoutResult {
  flatRows: FlatRow[];
  taskRowMap: Map<string, number>;
  groupChildCount: Map<string, number>;
}

export function useGanttLayout(
  tasks: GanttTask[],
  groups: GanttGroup[],
  collapsedGroups: Set<string>
): LayoutResult {
  return useMemo(() => {
    const flatRows: FlatRow[] = [];
    const taskRowMap = new Map<string, number>();
    const groupChildCount = new Map<string, number>();

    // Build adjacency: parentId → children groups
    const childGroupsMap = new Map<string | undefined, GanttGroup[]>();
    for (const g of groups) {
      const key = g.parentId ?? '__root__';
      if (!childGroupsMap.has(key)) childGroupsMap.set(key, []);
      childGroupsMap.get(key)!.push(g);
    }

    // Build group → tasks map
    const groupTasksMap = new Map<string, GanttTask[]>();
    const ungroupedTasks: GanttTask[] = [];
    for (const t of tasks) {
      if (t.groupId) {
        if (!groupTasksMap.has(t.groupId)) groupTasksMap.set(t.groupId, []);
        groupTasksMap.get(t.groupId)!.push(t);
      } else {
        ungroupedTasks.push(t);
      }
    }

    // Count all descendants (tasks) for each group recursively
    function countDescendants(groupId: string): number {
      let count = (groupTasksMap.get(groupId) || []).length;
      const childGroups = childGroupsMap.get(groupId) || [];
      for (const cg of childGroups) {
        count += countDescendants(cg.id);
      }
      groupChildCount.set(groupId, count);
      return count;
    }

    // DFS to flatten
    function dfs(parentId: string | undefined, depth: number) {
      const key = parentId ?? '__root__';
      const childGroups = childGroupsMap.get(key) || [];

      for (const group of childGroups) {
        countDescendants(group.id);
        const directTasks = groupTasksMap.get(group.id) || [];
        const rowTasks = directTasks.filter(task => !task.renderOnGroupRow);
        const inlineTasks = directTasks.filter(task => task.renderOnGroupRow);
        const isCollapsed = collapsedGroups.has(group.id);
        const hasChildren = rowTasks.length > 0
          || (childGroupsMap.get(group.id)?.length ?? 0) > 0;
        const groupRowIndex = flatRows.length;

        flatRows.push({
          id: group.id,
          type: 'group',
          label: group.label,
          depth,
          hasChildren,
          isExpanded: !isCollapsed,
          color: group.color,
          groupType: group.type,
          groupId: group.parentId,
        });
        for (const task of inlineTasks) {
          taskRowMap.set(task.id, groupRowIndex);
        }

        if (!isCollapsed) {
          // Recurse into child groups
          dfs(group.id, depth + 1);

          // Add direct tasks of this group
          for (const task of rowTasks) {
            const rowIndex = flatRows.length;
            flatRows.push({
              id: task.id,
              type: 'task',
              label: task.label,
              depth: depth + 1,
              hasChildren: false,
              isExpanded: false,
              taskId: task.id,
              groupId: group.id,
              color: task.color,
            });
            taskRowMap.set(task.id, rowIndex);
          }
        }
      }
    }

    // Start DFS from root
    dfs(undefined, 0);

    // Add ungrouped tasks at the end
    for (const task of ungroupedTasks) {
      const rowIndex = flatRows.length;
      flatRows.push({
        id: task.id,
        type: 'task',
        label: task.label,
        depth: 0,
        hasChildren: false,
        isExpanded: false,
        taskId: task.id,
        color: task.color,
      });
      taskRowMap.set(task.id, rowIndex);
    }

    return { flatRows, taskRowMap, groupChildCount };
  }, [tasks, groups, collapsedGroups]);
}
