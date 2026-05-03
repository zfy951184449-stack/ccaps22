/**
 * useShareGroupService — 共享组业务服务 Hook
 *
 * 消费者层 Hook，封装：
 * 1. API CRUD (fetch / create / update / delete / assign / remove)
 * 2. ShareGroupModal 的可见状态 + 编辑/创建模式
 * 3. 高亮状态管理（highlightedGroupId → highlightedLinkIds）
 * 4. 动态二级菜单构建（buildShareMenuItems）
 * 5. 右键菜单 action 路由（handleShareAction）
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import type { ShareGroup, ShareGroupMember } from './types';
import type { GanttTask } from '../wxb-ui/GanttChart/types';
import type { ContextMenuItem } from '../wxb-ui/GanttChart/GanttContextMenu';

const API = '/api/share-groups';

export type ShareMode = 'SAME_TEAM' | 'DIFFERENT';

export interface ModalState {
  visible: boolean;
  mode: 'create' | 'edit';
  editingGroup: ShareGroup | null;
  /** Pre-selected schedule IDs when creating from multi-selection */
  preSelectedIds: number[];
}

export interface UseShareGroupServiceProps {
  templateId: number;
  /** Operation list for Modal dual-column selector */
  operations: Array<{
    scheduleId: number;
    operationName: string;
    stageName: string;
    requiredPeople: number;
  }>;
  /** Callback after data changes (used to refresh gantt chart data) */
  onDataChange?: () => void;
  /** Toast callback */
  onMessage?: (type: 'success' | 'warning' | 'error', text: string) => void;
}

export interface UseShareGroupServiceResult {
  // === Data ===
  shareGroups: ShareGroup[];
  loading: boolean;
  /** Currently highlighted group ID (for drawLinks emphasis) */
  highlightedGroupId: number | null;
  /** Derived highlighted link IDs for WxbGanttChart prop */
  highlightedLinkIds: string[];

  // === Modal State ===
  modalState: ModalState;
  openCreateModal: (preSelectedIds?: number[]) => void;
  openEditModal: (group: ShareGroup) => void;
  closeModal: () => void;
  submitModal: (
    name: string,
    mode: ShareMode,
    memberIds: number[]
  ) => Promise<void>;

  // === Context Menu Actions ===
  /** Build dynamic sub-menu items for a given task */
  buildShareMenuItems: (task: GanttTask) => ContextMenuItem[];
  /** Handle a share-* menu action key */
  handleShareAction: (
    actionKey: string,
    taskOrIds: GanttTask | string[]
  ) => Promise<void>;

  // === Highlight ===
  toggleHighlight: (groupId: number) => void;
  clearHighlight: () => void;

  // === Refresh ===
  refresh: () => Promise<void>;
}

const defaultMessage = (type: 'success' | 'warning' | 'error', text: string) => {
  // eslint-disable-next-line no-console
  console.log(`[ShareGroupService] ${type}: ${text}`);
};

export function useShareGroupService({
  templateId,
  operations,
  onDataChange,
  onMessage = defaultMessage,
}: UseShareGroupServiceProps): UseShareGroupServiceResult {
  // ===== State =====
  const [shareGroups, setShareGroups] = useState<ShareGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedGroupId, setHighlightedGroupId] = useState<number | null>(null);

  const [modalState, setModalState] = useState<ModalState>({
    visible: false,
    mode: 'create',
    editingGroup: null,
    preSelectedIds: [],
  });

  // ===== Derived: highlightedLinkIds for WxbGanttChart =====
  const highlightedLinkIds = useMemo((): string[] => {
    if (highlightedGroupId === null) return [];
    return [`share_${highlightedGroupId}`];
  }, [highlightedGroupId]);

  // ===== API: Fetch =====
  const fetchGroups = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/template/${templateId}`);
      const normalized: ShareGroup[] = (data || []).map((g: any) => ({
        ...g,
        id: Number(g.id),
        template_id: Number(g.template_id),
        operation_count: g.operation_count !== undefined ? Number(g.operation_count) : undefined,
      }));
      setShareGroups(normalized);
    } catch (error) {
      console.error('Failed to fetch share groups:', error);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // ===== Modal Actions =====
  const openCreateModal = useCallback((preSelectedIds?: number[]) => {
    setModalState({
      visible: true,
      mode: 'create',
      editingGroup: null,
      preSelectedIds: preSelectedIds || [],
    });
  }, []);

  const openEditModal = useCallback((group: ShareGroup) => {
    setModalState({
      visible: true,
      mode: 'edit',
      editingGroup: group,
      preSelectedIds: group.members?.map((m) => m.schedule_id) || [],
    });
  }, []);

  const closeModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, visible: false }));
  }, []);

  const submitModal = useCallback(
    async (name: string, mode: ShareMode, memberIds: number[]) => {
      if (memberIds.length < 2) {
        onMessage('warning', '共享组至少需要包含 2 个操作');
        return;
      }

      try {
        const payload = {
          group_name: name,
          share_mode: mode,
          member_ids: memberIds,
        };

        if (modalState.mode === 'edit' && modalState.editingGroup) {
          await axios.put(`${API}/${modalState.editingGroup.id}`, payload);
          onMessage('success', '共享组已更新');
        } else {
          await axios.post(`${API}/template/${templateId}`, payload);
          onMessage('success', '共享组已创建');
        }

        closeModal();
        await fetchGroups();
        onDataChange?.();
      } catch (error: any) {
        const msg = error?.response?.data?.error || '保存失败';
        onMessage('error', msg);
      }
    },
    [modalState, templateId, closeModal, fetchGroups, onDataChange, onMessage]
  );

  // ===== Single-item API Actions =====
  const assignToGroup = useCallback(
    async (scheduleId: number, groupId: number) => {
      try {
        await axios.post(`${API}/assign`, {
          schedule_id: scheduleId,
          share_group_id: groupId,
        });
        return true;
      } catch (error: any) {
        // 409 = already in group (tolerable)
        if (error?.response?.status === 409) return false;
        throw error;
      }
    },
    []
  );

  const removeFromGroup = useCallback(
    async (scheduleId: number, groupId: number) => {
      await axios.delete(`${API}/operation/${scheduleId}/group/${groupId}`);
    },
    []
  );

  const deleteGroup = useCallback(
    async (groupId: number) => {
      try {
        await axios.delete(`${API}/${groupId}`);
        onMessage('success', '共享组已删除');
        await fetchGroups();
        onDataChange?.();
      } catch {
        onMessage('error', '删除失败');
      }
    },
    [fetchGroups, onDataChange, onMessage]
  );

  // ===== Highlight =====
  const toggleHighlight = useCallback(
    (groupId: number) => {
      setHighlightedGroupId((prev) => (prev === groupId ? null : groupId));
    },
    []
  );

  const clearHighlight = useCallback(() => {
    setHighlightedGroupId(null);
  }, []);

  // ===== Build Dynamic Context Menu =====
  const buildShareMenuItems = useCallback(
    (task: GanttTask): ContextMenuItem[] => {
      // Extract scheduleId from task metadata (stored in task.data)
      const scheduleId = (task as any).data?.scheduleId ?? (task as any).data?.id;
      const items: ContextMenuItem[] = [];

      // 1. New share group
      items.push({ key: 'share-new', label: '新建共享组' });

      // Categorize groups by whether this task belongs to them
      const myGroups: ShareGroup[] = [];
      const otherGroups: ShareGroup[] = [];

      for (const g of shareGroups) {
        const isMember = g.members?.some((m) => m.schedule_id === scheduleId);
        if (isMember) {
          myGroups.push(g);
        } else {
          otherGroups.push(g);
        }
      }

      // 2. Join existing groups (only groups this task is NOT in)
      if (otherGroups.length > 0) {
        items.push({ key: 'share-divider-join', label: '—', divider: true });
        for (const g of otherGroups) {
          items.push({
            key: `share-join-${g.id}`,
            label: `加入: ${g.group_name}`,
          });
        }
      }

      // 3. Highlight / Remove (only groups this task IS in)
      if (myGroups.length > 0) {
        items.push({ key: 'share-divider-my', label: '—', divider: true });
        for (const g of myGroups) {
          const isCurrentlyHighlighted = highlightedGroupId === g.id;
          items.push({
            key: `share-highlight-${g.id}`,
            label: isCurrentlyHighlighted
              ? `取消高亮: ${g.group_name}`
              : `高亮: ${g.group_name}`,
          });
          items.push({
            key: `share-remove-${g.id}`,
            label: `移出: ${g.group_name}`,
            danger: true,
          });
        }
      }

      return items;
    },
    [shareGroups, highlightedGroupId]
  );

  // ===== Handle Menu Actions =====
  const handleShareAction = useCallback(
    async (actionKey: string, taskOrIds: GanttTask | string[]) => {
      // Resolve scheduleIds depending on input type
      const resolveScheduleIds = (): number[] => {
        if (Array.isArray(taskOrIds)) {
          // Multi-select: taskOrIds = string[] of task IDs
          // We need to convert to scheduleIds — for now, pass through as numbers
          return taskOrIds.map((id) => parseInt(id.replace(/\D/g, ''), 10)).filter(Number.isFinite);
        }
        // Single task
        const task = taskOrIds as GanttTask;
        const sid = (task as any).data?.scheduleId ?? (task as any).data?.id;
        return sid ? [Number(sid)] : [];
      };

      // share-new → open create modal
      if (actionKey === 'share-new') {
        const ids = resolveScheduleIds();
        openCreateModal(ids);
        return;
      }

      // share-join-{groupId} → assign task(s) to group
      if (actionKey.startsWith('share-join-')) {
        const groupId = parseInt(actionKey.replace('share-join-', ''), 10);
        if (!Number.isFinite(groupId)) return;

        const scheduleIds = resolveScheduleIds();
        let added = 0;
        let skipped = 0;

        try {
          for (const sid of scheduleIds) {
            const ok = await assignToGroup(sid, groupId);
            if (ok) added++;
            else skipped++;
          }

          if (skipped > 0 && added > 0) {
            onMessage('success', `已加入 ${added} 个（${skipped} 个已在组中）`);
          } else if (skipped > 0) {
            onMessage('warning', '所选操作已在该组中');
          } else {
            onMessage('success', '已加入共享组');
          }

          await fetchGroups();
          onDataChange?.();
        } catch {
          onMessage('error', '加入共享组失败');
        }
        return;
      }

      // share-highlight-{groupId} → toggle highlight
      if (actionKey.startsWith('share-highlight-')) {
        const groupId = parseInt(actionKey.replace('share-highlight-', ''), 10);
        if (Number.isFinite(groupId)) {
          toggleHighlight(groupId);
        }
        return;
      }

      // share-remove-{groupId} → remove task from group
      if (actionKey.startsWith('share-remove-')) {
        const groupId = parseInt(actionKey.replace('share-remove-', ''), 10);
        if (!Number.isFinite(groupId)) return;

        const scheduleIds = resolveScheduleIds();
        try {
          for (const sid of scheduleIds) {
            await removeFromGroup(sid, groupId);
          }
          onMessage('success', '已移出共享组');
          await fetchGroups();
          onDataChange?.();
        } catch {
          onMessage('error', '移出共享组失败');
        }
        return;
      }
    },
    [
      openCreateModal,
      assignToGroup,
      removeFromGroup,
      toggleHighlight,
      fetchGroups,
      onDataChange,
      onMessage,
    ]
  );

  // ===== Refresh =====
  const refresh = useCallback(async () => {
    await fetchGroups();
  }, [fetchGroups]);

  return {
    shareGroups,
    loading,
    highlightedGroupId,
    highlightedLinkIds,
    modalState,
    openCreateModal,
    openEditModal,
    closeModal,
    submitModal,
    buildShareMenuItems,
    handleShareAction,
    toggleHighlight,
    clearHighlight,
    refresh,
  };
}
