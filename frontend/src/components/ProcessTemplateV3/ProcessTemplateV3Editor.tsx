/**
 * ProcessTemplateV3Editor — 全屏甘特图编辑器
 *
 * 以 WxbGanttChart 为核心，集成 ganttAdapter、useGanttData、
 * useShareGroupService、useV3EditorActions。
 */

import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { message } from 'antd';
import axios from 'axios';
import { WxbGanttChart } from '../wxb-ui';
import { WxbSkeleton, WxbEmpty } from '../wxb-ui';
import { WxbCard } from '../wxb-ui';
import type { GanttTask, YAxisMode } from '../wxb-ui/GanttChart/types';
import type { ContextMenuItem } from '../wxb-ui/GanttChart/GanttContextMenu';
import { processTemplateV2Api } from '../../services';
import type { ProcessTemplate, GanttNode, StageOperation } from '../ProcessTemplateGantt/types';
import { useGanttData } from '../ProcessTemplateGantt/hooks/useGanttData';
import { useShareGroupService } from '../ProcessTemplateGantt/useShareGroupService';
import WxbShareGroupModal from '../ProcessTemplateGantt/components/WxbShareGroupModal';
import {
  toGanttTasks,
  toGanttGroups,
  toGanttDeps,
  toGanttLinks,
} from '../ProcessTemplateGantt/ganttAdapter';
import { useV3EditorActions } from './useV3EditorActions';
import { useResourceView } from './useResourceView';
import V3EditorHeader from './V3EditorHeader';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcessTemplateV3EditorProps {
  templateId: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all operation-type GanttNodes from the tree and map to the
 * operations list needed by useShareGroupService.
 */
function collectOperations(
  nodes: GanttNode[],
  parentStageName?: string,
): Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }> {
  const result: Array<{ scheduleId: number; operationName: string; stageName: string; requiredPeople: number }> = [];

  for (const node of nodes) {
    if (node.type === 'operation') {
      const opData = node.data as StageOperation | undefined;
      if (opData) {
        result.push({
          scheduleId: opData.id,
          operationName: opData.operation_name ?? node.title,
          stageName: parentStageName ?? '',
          requiredPeople: opData.required_people ?? 1,
        });
      }
    }
    if (node.children) {
      const stageName = node.type === 'stage' ? node.title : parentStageName;
      result.push(...collectOperations(node.children, stageName));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ProcessTemplateV3Editor: React.FC<ProcessTemplateV3EditorProps> = ({ templateId }) => {
  // ---- Template metadata ----
  const [template, setTemplate] = useState<ProcessTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);
  const [showTimeWindows, setShowTimeWindows] = useState(false); // default off
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>('operation');

  // ---- Equipment binding state ----
  const [equipmentNodes, setEquipmentNodes] = useState<Array<{
    id: number; nodeName: string; equipmentSystemType: string | null; equipmentClass: string | null;
  }>>([]);
  const [showCreateEquipModal, setShowCreateEquipModal] = useState(false);
  const [newEquipName, setNewEquipName] = useState('');
  const [newEquipSystemType, setNewEquipSystemType] = useState<string>('SUS');
  const [newEquipClass, setNewEquipClass] = useState('');
  const [pendingBindTask, setPendingBindTask] = useState<GanttTask | null>(null);
  const [bindDropdownOpen, setBindDropdownOpen] = useState(false);
  const bindDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setTemplateLoading(true);
        const data = await processTemplateV2Api.getTemplate(templateId);
        if (!cancelled) {
          setTemplate({
            id: data.id,
            template_code: data.template_code,
            template_name: data.template_name,
            description: data.description,
            total_days: data.total_days,
            team_id: data.team_id,
            team_code: data.team_code,
            team_name: data.team_name,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          message.error(err?.response?.data?.error || '加载工艺模版失败');
          setTemplate(null);
        }
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [templateId]);

  // ---- Load equipment node list ----
  const refreshEquipmentNodes = useCallback(async () => {
    try {
      const all = await processTemplateV2Api.listResourceNodes();
      setEquipmentNodes(
        all.filter((n: any) => n.nodeClass === 'EQUIPMENT_UNIT' && n.isActive)
          .map((n: any) => ({
            id: n.id, nodeName: n.nodeName,
            equipmentSystemType: n.equipmentSystemType, equipmentClass: n.equipmentClass,
          })),
      );
    } catch (err) {
      console.error('Failed to load equipment nodes:', err);
    }
  }, []);

  useEffect(() => { void refreshEquipmentNodes(); }, [refreshEquipmentNodes]);

  // ---- Close bind dropdown on outside click ----
  useEffect(() => {
    if (!bindDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (bindDropdownRef.current && !bindDropdownRef.current.contains(e.target as Node))
        setBindDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [bindDropdownOpen]);

  // ---- Gantt data (stages → nodes → timeBlocks) ----
  const ganttData = useGanttData(
    template ?? { id: 0, template_code: '', template_name: '', description: '', total_days: 0 },
  );

  // ---- Editor actions (drag / resize / delete / auto-schedule) ----
  const actions = useV3EditorActions({
    templateId,
    ganttNodes: ganttData.ganttNodes,
    refreshData: ganttData.refreshData,
  });

  // ---- Operations list for share group modal (from ganttNodes tree) ----
  const operationsList = useMemo(
    () => collectOperations(ganttData.ganttNodes),
    [ganttData.ganttNodes],
  );

  // ---- Share group service ----
  const shareService = useShareGroupService({
    templateId,
    operations: operationsList,
    onDataChange: () => {
      void ganttData.refreshData();
      void actions.refreshAll();
    },
    onMessage: (_type, text) => {
      if (_type === 'error') message.error(text);
      else if (_type === 'warning') message.warning(text);
      else message.success(text);
    },
  });

  // ---- Gantt adapter (memo-ized transforms) ----
  const rawTasks = useMemo(
    () => toGanttTasks(ganttData.timeBlocks, ganttData.ganttNodes, {
      shareGroups: shareService.shareGroups,
      mergeTimeWindows: true,
    }),
    [ganttData.timeBlocks, ganttData.ganttNodes, shareService.shareGroups],
  );

  // Strip window data when toggle is off
  const tasks = useMemo(() => {
    if (showTimeWindows) return rawTasks;
    return rawTasks.map(t =>
      t.windowStart !== undefined || t.windowEnd !== undefined
        ? { ...t, windowStart: undefined, windowEnd: undefined }
        : t
    );
  }, [rawTasks, showTimeWindows]);

  const groups = useMemo(
    () => toGanttGroups(ganttData.ganttNodes),
    [ganttData.ganttNodes],
  );

  const dependencies = useMemo(
    () => toGanttDeps(actions.constraints),
    [actions.constraints],
  );

  const links = useMemo(
    () => toGanttLinks(shareService.shareGroups),
    [shareService.shareGroups],
  );

  // ---- Resource view (equipment-centric grouping) ----
  const resourceView = useResourceView(
    templateId, ganttData.ganttNodes, tasks, groups, yAxisMode,
  );

  // Select data source based on yAxisMode
  const finalTasks = yAxisMode === 'operation' ? tasks : resourceView.resourceTasks;
  const finalGroups = yAxisMode === 'operation' ? groups : resourceView.resourceGroups;

  // In resource view, only show dependencies for hovered task (otherwise too dense)
  const finalDependencies = yAxisMode === 'operation' ? dependencies : [];

  // ---- Callbacks ----
  const handleTaskEdit = useCallback((task: GanttTask) => {
    // For now, log and show info — full inspector panel is a future enhancement
    message.info(`编辑 ${task.label} (ID: ${task.id})`);
  }, []);

  const handleTaskDelete = useCallback(
    async (task: GanttTask) => {
      await actions.handleDeleteTask(task.id);
    },
    [actions],
  );

  const handleContextAction = useCallback(
    async (action: string, task: GanttTask | null) => {
      if (!task) return;

      // ---- Equipment binding actions ----
      if (action.startsWith('bind-equip-')) {
        const nodeId = Number(action.replace('bind-equip-', ''));
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        try {
          await processTemplateV2Api.batchUpdateBindings([scheduleId], nodeId, 'PRIMARY');
          const equipName = equipmentNodes.find(n => n.id === nodeId)?.nodeName || '';
          message.success(`已绑定到 ${equipName}`);
          await resourceView.refreshBindings();
        } catch (err: any) {
          message.error(err?.response?.data?.error || '绑定失败');
        }
        return;
      }
      if (action === 'unbind-equip') {
        const scheduleId = task.data?.scheduleId as number | undefined;
        if (!scheduleId) return;
        try {
          await processTemplateV2Api.batchUpdateBindings([scheduleId], null, 'PRIMARY');
          message.success('已解除设备绑定');
          await resourceView.refreshBindings();
        } catch (err: any) {
          message.error('解除绑定失败');
        }
        return;
      }
      if (action === 'create-equip') {
        setShowCreateEquipModal(true);
        setPendingBindTask(task);
        return;
      }

      // Route share-* actions to share service
      if (action.startsWith('share-')) {
        void shareService.handleShareAction(action, task);
        return;
      }

      switch (action) {
        case 'edit':
          handleTaskEdit(task);
          break;
        case 'delete':
          void handleTaskDelete(task);
          break;
        default:
          break;
      }
    },
    [shareService, handleTaskEdit, handleTaskDelete, equipmentNodes, resourceView],
  );

  // ---- Build final task menu including share sub-items + equipment ----
  const buildTaskMenu = useCallback(
    (task: GanttTask): ContextMenuItem[] => {
      const scheduleId = task.data?.scheduleId as number | undefined;
      const currentBinding = scheduleId
        ? resourceView.getBindingForSchedule(scheduleId)
        : null;

      const equipLabel = (n: typeof equipmentNodes[0]) => {
        const parts = [n.nodeName];
        if (n.equipmentSystemType || n.equipmentClass) {
          parts.push(`(${[n.equipmentSystemType, n.equipmentClass].filter(Boolean).join(' · ')})`)
        }
        return parts.join(' ');
      };

      const bindChildren: ContextMenuItem[] = [
        ...equipmentNodes.map(node => ({
          key: `bind-equip-${node.id}`,
          label: equipLabel(node),
          icon: currentBinding?.resourceNodeId === node.id
            ? React.createElement('span', { style: { color: '#52c41a', fontWeight: 'bold' } }, '✓')
            : undefined,
        })),
        { key: 'div-unbind', label: '—', divider: true },
        { key: 'unbind-equip', label: '解除绑定', danger: true, disabled: !currentBinding },
        { key: 'div-create', label: '—', divider: true },
        { key: 'create-equip', label: '+ 新建设备...' },
      ];

      const baseItems: ContextMenuItem[] = [
        { key: 'edit', label: '编辑操作' },
        { key: 'bind-equipment', label: currentBinding ? `设备: ${currentBinding.name}` : '绑定设备', children: bindChildren },
        { key: 'delete', label: '删除操作', danger: true },
        { key: 'divider-share', label: '—', divider: true },
      ];
      const shareItems = shareService.buildShareMenuItems(task);
      return [...baseItems, ...shareItems];
    },
    [shareService, equipmentNodes, resourceView],
  );

  // ---- One-click link from SelectionPanel ----
  const handleQuickLink = useCallback(
    async (selectedTaskIds: string[]) => {
      const scheduleIds = selectedTaskIds
        .map(id => parseInt(id.replace(/\D/g, ''), 10))
        .filter(Number.isFinite);
      if (scheduleIds.length < 2) {
        message.warning('至少选择 2 个操作才能创建共享组');
        return;
      }

      // Auto-name: first 2 operation names + count
      const allOps = collectOperations(ganttData.ganttNodes);
      const names = scheduleIds.slice(0, 2)
        .map(sid => allOps.find(op => op.scheduleId === sid)?.operationName)
        .filter(Boolean);
      const autoName = names.join(' + ') + (scheduleIds.length > 2 ? ` +${scheduleIds.length - 2}` : '');

      try {
        await axios.post(`/api/share-groups/template/${templateId}`, {
          group_name: autoName || '共享组',
          share_mode: 'SAME_TEAM',
          member_ids: scheduleIds,
        });
        message.success('已链接为共享');
        await shareService.refresh();
        await ganttData.refreshData();
      } catch (err: any) {
        message.error(err?.response?.data?.error || '创建共享组失败');
      }
    },
    [templateId, ganttData, shareService],
  );

  // ---- Batch bind from selection panel ----
  const handleBatchBind = useCallback(async (nodeId: number) => {
    const scheduleIds = Array.from(document.querySelectorAll('[data-selected-task-id]'))
      .map(el => parseInt(el.getAttribute('data-selected-task-id') || '', 10))
      .filter(Number.isFinite);
    // Fallback: use the gantt internal selection if the above approach fails
    // This will be populated via the selectionPanelExtraActions render
    if (!scheduleIds.length) return;
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, nodeId, 'PRIMARY');
      const name = equipmentNodes.find(n => n.id === nodeId)?.nodeName || '';
      message.success(`已绑定 ${scheduleIds.length} 个操作到 ${name}`);
      setBindDropdownOpen(false);
      await resourceView.refreshBindings();
    } catch (err: any) {
      message.error(err?.response?.data?.error || '批量绑定失败');
    }
  }, [equipmentNodes, resourceView]);

  const handleBatchUnbind = useCallback(async (taskIds: string[]) => {
    const scheduleIds = taskIds
      .map(id => parseInt(id.replace(/\D/g, ''), 10))
      .filter(Number.isFinite);
    if (!scheduleIds.length) return;
    try {
      await processTemplateV2Api.batchUpdateBindings(scheduleIds, null, 'PRIMARY');
      message.success(`已解除 ${scheduleIds.length} 个操作的设备绑定`);
      setBindDropdownOpen(false);
      await resourceView.refreshBindings();
    } catch (err: any) {
      message.error('解除绑定失败');
    }
  }, [resourceView]);

  // ---- Create equipment handler ----
  const handleCreateEquipment = useCallback(async () => {
    if (!newEquipName.trim()) { message.warning('请输入设备名称'); return; }
    try {
      // Find the first ROOM node as parent (fallback to ID 11)
      const allNodes = await processTemplateV2Api.listResourceNodes();
      const firstRoom = allNodes.find((n: any) => n.nodeClass === 'ROOM' && n.nodeSubtype === 'MAIN_PROCESS');
      const parentId = firstRoom ? (firstRoom as any).id : 11;

      const newId = await processTemplateV2Api.createResourceNode({
        nodeName: newEquipName.trim(),
        nodeClass: 'EQUIPMENT_UNIT',
        parentId,
        equipmentSystemType: newEquipSystemType as any,
        equipmentClass: newEquipClass || undefined,
        nodeScope: 'DEPARTMENT',
        departmentCode: 'USP',
      } as any);
      await refreshEquipmentNodes();

      if (pendingBindTask) {
        const sid = pendingBindTask.data?.scheduleId as number | undefined;
        if (sid) {
          await processTemplateV2Api.batchUpdateBindings([sid], newId, 'PRIMARY');
          await resourceView.refreshBindings();
          message.success(`已创建设备 ${newEquipName} 并绑定`);
        }
      } else {
        message.success(`设备 ${newEquipName} 已创建`);
      }
      setShowCreateEquipModal(false);
      setNewEquipName(''); setNewEquipClass(''); setPendingBindTask(null);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '创建设备失败');
    }
  }, [newEquipName, newEquipSystemType, newEquipClass, pendingBindTask, resourceView, refreshEquipmentNodes]);

  // ---- Loading / error states ----
  if (templateLoading) {
    return (
      <div style={{ padding: 48 }}>
        <WxbCard><WxbSkeleton rows={6} /></WxbCard>
      </div>
    );
  }

  if (!template) {
    return (
      <div style={{ padding: 48 }}>
        <WxbCard style={{ padding: 64 }}>
          <WxbEmpty description="无法加载工艺模版，请返回列表重试。" />
        </WxbCard>
      </div>
    );
  }


  // ---- Main render ----
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 120px)',
        margin: '-24px',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <V3EditorHeader
        templateCode={template.template_code}
        templateName={template.template_name}
        teamName={template.team_name ?? null}
        totalDays={template.total_days}
        loading={actions.loading}
        showTimeWindows={showTimeWindows}
        onToggleTimeWindows={setShowTimeWindows}
        onAutoSchedule={actions.handleAutoSchedule}
        yAxisMode={yAxisMode}
        onYAxisModeChange={setYAxisMode}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <WxbGanttChart
          tasks={finalTasks}
          groups={finalGroups}
          dependencies={finalDependencies}
          links={links}
          highlightedLinkIds={shareService.highlightedLinkIds}
          taskMenuBuilder={buildTaskMenu}
          onTaskDragEnd={actions.handleDragEnd}
          onTaskResizeEnd={actions.handleResizeEnd}
          onTaskEdit={handleTaskEdit}
          onTaskDelete={handleTaskDelete}
          onContextAction={handleContextAction}
          showSelectionPanel
          onCreateShareGroup={handleQuickLink}
          selectionPanelExtraActions={(
            <div ref={bindDropdownRef} style={{ position: 'relative', width: '100%' }}>
              <button
                className="wxb-gantt-sel-share-btn"
                onClick={() => setBindDropdownOpen(v => !v)}
                style={{ width: '100%', padding: '6px 10px', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4,
                  color: '#e0e0e0', fontSize: 12, textAlign: 'center' }}
              >
                🔗 绑定到设备 ▾
              </button>
              {bindDropdownOpen && (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0,
                  marginBottom: 4, background: '#1a2332', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, padding: '4px 0', maxHeight: 240, overflowY: 'auto',
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.4)', zIndex: 1000 }}>
                  {equipmentNodes.map(node => (
                    <div key={node.id}
                      onClick={() => void handleBatchBind(node.id)}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                        color: '#e0e0e0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {node.nodeName}
                      {(node.equipmentSystemType || node.equipmentClass) &&
                        <span style={{ marginLeft: 6, color: '#8898a8', fontSize: 11 }}>
                          ({[node.equipmentSystemType, node.equipmentClass].filter(Boolean).join(' · ')})
                        </span>
                      }
                    </div>
                  ))}
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
                  <div
                    onClick={() => { setShowCreateEquipModal(true); setBindDropdownOpen(false); setPendingBindTask(null); }}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12, color: '#4fc3f7' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    + 新建设备...
                  </div>
                </div>
              )}
            </div>
          )}
          enableFullscreen
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Share Group Modal */}
      <WxbShareGroupModal
        visible={shareService.modalState.visible}
        templateId={templateId}
        group={shareService.modalState.editingGroup}
        operations={operationsList}
        preSelectedIds={shareService.modalState.preSelectedIds}
        onCancel={shareService.closeModal}
        onSubmit={shareService.submitModal}
      />

      {/* Create Equipment Modal */}
      {showCreateEquipModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex',
          alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreateEquipModal(false); setPendingBindTask(null); } }}>
          <div style={{ background: '#1a2332', borderRadius: 12, padding: 24, width: 400,
            border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <h3 style={{ color: '#e0e0e0', margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
              新建设备
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ color: '#8898a8', fontSize: 12, display: 'block', marginBottom: 4 }}>设备名称 *</label>
                <input
                  value={newEquipName}
                  onChange={e => setNewEquipName(e.target.value)}
                  placeholder="例如: BR-201"
                  style={{ width: '100%', padding: '8px 12px', background: '#0f1923',
                    border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                    color: '#e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8898a8', fontSize: 12, display: 'block', marginBottom: 4 }}>材质系统</label>
                  <select
                    value={newEquipSystemType}
                    onChange={e => setNewEquipSystemType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', background: '#0f1923',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      color: '#e0e0e0', fontSize: 13, outline: 'none' }}>
                    <option value="SUS">SUS (一次性)</option>
                    <option value="SS">SS (不锈钢)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#8898a8', fontSize: 12, display: 'block', marginBottom: 4 }}>设备类别</label>
                  <input
                    value={newEquipClass}
                    onChange={e => setNewEquipClass(e.target.value)}
                    placeholder="例如: REACTOR"
                    style={{ width: '100%', padding: '8px 12px', background: '#0f1923',
                      border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
                      color: '#e0e0e0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                onClick={() => { setShowCreateEquipModal(false); setPendingBindTask(null); }}
                style={{ padding: '8px 16px', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6,
                  color: '#8898a8', fontSize: 13, cursor: 'pointer' }}>
                取消
              </button>
              <button
                onClick={() => void handleCreateEquipment()}
                style={{ padding: '8px 16px',
                  background: 'linear-gradient(135deg, #0d47a1 0%, #1565c0 100%)',
                  border: 'none', borderRadius: 6,
                  color: '#e0e0e0', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                {pendingBindTask ? '创建并绑定' : '创建设备'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessTemplateV3Editor;
