/**
 * 树形表格视图 — 支持全量节点类型 + 层级展开 + 批量操作
 *
 * dataSource 接收树结构数据（ResourceNode[]，每个节点有 children），
 * antd Table 自动通过 children 字段展开树形结构。
 */
import React from 'react';
import { WxbBulkActionBar, WxbDataTable, WxbTableActionCell, WxbTag } from '../wxb-ui';
import type { ResourceNode } from '../ProcessTemplateV2/types';
import { NODE_CLASS_LABEL, NODE_CLASS_COLOR } from './resourceNodeConstants';

interface EquipmentTableViewProps {
  /** 树结构数据（非平铺），每个节点有 children */
  nodes: ResourceNode[];
  selectedNodeId: number | null;
  selectedIds: number[];
  onSelect: (nodeId: number) => void;
  onSelectionChange: (ids: number[]) => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
  onCreateChild: (parent: ResourceNode) => void;
  onBatchToggleActive: (ids: number[], active: boolean) => void;
  onBatchDelete: (ids: number[]) => void;
}

const EquipmentTableView: React.FC<EquipmentTableViewProps> = ({
  nodes,
  selectedNodeId,
  selectedIds,
  onSelect,
  onSelectionChange,
  onEdit,
  onDelete,
  onToggleActive,
  onCreateChild,
  onBatchToggleActive,
  onBatchDelete,
}) => {
  const columns = [
    {
      title: '节点名称',
      dataIndex: 'nodeName',
      key: 'nodeName',
      width: 260,
      render: (text: string, record: ResourceNode) => (
        <span
          className={`equip-table-name ${record.id === selectedNodeId ? 'is-selected' : ''}`}
          onClick={() => onSelect(record.id)}
        >
          <WxbTag color={NODE_CLASS_COLOR[record.nodeClass]}>
            {NODE_CLASS_LABEL[record.nodeClass]}
          </WxbTag>
          <span className="equip-table-name-text">{text}</span>
        </span>
      ),
    },
    {
      title: '编号',
      dataIndex: 'nodeCode',
      key: 'nodeCode',
      width: 240,
    },
    {
      title: '子类型',
      dataIndex: 'nodeSubtype',
      key: 'nodeSubtype',
      width: 100,
      render: (v: string | null) => v ? <WxbTag>{v}</WxbTag> : '—',
    },
    {
      title: '系统类型',
      dataIndex: 'equipmentSystemType',
      key: 'equipmentSystemType',
      width: 90,
      filters: [
        { text: 'SUS', value: 'SUS' },
        { text: 'SS', value: 'SS' },
        { text: 'VIRTUAL', value: 'VIRTUAL' },
      ],
      onFilter: (value: any, record: ResourceNode) => record.equipmentSystemType === value,
      render: (type: string | null) =>
        type ? <WxbTag color={type === 'SUS' ? 'green' : type === 'VIRTUAL' ? 'amber' : 'blue'}>{type}</WxbTag> : '—',
    },
    {
      title: '所属部门',
      dataIndex: 'departmentCode',
      key: 'departmentCode',
      width: 90,
      render: (v: string | null) => v || '全局',
    },
    {
      title: '绑定资源',
      dataIndex: 'boundResourceCode',
      key: 'boundResourceCode',
      width: 120,
      render: (code: string | null, record: ResourceNode) =>
        code ? (
          <WxbTag color="cyan">{code}</WxbTag>
        ) : record.nodeClass === 'EQUIPMENT_UNIT' || record.nodeClass === 'COMPONENT' || record.nodeClass === 'UTILITY_STATION' ? (
          <span className="equip-table-unbound">未绑定</span>
        ) : '—',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 80,
      filters: [
        { text: '运行中', value: true },
        { text: '已停用', value: false },
      ],
      onFilter: (value: any, record: ResourceNode) => record.isActive === value,
      render: (active: boolean) => (
        <span className="equip-status-inline">
          <span className={`equip-status-dot ${active ? 'is-active' : 'is-inactive'}`} />
          {active ? '运行中' : '已停用'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right' as const,
      render: (_: any, record: ResourceNode) => (
        <WxbTableActionCell
          actions={[
            { key: 'edit', label: '编辑', onClick: () => onEdit(record) },
            { key: 'create-child', label: '新增子节点', onClick: () => onCreateChild(record) },
            {
              key: 'toggle-active',
              label: record.isActive ? '停用' : '启用',
              onClick: () => onToggleActive(record),
            },
            {
              key: 'delete',
              label: '删除',
              variant: 'danger',
              disabled: record.childCount > 0,
              onClick: () => onDelete(record),
              confirm: {
                title: '确定删除此节点？',
                description: record.childCount > 0 ? '该节点有子节点，请先删除子节点。' : undefined,
              },
            },
          ]}
        />
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedIds,
    onChange: (keys: React.Key[]) => onSelectionChange(keys.map(Number)),
    checkStrictly: true, // 不级联选中子节点
  };

  return (
    <div className="equip-table-view">
      <WxbBulkActionBar
        selectedCount={selectedIds.length}
        onClear={() => onSelectionChange([])}
        actions={[
          {
            key: 'batch-enable',
            label: '批量启用',
            variant: 'secondary',
            onClick: () => onBatchToggleActive(selectedIds, true),
          },
          {
            key: 'batch-disable',
            label: '批量停用',
            variant: 'secondary',
            onClick: () => onBatchToggleActive(selectedIds, false),
          },
          {
            key: 'batch-delete',
            label: '批量删除',
            variant: 'danger',
            onClick: () => onBatchDelete(selectedIds),
            confirm: {
              title: `确定批量删除 ${selectedIds.length} 个节点？`,
              description: '此操作不可撤销。',
            },
          },
        ]}
      />

      <WxbDataTable
        density="compact"
        columns={columns}
        dataSource={nodes}
        emptyState={{ description: '暂无资源节点' }}
        rowKey="id"
        rowSelection={rowSelection}
        pagination={false}
        scroll={{ x: 1280 }}
        size="small"
        defaultExpandAllRows
        expandable={{
          childrenColumnName: 'children',
          defaultExpandAllRows: true,
          indentSize: 24,
        }}
        onRow={(record: ResourceNode) => ({
          onClick: () => onSelect(record.id),
          className: record.id === selectedNodeId ? 'equip-table-row-selected' : '',
        })}
      />
    </div>
  );
};

export default EquipmentTableView;
