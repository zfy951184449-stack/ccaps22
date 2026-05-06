import React from 'react';
import {
  WxbDrawer,
  WxbButton,
  WxbKpiCard,
  WxbTabs,
  WxbDescriptions,
  WxbTag,
  WxbPopconfirm,
} from '../wxb-ui';
import type { ResourceNode } from '../ProcessTemplateV2/types';

interface EquipmentDetailDrawerProps {
  node: ResourceNode | null;
  open: boolean;
  onClose: () => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
}

const EquipmentDetailDrawer: React.FC<EquipmentDetailDrawerProps> = ({
  node,
  open,
  onClose,
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  if (!node) return null;

  const infoItems = [
    { label: '设备名称', value: node.nodeName, span: 2 },
    { label: '设备编号', value: node.nodeCode, span: 2 },
    {
      label: '系统类型',
      value: node.equipmentSystemType ? (
        <WxbTag color={node.equipmentSystemType === 'SUS' ? 'green' : 'blue'}>
          {node.equipmentSystemType}
        </WxbTag>
      ) : (
        '—'
      ),
    },
    { label: '设备类别', value: node.equipmentClass || '—' },
    { label: '设备型号', value: node.equipmentModel || '—' },
    {
      label: '节点类型',
      value: (
        <WxbTag color={node.nodeClass === 'EQUIPMENT_UNIT' ? 'cyan' : 'neutral'}>
          {node.nodeClass === 'EQUIPMENT_UNIT' ? '设备单元' : node.nodeClass === 'COMPONENT' ? '组件' : node.nodeClass}
        </WxbTag>
      ),
    },
    { label: '所属部门', value: node.departmentCode || '全局' },
    { label: '节点子类', value: node.nodeSubtype || '—' },
    { label: '排序', value: String(node.sortOrder) },
    {
      label: '激活状态',
      value: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className={`equip-status-dot ${node.isActive ? 'is-active' : 'is-inactive'}`} />
          {node.isActive ? '运行中' : '已停用'}
        </span>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'info',
      label: '基本信息',
      children: (
        <WxbDescriptions items={infoItems} columns={2} bordered />
      ),
    },
    {
      key: 'bindings',
      label: '绑定关系',
      disabled: true,
      children: (
        <div className="equip-detail-placeholder">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="4" y="8" width="32" height="24" rx="3" />
            <path d="M4 14h32M14 14v18M26 14v18" />
          </svg>
          <p>绑定关系视图开发中...</p>
        </div>
      ),
    },
    {
      key: 'cip',
      label: 'CIP清洗',
      disabled: true,
      children: (
        <div className="equip-detail-placeholder">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M20 6v8M14 10l6 4 6-4M10 18h20v14H10z" />
            <path d="M15 24h10M15 28h7" />
          </svg>
          <p>CIP清洗管理开发中...</p>
        </div>
      ),
    },
  ];

  return (
    <WxbDrawer
      open={open}
      onClose={onClose}
      width={480}
      title={null}
      closable
      destroyOnClose
    >
      {/* Header */}
      <div className="equip-detail-header">
        <div className="equip-detail-title-row">
          <span className="equip-detail-name">{node.nodeName}</span>
          <span className={`equip-detail-status ${node.isActive ? 'is-active' : 'is-inactive'}`}>
            <span className={`equip-status-dot ${node.isActive ? 'is-active' : 'is-inactive'}`} />
            {node.isActive ? '运行中' : '已停用'}
          </span>
        </div>
        <div className="equip-detail-code">{node.nodeCode}</div>
      </div>

      {/* Actions */}
      <div className="equip-detail-actions">
        <WxbButton variant="outline" size="sm" onClick={() => onEdit(node)}>
          编辑
        </WxbButton>
        <WxbButton
          variant="outline"
          size="sm"
          onClick={() => onToggleActive(node)}
        >
          {node.isActive ? '停用' : '启用'}
        </WxbButton>
        <WxbPopconfirm
          title="确定删除此设备？"
          description={node.childCount > 0 ? '该设备有子节点，请先处理子节点。' : '此操作不可撤销。'}
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
        <WxbKpiCard title="系统类型" value={node.equipmentSystemType || '—'} />
        <WxbKpiCard title="设备类别" value={node.equipmentClass || '—'} />
      </div>

      {/* Tabs */}
      <WxbTabs items={tabItems} defaultActiveKey="info" />
    </WxbDrawer>
  );
};

export default EquipmentDetailDrawer;
