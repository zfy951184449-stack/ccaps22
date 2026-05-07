/**
 * 节点详情检查器 Drawer — 可编辑版
 * Tab: 基本信息 / 影响操作 / CIP清洗 / 资源绑定
 */
import React, { useMemo } from 'react';
import {
  WxbDrawer,
  WxbButton,
  WxbKpiCard,
  WxbTabs,
  WxbDescriptions,
  WxbTag,
  WxbPopconfirm,
  WxbEmpty,
  WxbSelect,
  WxbDivider,
} from '../wxb-ui';
import type { ResourceNode, PlannerOperation } from '../ProcessTemplateV2/types';
import type { Resource } from '../../types/resourceModel';
import type { WxbTagColor } from './resourceNodeConstants';
import { NODE_CLASS_LABEL, NODE_CLASS_COLOR, BINDABLE_CLASSES } from './resourceNodeConstants';
import CipRelationManager from './CipRelationManager';

interface EquipmentDetailDrawerProps {
  node: ResourceNode | null;
  open: boolean;
  nodePath: string;
  allNodes: ResourceNode[];
  nodeMap: Map<number, ResourceNode>;
  impactOps: PlannerOperation[];
  availableResources: Resource[];
  childBlueprintsCount: number;
  onClose: () => void;
  onEdit: (node: ResourceNode) => void;
  onCreateChild: (parent: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
  onBindResource: (nodeId: number, resourceId: number | null) => void;
}

const EquipmentDetailDrawer: React.FC<EquipmentDetailDrawerProps> = ({
  node,
  open,
  nodePath,
  allNodes,
  nodeMap,
  impactOps,
  availableResources,
  childBlueprintsCount,
  onClose,
  onEdit,
  onCreateChild,
  onDelete,
  onToggleActive,
  onBindResource,
}) => {
  // ALL hooks must be called unconditionally — before any early return
  const nodeColor: WxbTagColor = node ? (NODE_CLASS_COLOR[node.nodeClass] ?? 'neutral') : 'neutral';

  /* ── Info items ── */
  const infoItems = useMemo(() => {
    if (!node) return [];
    return [
      { label: '节点名称', value: node.nodeName, span: 2 },
      { label: '节点编号', value: node.nodeCode, span: 2 },
      {
        label: '节点类型',
        value: (
          <WxbTag color={nodeColor}>
            {NODE_CLASS_LABEL[node.nodeClass]}
          </WxbTag>
        ),
      },
      {
        label: '子类型',
        value: node.nodeSubtype ? <WxbTag>{node.nodeSubtype}</WxbTag> : '—',
      },
      {
        label: '节点域',
        value: node.nodeScope === 'GLOBAL' ? '全局共享' : '部门域',
      },
      { label: '所属部门', value: node.departmentCode || '—' },
      ...(node.nodeClass === 'EQUIPMENT_UNIT'
        ? [
            {
              label: '系统类型',
              value: node.equipmentSystemType ? (
                <WxbTag color={node.equipmentSystemType === 'SUS' ? 'green' : node.equipmentSystemType === 'VIRTUAL' ? 'amber' : 'blue'}>
                  {node.equipmentSystemType}
                </WxbTag>
              ) : '—',
            },
            { label: '设备类别', value: node.equipmentClass || '—' },
            { label: '设备型号', value: node.equipmentModel || '—' },
          ]
        : []),
      { label: '排序权重', value: String(node.sortOrder) },
      {
        label: '激活状态',
        value: (
          <span className="equip-status-inline">
            <span className={`equip-status-dot ${node.isActive ? 'is-active' : 'is-inactive'}`} />
            {node.isActive ? '运行中' : '已停用'}
          </span>
        ),
      },
      {
        label: '层级路径',
        value: nodePath || '—',
        span: 2,
      },
      {
        label: '绑定资源',
        value: node.boundResourceCode
          ? `${node.boundResourceName} (${node.boundResourceCode})`
          : '未绑定',
        span: 2,
      },
    ];
  }, [node, nodeColor, nodePath]);

  /* ── Resource binding section ── */
  const resourceBindingSection = useMemo(() => {
    if (!node) return null;
    if (!BINDABLE_CLASSES.has(node.nodeClass)) {
      return (
        <div className="equip-detail-placeholder">
          <p>当前节点类型不支持资源绑定</p>
        </div>
      );
    }

    const resourceOptions = availableResources.map((r) => ({
      label: `${r.resourceName} (${r.resourceCode})`,
      value: String(r.id),
    }));

    return (
      <div className="equip-resource-bind">
        <WxbSelect
          value={node.boundResourceId ? String(node.boundResourceId) : undefined}
          onChange={(v) => onBindResource(node.id, v ? Number(v) : null)}
          options={resourceOptions}
          placeholder="选择要绑定的资源..."
          allowClear
          style={{ width: '100%' }}
        />
        <p className="equip-resource-hint">
          可绑定资源 {availableResources.length} 个
        </p>
      </div>
    );
  }, [availableResources, node, onBindResource]);

  /* ── Impact operations tab ── */
  const impactOpsTab = useMemo(() => {
    if (!impactOps.length) {
      return <WxbEmpty description="无绑定操作" />;
    }
    return (
      <div className="equip-impact-list">
        {impactOps.map((op, idx) => (
          <div key={idx} className="equip-impact-item">
            <span className="equip-impact-name">{op.operation_name || op.operation_code}</span>
            <WxbTag color="blue">{op.operation_code}</WxbTag>
          </div>
        ))}
      </div>
    );
  }, [impactOps]);

  /* ── CIP tab ── */
  const cipTab = useMemo(() => {
    if (!node) return null;
    if (node.nodeClass === 'UTILITY_STATION' && node.nodeSubtype === 'CIP') {
      return <CipRelationManager node={node} allNodes={allNodes} />;
    }
    return (
      <div className="equip-detail-placeholder">
        <p>仅 CIP 类型工作站可管理清洗关系</p>
      </div>
    );
  }, [allNodes, node]);

  // Early return AFTER all hooks
  if (!node) return null;

  /* ── Tabs ── */
  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <>
          <WxbDescriptions items={infoItems} columns={2} bordered />
          <WxbDivider />
          <div className="equip-detail-section-title">资源绑定</div>
          {resourceBindingSection}
        </>
      ),
    },
    {
      key: 'impact',
      label: `影响操作 (${impactOps.length})`,
      children: impactOpsTab,
    },
    {
      key: 'cip',
      label: 'CIP清洗',
      children: cipTab,
    },
  ];

  return (
    <WxbDrawer
      open={open}
      onClose={onClose}
      width={520}
      title={null}
      closable
      destroyOnClose
    >
      {/* Header */}
      <div className="equip-detail-header">
        <div className="equip-detail-title-row">
          <WxbTag color={nodeColor} className="equip-detail-type-tag">
            {NODE_CLASS_LABEL[node.nodeClass]}
          </WxbTag>
          <span className="equip-detail-name">{node.nodeName}</span>
          <span className={`equip-detail-status ${node.isActive ? 'is-active' : 'is-inactive'}`}>
            <span className={`equip-status-dot ${node.isActive ? 'is-active' : 'is-inactive'}`} />
            {node.isActive ? '运行中' : '已停用'}
          </span>
        </div>
        <div className="equip-detail-code">{node.nodeCode}</div>
        {nodePath && (
          <div className="equip-detail-path">{nodePath}</div>
        )}
      </div>

      {/* Actions */}
      <div className="equip-detail-actions">
        <WxbButton variant="secondary" size="sm" onClick={() => onEdit(node)}>
          编辑
        </WxbButton>
        {childBlueprintsCount > 0 && (
          <WxbButton variant="secondary" size="sm" onClick={() => onCreateChild(node)}>
            新增子节点
          </WxbButton>
        )}
        <WxbButton variant="secondary" size="sm" onClick={() => onToggleActive(node)}>
          {node.isActive ? '停用' : '启用'}
        </WxbButton>
        <WxbPopconfirm
          title="确定删除此节点？"
          description={node.childCount > 0 ? '该节点有子节点，请先处理子节点。' : '此操作不可撤销。'}
          onConfirm={() => onDelete(node)}
          disabled={node.childCount > 0}
        >
          <WxbButton
            variant="ghost"
            size="sm"
            className="wxb-btn-danger-text"
            disabled={node.childCount > 0}
          >
            删除
          </WxbButton>
        </WxbPopconfirm>
      </div>

      {/* KPI Grid */}
      <div className="equip-detail-kpi-grid">
        <WxbKpiCard title="子节点" value={node.childCount} />
        <WxbKpiCard title="所属部门" value={node.departmentCode || '全局'} />
        <WxbKpiCard title="影响操作" value={impactOps.length} />
        <WxbKpiCard
          title="资源绑定"
          value={node.boundResourceId ? '已绑定' : '未绑定'}
        />
      </div>

      {/* Tabs */}
      <WxbTabs items={tabItems} defaultActiveKey="info" />
    </WxbDrawer>
  );
};

export default EquipmentDetailDrawer;
