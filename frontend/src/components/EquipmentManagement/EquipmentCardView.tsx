/**
 * 卡片视图 — 树形嵌套可折叠
 * 接收树结构数据，递归渲染父子卡片层级
 */
import React, { useCallback, useState } from 'react';
import { WxbTag, WxbDropdown, WxbEmpty } from '../wxb-ui';
import type { ResourceNode, ResourceNodeClass } from '../ProcessTemplateV2/types';
import { NODE_CLASS_LABEL, NODE_CLASS_COLOR } from './resourceNodeConstants';

/* ────────────────── SVG Icons ────────────────── */

const NodeIcon: React.FC<{ nodeClass: ResourceNodeClass }> = ({ nodeClass }) => {
  const icons: Record<string, React.ReactNode> = {
    SITE: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 17V7l7-4 7 4v10H3z" /><path d="M8 17v-5h4v5" />
      </svg>
    ),
    LINE: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 10h4l2-3h4l2 3h4" /><circle cx="4" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
      </svg>
    ),
    ROOM: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="5" width="14" height="12" rx="2" /><path d="M3 9h14" />
      </svg>
    ),
    EQUIPMENT_UNIT: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="6" /><path d="M10 6v4l3 2" />
      </svg>
    ),
    COMPONENT: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="4" width="12" height="12" rx="2" /><path d="M8 8h4M8 12h4" />
      </svg>
    ),
    UTILITY_STATION: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 3v14M14 3v14M3 8h14M3 12h14" />
      </svg>
    ),
  };
  return <span className="equip-card-icon">{icons[nodeClass] ?? icons.COMPONENT}</span>;
};

const ChevronIcon: React.FC<{ expanded: boolean }> = ({ expanded }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`equip-chevron ${expanded ? 'is-expanded' : ''}`}
  >
    <path d="M6 4l4 4-4 4" />
  </svg>
);

/* ────────────────── Props ────────────────── */

interface EquipmentCardViewProps {
  /** 树结构数据（非平铺） */
  nodes: ResourceNode[];
  selectedNodeId: number | null;
  onSelect: (nodeId: number) => void;
  onEdit: (node: ResourceNode) => void;
  onDelete: (node: ResourceNode) => void;
  onToggleActive: (node: ResourceNode) => void;
  onCreateChild: (parent: ResourceNode) => void;
}

/* ────────────────── Recursive Node Card ────────────────── */

/** 层级深度决定默认展开状态：0,1 层默认展开，>=2 折叠 */
const DEFAULT_EXPAND_DEPTH = 2;

const RecursiveNodeCard: React.FC<{
  node: ResourceNode;
  depth: number;
  selectedNodeId: number | null;
  onSelect: (id: number) => void;
  onEdit: (n: ResourceNode) => void;
  onDelete: (n: ResourceNode) => void;
  onToggleActive: (n: ResourceNode) => void;
  onCreateChild: (n: ResourceNode) => void;
}> = ({ node, depth, selectedNodeId, onSelect, onEdit, onDelete, onToggleActive, onCreateChild }) => {
  const [expanded, setExpanded] = useState(depth < DEFAULT_EXPAND_DEPTH);
  const nodeColor = NODE_CLASS_COLOR[node.nodeClass] ?? 'neutral';
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = node.id === selectedNodeId;

  const handleMenuClick = useCallback(
    (key: string) => {
      switch (key) {
        case 'edit': onEdit(node); break;
        case 'toggle': onToggleActive(node); break;
        case 'child': onCreateChild(node); break;
        case 'delete': onDelete(node); break;
      }
    },
    [node, onEdit, onDelete, onToggleActive, onCreateChild],
  );

  const menuItems = [
    { key: 'edit', label: '编辑' },
    { key: 'child', label: '创建子节点' },
    { key: 'toggle', label: node.isActive ? '停用' : '启用' },
    { key: 'delete', label: '删除', danger: true },
  ];

  const handleToggleExpand = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  }, []);

  // Leaf node — compact card (no expand)
  if (!hasChildren) {
    return (
      <div
        className={`equip-card equip-card-leaf ${isSelected ? 'is-selected' : ''} ${!node.isActive ? 'is-inactive' : ''}`}
        onClick={() => onSelect(node.id)}
      >
        <div className={`equip-card-stripe equip-card-stripe-${nodeColor}`} />
        <div className="equip-card-body">
          <div className="equip-card-top">
            <NodeIcon nodeClass={node.nodeClass} />
            <div className="equip-card-info">
              <div className="equip-card-name" title={node.nodeName}>{node.nodeName}</div>
              <div className="equip-card-code" title={node.nodeCode}>{node.nodeCode}</div>
            </div>
            <WxbDropdown
              menu={{
                items: menuItems.map((item) => ({ key: item.key, label: item.label, danger: item.danger })),
                onClick: ({ key }) => handleMenuClick(key),
              }}
              trigger={['click']}
            >
              <button className="equip-card-more" type="button" onClick={(e) => e.stopPropagation()} aria-label="更多操作">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>
            </WxbDropdown>
          </div>
          <div className="equip-card-tags">
            <WxbTag color={nodeColor}>{NODE_CLASS_LABEL[node.nodeClass]}</WxbTag>
            {node.nodeSubtype && <WxbTag>{node.nodeSubtype}</WxbTag>}
            {node.equipmentSystemType && (
              <WxbTag color={node.equipmentSystemType === 'SUS' ? 'green' : node.equipmentSystemType === 'VIRTUAL' ? 'amber' : 'blue'}>{node.equipmentSystemType}</WxbTag>
            )}
            {!node.isActive && <WxbTag color="red">已停用</WxbTag>}
          </div>
          <div className="equip-card-meta">
            <span>{node.departmentCode || '全局'}</span>
            {node.boundResourceCode && (
              <span className="equip-card-bound">绑定: {node.boundResourceCode}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Branch node — container with expand/collapse
  return (
    <div className={`equip-card-branch equip-card-branch-${nodeColor} ${isSelected ? 'is-selected' : ''}`}>
      {/* Branch header */}
      <div className="equip-card-branch-header" onClick={() => onSelect(node.id)}>
        <button
          className="equip-card-expand-btn"
          type="button"
          onClick={handleToggleExpand}
          aria-label={expanded ? '折叠' : '展开'}
        >
          <ChevronIcon expanded={expanded} />
        </button>
        <NodeIcon nodeClass={node.nodeClass} />
        <div className="equip-card-info">
          <div className="equip-card-name" title={node.nodeName}>{node.nodeName}</div>
          <div className="equip-card-code" title={node.nodeCode}>{node.nodeCode}</div>
        </div>
        <div className="equip-card-branch-tags">
          <WxbTag color={nodeColor}>{NODE_CLASS_LABEL[node.nodeClass]}</WxbTag>
          {node.nodeSubtype && <WxbTag>{node.nodeSubtype}</WxbTag>}
          {!node.isActive && <WxbTag color="red">停用</WxbTag>}
        </div>
        <span className="equip-card-child-count">{node.children.length} 子节点</span>
        <WxbDropdown
          menu={{
            items: menuItems.map((item) => ({ key: item.key, label: item.label, danger: item.danger })),
            onClick: ({ key }) => handleMenuClick(key),
          }}
          trigger={['click']}
        >
          <button className="equip-card-more" type="button" onClick={(e) => e.stopPropagation()} aria-label="更多操作">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" /><circle cx="8" cy="8" r="1.5" /><circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>
        </WxbDropdown>
      </div>

      {/* Children area (collapsible) */}
      {expanded && (
        <div className="equip-card-branch-children">
          {/* Render leaf children as grid */}
          {(() => {
            const leaves = node.children.filter((c) => !c.children || c.children.length === 0);
            const branches = node.children.filter((c) => c.children && c.children.length > 0);
            return (
              <>
                {branches.map((child) => (
                  <RecursiveNodeCard
                    key={child.id}
                    node={child}
                    depth={depth + 1}
                    selectedNodeId={selectedNodeId}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onToggleActive={onToggleActive}
                    onCreateChild={onCreateChild}
                  />
                ))}
                {leaves.length > 0 && (
                  <div className="equip-card-grid">
                    {leaves.map((child) => (
                      <RecursiveNodeCard
                        key={child.id}
                        node={child}
                        depth={depth + 1}
                        selectedNodeId={selectedNodeId}
                        onSelect={onSelect}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onToggleActive={onToggleActive}
                        onCreateChild={onCreateChild}
                      />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

/* ────────────────── Main View ────────────────── */

const EquipmentCardView: React.FC<EquipmentCardViewProps> = ({
  nodes,
  selectedNodeId,
  onSelect,
  onEdit,
  onDelete,
  onToggleActive,
  onCreateChild,
}) => {
  if (!nodes.length) {
    return <WxbEmpty description="暂无资源节点" />;
  }

  return (
    <div className="equip-card-view">
      {nodes.map((node) => (
        <RecursiveNodeCard
          key={node.id}
          node={node}
          depth={0}
          selectedNodeId={selectedNodeId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggleActive={onToggleActive}
          onCreateChild={onCreateChild}
        />
      ))}
    </div>
  );
};

export default EquipmentCardView;
