import React from 'react';
import { Button, Empty, Input, Space, Tree, Typography } from 'antd';
import { AimOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { DataNode } from 'antd/es/tree';

const { Text } = Typography;

interface NodeWorkbenchNavigatorProps {
  treeData: DataNode[];
  selectedNodeId: number | null;
  canCreateChild: boolean;
  searchValue: string;
  stats: {
    totalCount: number;
    roomCount: number;
    bindableCount: number;
    mappedResourceCount: number;
  };
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreateRoot: () => void;
  onCreateChild: () => void;
  onLocateSelected: () => void;
  onSelect: (nodeId: number | null) => void;
  onDrop: (info: any) => void;
}

const statCardClass = 'rounded-2xl border border-slate-200 bg-white/80 px-3 py-2';

const NodeWorkbenchNavigator: React.FC<NodeWorkbenchNavigatorProps> = ({
  treeData,
  selectedNodeId,
  canCreateChild,
  searchValue,
  stats,
  onSearchChange,
  onRefresh,
  onCreateRoot,
  onCreateChild,
  onLocateSelected,
  onSelect,
  onDrop,
}) => {
  return (
    <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-700">层级导航轨</div>
        <Space size={8}>
          <Button size="small" icon={<ReloadOutlined />} onClick={onRefresh}>
            刷新
          </Button>
        </Space>
      </div>

      <Input.Search
        allowClear
        placeholder="搜索节点/资源"
        value={searchValue}
        onChange={(event) => onSearchChange(event.target.value)}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">节点总数</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{stats.totalCount}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">房间数</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{stats.roomCount}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">可绑定节点</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{stats.bindableCount}</div>
        </div>
        <div className={statCardClass}>
          <div className="text-xs text-slate-500">已挂载资源</div>
          <div className="mt-1 text-lg font-semibold text-slate-900">{stats.mappedResourceCount}</div>
        </div>
      </div>

      <Space wrap>
        <Button icon={<PlusOutlined />} type="primary" onClick={onCreateRoot}>
          新增根节点
        </Button>
        <Button icon={<PlusOutlined />} disabled={!canCreateChild} onClick={onCreateChild}>
          新增子节点
        </Button>
        <Button icon={<AimOutlined />} disabled={!selectedNodeId} onClick={onLocateSelected}>
          定位选中节点
        </Button>
      </Space>

      <div className="rounded-2xl border border-slate-200 p-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <Text type="secondary" className="text-xs">
            拖拽可移动层级
          </Text>
        </div>
        {treeData.length ? (
          <Tree
            draggable
            blockNode
            treeData={treeData}
            selectedKeys={selectedNodeId ? [selectedNodeId] : []}
            onSelect={(keys) => {
              const nextId = keys.length ? Number(keys[0]) : null;
              onSelect(nextId);
            }}
            onDrop={(info) => onDrop(info)}
            defaultExpandAll
          />
        ) : (
          <Empty description="尚未创建资源节点" />
        )}
      </div>
    </aside>
  );
};

export default NodeWorkbenchNavigator;
