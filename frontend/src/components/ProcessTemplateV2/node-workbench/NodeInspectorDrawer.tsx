import React from 'react';
import { Button, Empty, Space } from 'antd';

interface NodeInspectorDrawerProps {
  mode: 'edit' | 'create-root' | 'create-child';
  selectedNodePath: string;
  hasEditableNode: boolean;
  onBackToEdit: () => void;
  onSaveNode: () => void;
  children: React.ReactNode;
}

const NodeInspectorDrawer: React.FC<NodeInspectorDrawerProps> = ({
  mode,
  selectedNodePath,
  hasEditableNode,
  onBackToEdit,
  onSaveNode,
  children,
}) => {
  return (
    <aside className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">
            {mode === 'edit' ? '节点属性编辑' : mode === 'create-root' ? '新增根节点' : '新增子节点'}
          </div>
          <div className="mt-1 text-xs text-slate-500">{selectedNodePath || '当前未选择节点'}</div>
        </div>
        <Space>
          <Button onClick={onBackToEdit} disabled={mode === 'edit'}>
            回到编辑
          </Button>
          <Button type="primary" onClick={onSaveNode}>
            保存节点
          </Button>
        </Space>
      </div>

      {!hasEditableNode && mode === 'edit' ? <Empty description="选择一个节点后即可编辑" /> : children}
    </aside>
  );
};

export default NodeInspectorDrawer;
