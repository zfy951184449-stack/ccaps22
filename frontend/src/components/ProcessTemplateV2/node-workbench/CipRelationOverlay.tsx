import React from 'react';
import { ArrowRightOutlined, LinkOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { ResourceNode } from '../types';

interface CipRelationOverlayProps {
  stationNode: ResourceNode | null;
  targetNodes: ResourceNode[];
  onSelectNode: (nodeId: number) => void;
}

const CipRelationOverlay: React.FC<CipRelationOverlayProps> = ({ stationNode, targetNodes, onSelectNode }) => {
  if (!stationNode || stationNode.nodeClass !== 'UTILITY_STATION' || stationNode.nodeSubtype !== 'CIP') {
    return null;
  }

  return (
    <div className="pointer-events-auto rounded-2xl border border-sky-200 bg-sky-50/90 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-sky-700">
        <LinkOutlined />
        CIP 关系连线
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
        <Tag className="!m-0" color="cyan">
          {stationNode.nodeName}
        </Tag>
        <ArrowRightOutlined className="text-slate-400" />
        {targetNodes.length ? (
          targetNodes.map((target) => (
            <button
              key={target.id}
              type="button"
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 transition hover:border-sky-300 hover:text-sky-700"
              onClick={() => onSelectNode(target.id)}
            >
              {target.nodeName}
            </button>
          ))
        ) : (
          <span className="text-slate-500">暂无清洗目标</span>
        )}
      </div>
    </div>
  );
};

export default CipRelationOverlay;
