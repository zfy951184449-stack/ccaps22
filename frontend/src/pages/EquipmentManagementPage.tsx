/**
 * 工厂资源节点管理 — 独立页面入口
 * 支持三种视图：卡片 / 表格 / 树
 */
import React, { useState, useCallback } from 'react';
import { message } from 'antd';
import {
  WxbSearchInput,
  WxbSegmented,
  WxbButton,
  WxbPopconfirm,
  WxbSelect,
  WxbKpiCard,
  WxbTree,
  WxbTag,
  WxbAlert,
  WxbSpinner,
} from '../components/wxb-ui';
import { useEquipmentManager } from '../components/EquipmentManagement/useEquipmentManager';
import EquipmentCardView from '../components/EquipmentManagement/EquipmentCardView';
import EquipmentTableView from '../components/EquipmentManagement/EquipmentTableView';
import EquipmentDetailDrawer from '../components/EquipmentManagement/EquipmentDetailDrawer';
import EquipmentEditModal from '../components/EquipmentManagement/EquipmentEditModal';
import type { FormMode } from '../components/EquipmentManagement/EquipmentEditModal';
import type { ResourceNode, ResourceNodeClass } from '../components/ProcessTemplateV2/types';
import {
  NODE_CLASS_LABEL,
  NODE_CLASS_OPTIONS,
  NODE_CLASS_COLOR,
  filterNodesByQuery,
} from '../components/EquipmentManagement/resourceNodeConstants';
import './EquipmentManagementPage.css';

/* ── SVG Icons ─────────────────────────────────────────── */

const GridIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1" />
    <rect x="9" y="1" width="6" height="6" rx="1" />
    <rect x="1" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
);

const ListIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="2" width="14" height="2.5" rx="0.5" />
    <rect x="1" y="6.5" width="14" height="2.5" rx="0.5" />
    <rect x="1" y="11" width="14" height="2.5" rx="0.5" />
  </svg>
);

const TreeIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 2v12M4 5h4M4 9h6M4 13h3" />
    <circle cx="10" cy="5" r="1.5" fill="currentColor" /><circle cx="12" cy="9" r="1.5" fill="currentColor" /><circle cx="9" cy="13" r="1.5" fill="currentColor" />
  </svg>
);

const RefreshIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 8a6.5 6.5 0 0 1 11.3-4.4M14.5 8a6.5 6.5 0 0 1-11.3 4.4" />
    <path d="M12.8 1v2.6h-2.6M3.2 15v-2.6h2.6" />
  </svg>
);

const DownloadIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M8 2v8M5 7l3 3 3-3M3 12h10" />
  </svg>
);

/* ── Tree data builder ── */

const toTreeData = (nodes: ResourceNode[]): any[] =>
  nodes.map((node) => ({
    key: node.id,
    title: (
      <span className="equip-tree-title">
        <WxbTag color={NODE_CLASS_COLOR[node.nodeClass]}>{NODE_CLASS_LABEL[node.nodeClass]}</WxbTag>
        <span className="equip-tree-name">{node.nodeName}</span>
        {node.nodeSubtype && <WxbTag>{node.nodeSubtype}</WxbTag>}
        {!node.isActive && <WxbTag color="red">停用</WxbTag>}
      </span>
    ),
    children: toTreeData(node.children),
  }));

/* ── Page Component ── */

const EquipmentManagementPage: React.FC = () => {
  const mgr = useEquipmentManager();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<ResourceNode | null>(null);
  const [formMode, setFormMode] = useState<FormMode>('edit');

  /* ── Handlers ──────────────────────────────────────── */
  const handleSelectNode = useCallback(
    (nodeId: number) => {
      mgr.setSelectedNodeId(nodeId);
      setDrawerOpen(true);
    },
    [mgr],
  );

  const handleEdit = useCallback((node: ResourceNode) => {
    setEditingNode(node);
    setFormMode('edit');
    setEditModalOpen(true);
  }, []);

  const handleCreateRoot = useCallback(() => {
    setEditingNode(null);
    setFormMode('create-root');
    setEditModalOpen(true);
  }, []);

  const handleCreateChild = useCallback((parent: ResourceNode) => {
    setEditingNode(null);
    mgr.setSelectedNodeId(parent.id);
    setFormMode('create-child');
    setEditModalOpen(true);
  }, [mgr]);

  const handleDelete = useCallback(
    async (node: ResourceNode) => {
      if (node.childCount > 0) {
        message.warning('该节点有子节点，请先删除子节点');
        return;
      }
      try {
        await mgr.deleteNode(node.id);
        setDrawerOpen(false);
        message.success('节点已删除');
      } catch (err: any) {
        message.error(err?.response?.data?.error || '删除失败');
      }
    },
    [mgr],
  );

  const handleToggleActive = useCallback(
    async (node: ResourceNode) => {
      try {
        await mgr.toggleActive(node.id, !node.isActive);
        message.success(node.isActive ? '节点已停用' : '节点已启用');
      } catch {
        message.error('操作失败');
      }
    },
    [mgr],
  );

  const handleBatchToggleActive = useCallback(
    async (ids: number[], isActive: boolean) => {
      try {
        await mgr.batchToggleActive(ids, isActive);
        message.success(`已批量${isActive ? '启用' : '停用'} ${ids.length} 个节点`);
      } catch {
        message.error('批量操作失败');
      }
    },
    [mgr],
  );

  const handleBatchDelete = useCallback(
    async (ids: number[]) => {
      try {
        await mgr.batchDelete(ids);
        message.success(`已批量删除 ${ids.length} 个节点`);
      } catch (err: any) {
        message.error(err?.message || '批量删除失败');
      }
    },
    [mgr],
  );

  const handleBindResource = useCallback(
    async (nodeId: number, resourceId: number | null) => {
      try {
        await mgr.bindResource(nodeId, resourceId);
        message.success(resourceId ? '资源已绑定' : '资源已解绑');
      } catch {
        message.error('绑定操作失败');
      }
    },
    [mgr],
  );

  const handleExport = useCallback(() => {
    mgr.exportBackup();
    message.success('节点数据已导出');
  }, [mgr]);

  const handleClearRebuild = useCallback(async () => {
    try {
      await mgr.clearForRebuild();
      message.success('节点树已清空');
    } catch (err: any) {
      message.error(err?.response?.data?.error || '清空失败');
    }
  }, [mgr]);

  const handleTreeDrop = useCallback(
    async (info: any) => {
      const dragNodeId = Number(info.dragNode.key);
      const dropNodeId = Number(info.node.key);
      const dropNode = mgr.allNodes.find((n) => n.id === dropNodeId);
      if (!dropNode || dragNodeId === dropNodeId) return;

      try {
        if (info.dropToGap) {
          await mgr.moveNode(dragNodeId, dropNode.parentId ?? null, dropNode.sortOrder);
        } else {
          await mgr.moveNode(dragNodeId, dropNode.id);
        }
        message.success('节点层级已更新');
      } catch (err: any) {
        message.error(err?.response?.data?.error || '移动节点失败');
      }
    },
    [mgr],
  );

  /* ── Loading / Error ── */
  if (mgr.loading) {
    return (
      <div className="equip-page equip-page-loading">
        <WxbSpinner />
        <span>加载资源节点...</span>
      </div>
    );
  }

  if (mgr.errorMessage) {
    return (
      <div className="equip-page">
        <WxbAlert variant="error">{mgr.errorMessage}</WxbAlert>
      </div>
    );
  }

  /* ── Filter options ────────────────────────────────── */
  const systemTypeOptions = [
    { label: `全部 (${mgr.nodeStats.totalCount})`, value: 'ALL' },
    { label: `SUS (${mgr.nodeStats.susByType})`, value: 'SUS' },
    { label: `SS (${mgr.nodeStats.ssByType})`, value: 'SS' },
  ];

  const nodeClassOptions = [
    { label: '全部类型', value: 'ALL' },
    ...NODE_CLASS_OPTIONS.map((o) => ({
      label: `${o.label} (${mgr.allNodes.filter((n) => n.nodeClass === o.value).length})`,
      value: o.value,
    })),
  ];

  /* ── Tree data ── */
  const treeData = toTreeData(filterNodesByQuery(mgr.nodes, mgr.search));

  /* ── Render ────────────────────────────────────────── */
  return (
    <div className="equip-page">
      {/* Page Header */}
      <div className="equip-page-header">
        <div className="equip-page-title-area">
          <h1 className="equip-page-title">工厂资源节点管理</h1>
          <span className="equip-page-breadcrumb">基础数据 / 资源节点管理</span>
        </div>
        <div className="equip-page-actions">
          <WxbButton variant="primary" onClick={handleCreateRoot}>
            新建根节点
          </WxbButton>
          {mgr.selectedNode && mgr.childBlueprints.length > 0 && (
            <WxbButton variant="secondary" onClick={() => handleCreateChild(mgr.selectedNode!)}>
              新增子节点
            </WxbButton>
          )}
          <WxbButton variant="ghost" onClick={handleExport}>
            <DownloadIcon /> 导出
          </WxbButton>
          <WxbPopconfirm
            title="清空并重建节点树？"
            description="此操作将清空所有节点、模板绑定和 CIP 关系。不可撤销。"
            onConfirm={handleClearRebuild}
          >
            <WxbButton variant="danger" size="sm">
              清空重建
            </WxbButton>
          </WxbPopconfirm>
          <WxbButton variant="ghost" onClick={mgr.refresh}>
            <RefreshIcon /> 刷新
          </WxbButton>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="equip-kpi-grid">
        <WxbKpiCard title="总节点" value={mgr.nodeStats.totalCount} />
        <WxbKpiCard title="房间" value={mgr.nodeStats.roomCount} />
        <WxbKpiCard title="可绑定" value={mgr.nodeStats.bindableCount} />
        <WxbKpiCard title="已绑定资源" value={mgr.nodeStats.mappedResourceCount} />
      </div>

      {/* Toolbar */}
      <div className="equip-toolbar">
        <WxbSearchInput
          value={mgr.search}
          onChange={mgr.setSearch}
          placeholder="搜索名称、编号、资源..."
        />
        <WxbSelect
          value={mgr.nodeClassFilter}
          onChange={(v) => mgr.setNodeClassFilter(v as ResourceNodeClass | 'ALL')}
          options={nodeClassOptions}
          style={{ width: 160 }}
        />
        <WxbSegmented
          options={systemTypeOptions}
          value={mgr.systemTypeFilter}
          onChange={(v) => mgr.setSystemTypeFilter(v as any)}
          size="sm"
        />
        <span className="equip-toolbar-spacer" />
        <div className="equip-view-toggle">
          <button
            className={`equip-view-btn ${mgr.viewMode === 'card' ? 'is-active' : ''}`}
            onClick={() => mgr.setViewMode('card')}
            type="button"
            title="卡片视图"
            aria-label="卡片视图"
          >
            <GridIcon />
          </button>
          <button
            className={`equip-view-btn ${mgr.viewMode === 'table' ? 'is-active' : ''}`}
            onClick={() => mgr.setViewMode('table')}
            type="button"
            title="表格视图"
            aria-label="表格视图"
          >
            <ListIcon />
          </button>
          <button
            className={`equip-view-btn ${mgr.viewMode === 'tree' ? 'is-active' : ''}`}
            onClick={() => mgr.setViewMode('tree')}
            type="button"
            title="树视图"
            aria-label="树视图"
          >
            <TreeIcon />
          </button>
        </div>
      </div>

      {/* Content */}
      {mgr.viewMode === 'card' && (
        <EquipmentCardView
          nodes={mgr.filteredTree}
          selectedNodeId={mgr.selectedNodeId}
          onSelect={handleSelectNode}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onCreateChild={handleCreateChild}
        />
      )}

      {mgr.viewMode === 'table' && (
        <EquipmentTableView
          nodes={mgr.filteredTree}
          selectedNodeId={mgr.selectedNodeId}
          selectedIds={mgr.selectedIds}
          onSelect={handleSelectNode}
          onSelectionChange={mgr.setSelectedIds}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleActive={handleToggleActive}
          onCreateChild={handleCreateChild}
          onBatchToggleActive={handleBatchToggleActive}
          onBatchDelete={handleBatchDelete}
        />
      )}

      {mgr.viewMode === 'tree' && (
        <div className="equip-tree-view">
          <WxbTree
            treeData={treeData}
            selectedKeys={mgr.selectedNodeId ? [mgr.selectedNodeId] : []}
            onSelect={(keys) => {
              if (keys.length) handleSelectNode(Number(keys[0]));
            }}
            draggable
            onDrop={handleTreeDrop}
            defaultExpandAll
            showLine
          />
        </div>
      )}

      {/* Detail Drawer */}
      <EquipmentDetailDrawer
        node={mgr.selectedNode}
        open={drawerOpen}
        nodePath={mgr.selectedNodePath}
        allNodes={mgr.allNodes}
        nodeMap={mgr.nodeMap}
        impactOps={mgr.selectedNodeImpactOps}
        availableResources={mgr.availableResources}
        childBlueprintsCount={mgr.childBlueprints.length}
        onClose={() => setDrawerOpen(false)}
        onEdit={handleEdit}
        onCreateChild={handleCreateChild}
        onDelete={handleDelete}
        onToggleActive={handleToggleActive}
        onBindResource={handleBindResource}
      />

      {/* Edit/Create Modal */}
      <EquipmentEditModal
        open={editModalOpen}
        mode={formMode}
        editingNode={formMode === 'edit' ? editingNode : null}
        parentNode={formMode === 'create-child' ? mgr.selectedNode : null}
        allNodes={mgr.allNodes}
        onCancel={() => setEditModalOpen(false)}
        onCreate={mgr.createNode}
        onUpdate={mgr.updateNode}
      />
    </div>
  );
};

export default EquipmentManagementPage;
