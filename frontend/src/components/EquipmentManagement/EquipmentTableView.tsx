import React, { useMemo } from 'react';
import { WxbDataTable, WxbTag, WxbButton, WxbPopconfirm } from '../wxb-ui';
import type { ResourceNode } from '../ProcessTemplateV2/types';

interface EquipmentTableViewProps {
  nodes: ResourceNode[];
  selectedNodeId: number | null;
  selectedIds: number[];
  onSelect: (nodeId: number) => void;
  onSelectionChange: (ids: number[]) => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
  onBatchToggleActive: (ids: number[], isActive: boolean) => void;
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
  onBatchToggleActive,
  onBatchDelete,
}) => {
  const columns = useMemo(
    () => [
      {
        title: '设备名称',
        dataIndex: 'nodeName',
        key: 'nodeName',
        width: 180,
        sorter: (a: ResourceNode, b: ResourceNode) => a.nodeName.localeCompare(b.nodeName),
        render: (text: string, record: ResourceNode) => (
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--wx-gray-800, #1f2937)' }}>{text}</div>
            <div style={{ fontSize: 11, color: 'var(--wx-gray-400, #9ca3af)', fontFamily: 'monospace' }}>
              {record.nodeCode}
            </div>
          </div>
        ),
      },
      {
        title: '系统类型',
        dataIndex: 'equipmentSystemType',
        key: 'equipmentSystemType',
        width: 90,
        filters: [
          { text: 'SUS', value: 'SUS' },
          { text: 'SS', value: 'SS' },
        ],
        onFilter: (value: any, record: ResourceNode) => record.equipmentSystemType === value,
        render: (type: string | null) =>
          type ? (
            <WxbTag color={type === 'SUS' ? 'green' : 'blue'}>{type}</WxbTag>
          ) : (
            <span style={{ color: 'var(--wx-gray-300)' }}>—</span>
          ),
      },
      {
        title: '设备类别',
        dataIndex: 'equipmentClass',
        key: 'equipmentClass',
        width: 120,
        sorter: (a: ResourceNode, b: ResourceNode) =>
          (a.equipmentClass ?? '').localeCompare(b.equipmentClass ?? ''),
        render: (text: string | null) => text || '—',
      },
      {
        title: '型号',
        dataIndex: 'equipmentModel',
        key: 'equipmentModel',
        width: 120,
        render: (text: string | null) => text || '—',
      },
      {
        title: '节点类型',
        dataIndex: 'nodeClass',
        key: 'nodeClass',
        width: 110,
        render: (cls: string) => (
          <WxbTag color={cls === 'EQUIPMENT_UNIT' ? 'cyan' : 'neutral'}>
            {cls === 'EQUIPMENT_UNIT' ? '设备单元' : '组件'}
          </WxbTag>
        ),
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span
              className={`equip-status-dot ${active ? 'is-active' : 'is-inactive'}`}
            />
            {active ? '运行中' : '已停用'}
          </span>
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 140,
        render: (_: unknown, record: ResourceNode) => (
          <div style={{ display: 'flex', gap: 4 }}>
            <WxbButton size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onEdit(record); }}>
              编辑
            </WxbButton>
            <WxbButton
              size="sm"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); onToggleActive(record); }}
            >
              {record.isActive ? '停用' : '启用'}
            </WxbButton>
            <WxbPopconfirm
              title="确定删除此设备？"
              description={record.childCount > 0 ? '该设备有子节点，请先处理子节点。' : '此操作不可撤销。'}
              onConfirm={() => onDelete(record)}
              disabled={record.childCount > 0}
            >
              <WxbButton
                size="sm"
                variant="ghost"
                className="wxb-btn-danger-text"
                disabled={record.childCount > 0}
                onClick={(e) => e.stopPropagation()}
              >
                删除
              </WxbButton>
            </WxbPopconfirm>
          </div>
        ),
      },
    ],
    [onEdit, onDelete, onToggleActive],
  );

  const rowSelection = {
    selectedRowKeys: selectedIds,
    onChange: (keys: React.Key[]) => onSelectionChange(keys.map(Number)),
  };

  return (
    <div className="equip-table-content">
      {selectedIds.length > 0 && (
        <div className="equip-batch-bar">
          <span>已选 {selectedIds.length} 项</span>
          <WxbButton size="sm" variant="outline" onClick={() => onBatchToggleActive(selectedIds, true)}>
            批量启用
          </WxbButton>
          <WxbButton size="sm" variant="outline" onClick={() => onBatchToggleActive(selectedIds, false)}>
            批量停用
          </WxbButton>
          <WxbPopconfirm
            title={`确定批量删除 ${selectedIds.length} 台设备？`}
            description="此操作不可撤销。"
            onConfirm={() => onBatchDelete(selectedIds)}
          >
            <WxbButton size="sm" variant="outline" className="wxb-btn-danger-text">
              批量删除
            </WxbButton>
          </WxbPopconfirm>
        </div>
      )}

      <WxbDataTable<ResourceNode>
        columns={columns}
        dataSource={nodes}
        rowKey="id"
        size="small"
        rowSelection={rowSelection}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
        onRow={(record) => ({
          onClick: () => onSelect(record.id),
          style: {
            cursor: 'pointer',
            background: selectedNodeId === record.id ? 'var(--wx-blue-50, #eff6ff)' : undefined,
          },
        })}
      />
    </div>
  );
};

export default EquipmentTableView;
