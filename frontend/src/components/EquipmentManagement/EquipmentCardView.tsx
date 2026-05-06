import React from 'react';
import { WxbTag, WxbDropdown } from '../wxb-ui';
import type { ResourceNode } from '../ProcessTemplateV2/types';
import type { RoomGroup } from './useEquipmentManager';

/* ── SVG helpers ───────────────────────────────────────── */
const RoomIcon: React.FC = () => (
  <svg className="equip-room-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="4" width="16" height="13" rx="2" />
    <path d="M2 8h16M7 8v9M13 8v9" />
  </svg>
);

const EquipmentIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="3" width="12" height="14" rx="2" />
    <circle cx="10" cy="10" r="3" />
    <path d="M10 7v-2M10 15v-2M7 10H5M15 10h-2" />
  </svg>
);

const MoreIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="4" cy="8" r="1.2" />
    <circle cx="8" cy="8" r="1.2" />
    <circle cx="12" cy="8" r="1.2" />
  </svg>
);

/* ── Types ──────────────────────────────────────────────── */
interface EquipmentCardViewProps {
  roomGroups: RoomGroup[];
  selectedNodeId: number | null;
  onSelect: (nodeId: number) => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
}

/* ── Card Component ────────────────────────────────────── */
const EquipmentCard: React.FC<{
  node: ResourceNode;
  isSelected: boolean;
  onSelect: (nodeId: number) => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
}> = ({ node, isSelected, onSelect, onEdit, onDelete, onToggleActive }) => {
  const systemType = node.equipmentSystemType ?? '';

  const dropdownItems = [
    { key: 'edit', label: '编辑设备' },
    { key: 'toggle', label: node.isActive ? '停用' : '启用' },
    { key: 'delete', label: '删除', danger: true },
  ];

  const handleMenuClick = (key: string) => {
    switch (key) {
      case 'edit':
        onEdit(node);
        break;
      case 'toggle':
        onToggleActive(node);
        break;
      case 'delete':
        onDelete(node);
        break;
    }
  };

  return (
    <div
      className={`equip-card ${isSelected ? 'is-selected' : ''} ${!node.isActive ? 'is-inactive' : ''}`}
      data-system={systemType}
      onClick={() => onSelect(node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(node.id); }}
    >
      <div className="equip-card-top">
        <div className="equip-card-icon">
          <EquipmentIcon />
        </div>
        <div className="equip-card-info">
          <div className="equip-card-name" title={node.nodeName}>{node.nodeName}</div>
          <div className="equip-card-code" title={node.nodeCode}>{node.nodeCode}</div>
        </div>
        <WxbDropdown
          items={dropdownItems}
          onSelect={handleMenuClick}
          trigger="click"
        >
          <button
            className="equip-card-more"
            onClick={(e) => e.stopPropagation()}
            type="button"
            aria-label="更多操作"
          >
            <MoreIcon />
          </button>
        </WxbDropdown>
      </div>

      <div className="equip-card-tags">
        {systemType && (
          <WxbTag color={systemType === 'SUS' ? 'green' : 'blue'}>
            {systemType}
          </WxbTag>
        )}
        {node.equipmentClass && (
          <WxbTag color="neutral">{node.equipmentClass}</WxbTag>
        )}
      </div>

      <div className="equip-card-bottom">
        <span className="equip-card-status">
          <span className={`equip-status-dot ${node.isActive ? 'is-active' : 'is-inactive'}`} />
          {node.isActive ? '运行中' : '已停用'}
        </span>
        <span className="equip-card-bindings">
          {node.childCount > 0 ? `${node.childCount} 个子节点` : ''}
        </span>
      </div>
    </div>
  );
};

/* ── Card View Component ───────────────────────────────── */
const EquipmentCardView: React.FC<EquipmentCardViewProps> = ({
  roomGroups,
  selectedNodeId,
  onSelect,
  onEdit,
  onDelete,
  onToggleActive,
}) => {
  if (roomGroups.length === 0) {
    return (
      <div className="equip-empty">
        <svg className="equip-empty-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="6" y="10" width="36" height="28" rx="4" />
          <circle cx="24" cy="24" r="8" />
          <path d="M24 16v-4M24 36v-4M16 24h-4M36 24h-4" />
        </svg>
        <div className="equip-empty-text">暂无设备数据</div>
      </div>
    );
  }

  return (
    <div className="equip-card-content">
      {roomGroups.map((group) => (
        <div key={group.roomId ?? 'unassigned'} className="equip-room-section">
          <div className="equip-room-header">
            <RoomIcon />
            <span className="equip-room-name">{group.roomName}</span>
            <span className="equip-room-count">{group.nodes.length} 台设备</span>
          </div>
          <div className="equip-card-grid">
            {group.nodes.map((node) => (
              <EquipmentCard
                key={node.id}
                node={node}
                isSelected={selectedNodeId === node.id}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleActive={onToggleActive}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EquipmentCardView;
