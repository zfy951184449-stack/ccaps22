import React, { useMemo } from 'react';
import { Button, Empty, Tag } from 'antd';
import { ApartmentOutlined, BuildOutlined, NodeIndexOutlined, ReloadOutlined, ToolOutlined } from '@ant-design/icons';
import CipRelationOverlay from './CipRelationOverlay';
import { NodeCanvasLayoutHint, ResourceNode } from '../types';

interface NodeWorkbenchCanvasProps {
  allNodes: ResourceNode[];
  selectedNodeId: number | null;
  searchValue: string;
  layoutDraft: Record<number, NodeCanvasLayoutHint>;
  selectedCipNode: ResourceNode | null;
  cleanableTargets: ResourceNode[];
  onSelectNode: (nodeId: number) => void;
  onLayoutChange: (nodeId: number, hint: NodeCanvasLayoutHint) => void;
  onAutoLayout: () => void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const zoneClassMap: Record<NodeCanvasLayoutHint['zone'], string> = {
  process_floor: 'h-[220px] bg-gradient-to-br from-slate-50 to-white',
  aux_lane: 'h-[72px] bg-amber-50/80',
  utility_lane: 'h-[220px] bg-cyan-50/70',
  pipeline_lane: 'h-[112px] bg-indigo-50/80',
};

const toneMap: Record<ResourceNode['nodeClass'], string> = {
  SITE: 'border-slate-300 bg-white text-slate-700',
  LINE: 'border-slate-300 bg-white text-slate-700',
  ROOM: 'border-slate-300 bg-white text-slate-700',
  EQUIPMENT_UNIT: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  COMPONENT: 'border-indigo-300 bg-indigo-50 text-indigo-800',
  UTILITY_STATION: 'border-cyan-300 bg-cyan-50 text-cyan-800',
};

const iconMap: Record<ResourceNode['nodeClass'], React.ReactNode> = {
  SITE: <ApartmentOutlined />,
  LINE: <ApartmentOutlined />,
  ROOM: <BuildOutlined />,
  EQUIPMENT_UNIT: <ToolOutlined />,
  COMPONENT: <NodeIndexOutlined />,
  UTILITY_STATION: <ToolOutlined />,
};

const matchNode = (node: ResourceNode, query: string) => {
  if (!query) {
    return true;
  }
  const normalizedQuery = query.trim().toLowerCase();
  return [node.nodeName, node.nodeCode, node.boundResourceCode ?? '', node.boundResourceName ?? '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
};

const NodeWorkbenchCanvas: React.FC<NodeWorkbenchCanvasProps> = ({
  allNodes,
  selectedNodeId,
  searchValue,
  layoutDraft,
  selectedCipNode,
  cleanableTargets,
  onSelectNode,
  onLayoutChange,
  onAutoLayout,
}) => {
  const nodeMap = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const childrenByParent = useMemo(() => {
    const map = new Map<number, ResourceNode[]>();
    allNodes.forEach((node) => {
      if (!node.parentId) {
        return;
      }
      const current = map.get(node.parentId) ?? [];
      current.push(node);
      map.set(node.parentId, current);
    });
    map.forEach((items) => items.sort((left, right) => left.sortOrder - right.sortOrder));
    return map;
  }, [allNodes]);

  const resolveRoomAnchorId = (node: ResourceNode): number | null => {
    if (node.nodeClass === 'ROOM') {
      return node.id;
    }

    let cursor: ResourceNode | undefined = node;
    const visited = new Set<number>();
    while (cursor && cursor.parentId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const parent = nodeMap.get(cursor.parentId);
      if (!parent) {
        return null;
      }
      if (parent.nodeClass === 'ROOM') {
        return parent.id;
      }
      cursor = parent;
    }

    return null;
  };

  const getZoneForNode = (node: ResourceNode): NodeCanvasLayoutHint['zone'] => {
    if (node.nodeClass === 'UTILITY_STATION') {
      return 'utility_lane';
    }
    if (node.nodeClass === 'COMPONENT') {
      return 'pipeline_lane';
    }
    if (node.nodeClass === 'ROOM' && node.nodeSubtype === 'AUXILIARY') {
      return 'aux_lane';
    }
    return 'process_floor';
  };

  const buildAutoHint = (
    node: ResourceNode,
    roomId: number,
    zone: NodeCanvasLayoutHint['zone'],
    index: number,
  ): NodeCanvasLayoutHint => {
    if (zone === 'pipeline_lane') {
      const col = index % 4;
      return {
        x: 0.04 + col * 0.235,
        y: 0.2,
        w: 0.21,
        h: 0.55,
        zone,
        roomAnchorId: roomId,
        manual: false,
      };
    }

    if (zone === 'utility_lane') {
      const col = index % 3;
      const row = Math.floor(index / 3);
      return {
        x: 0.05 + col * 0.31,
        y: 0.08 + row * 0.42,
        w: 0.28,
        h: 0.34,
        zone,
        roomAnchorId: roomId,
        manual: false,
      };
    }

    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      x: 0.05 + col * 0.31,
      y: 0.08 + row * 0.42,
      w: 0.28,
      h: 0.34,
      zone,
      roomAnchorId: roomId,
      manual: false,
    };
  };

  const getEffectiveHint = (
    node: ResourceNode,
    roomId: number,
    zone: NodeCanvasLayoutHint['zone'],
    index: number,
  ): NodeCanvasLayoutHint => {
    const existing = layoutDraft[node.id] ?? node.layoutHint;
    if (existing && existing.zone === zone) {
      return {
        ...existing,
        roomAnchorId: roomId,
      };
    }
    return buildAutoHint(node, roomId, zone, index);
  };

  const handleDropToZone = (
    event: React.DragEvent<HTMLDivElement>,
    roomId: number,
    zone: NodeCanvasLayoutHint['zone'],
  ) => {
    event.preventDefault();
    const nodeIdRaw = event.dataTransfer.getData('application/x-node-id');
    const nodeId = Number(nodeIdRaw);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      return;
    }

    const node = nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const requiredZone = getZoneForNode(node);
    if (requiredZone !== zone) {
      return;
    }

    const currentRoomId = resolveRoomAnchorId(node);
    if (currentRoomId !== roomId) {
      return;
    }

    const current = layoutDraft[node.id] ?? node.layoutHint ?? buildAutoHint(node, roomId, zone, 0);
    const target = event.currentTarget.getBoundingClientRect();
    const w = clamp(current.w || 0.28, 0.12, 0.9);
    const h = clamp(current.h || 0.34, 0.2, 0.9);
    const x = clamp((event.clientX - target.left) / target.width - w / 2, 0, 1 - w);
    const y = clamp((event.clientY - target.top) / target.height - h / 2, 0, 1 - h);

    onLayoutChange(node.id, {
      ...current,
      x,
      y,
      w,
      h,
      zone,
      roomAnchorId: roomId,
      manual: true,
    });
  };

  const rooms = allNodes.filter((node) => node.nodeClass === 'ROOM');

  const visibleRooms = rooms.filter((room) => {
    if (matchNode(room, searchValue)) {
      return true;
    }
    const children = childrenByParent.get(room.id) ?? [];
    if (children.some((item) => matchNode(item, searchValue))) {
      return true;
    }

    return children.some((child) => {
      const nested = childrenByParent.get(child.id) ?? [];
      return nested.some((item) => matchNode(item, searchValue));
    });
  });

  const renderNodeCard = (node: ResourceNode, hint: NodeCanvasLayoutHint) => (
    <button
      key={node.id}
      type="button"
      draggable
      onDragStart={(event) => event.dataTransfer.setData('application/x-node-id', String(node.id))}
      onClick={() => onSelectNode(node.id)}
      className={`absolute rounded-xl border px-2 py-1 text-left text-xs shadow-sm transition ${toneMap[node.nodeClass]} ${
        selectedNodeId === node.id ? 'ring-2 ring-sky-400' : ''
      }`}
      style={{
        left: `${hint.x * 100}%`,
        top: `${hint.y * 100}%`,
        width: `${hint.w * 100}%`,
        minHeight: `${hint.h * 100}%`,
      }}
    >
      <div className="flex items-center gap-1 font-semibold">
        <span className="opacity-80">{iconMap[node.nodeClass]}</span>
        <span className="truncate">{node.nodeName}</span>
      </div>
      {node.nodeClass === 'EQUIPMENT_UNIT' ? (
        <div className="mt-1 truncate text-[11px] opacity-80">
          {node.equipmentSystemType ?? '-'} | {node.equipmentClass ?? '-'} | {node.equipmentModel ?? '-'}
        </div>
      ) : null}
      {node.nodeClass === 'UTILITY_STATION' ? (
        <div className="mt-1 truncate text-[11px] opacity-80">{node.nodeSubtype ?? '-'}</div>
      ) : null}
    </button>
  );

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">拟物画布</div>
          <div className="text-xs text-slate-500">Room/Site 语义舞台，支持拖拽微调并保存布局。</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={onAutoLayout}>
          自动编排
        </Button>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute right-2 top-2 z-10">
          <CipRelationOverlay stationNode={selectedCipNode} targetNodes={cleanableTargets} onSelectNode={onSelectNode} />
        </div>

        {!visibleRooms.length ? (
          <div className="rounded-2xl border border-dashed border-slate-300 py-16">
            <Empty description="当前条件下没有可展示的房间节点" />
          </div>
        ) : (
          <div className="space-y-4">
            {visibleRooms.map((room) => {
              const directChildren = childrenByParent.get(room.id) ?? [];
              const auxiliaryRooms = directChildren.filter(
                (node) => node.nodeClass === 'ROOM' && node.nodeSubtype === 'AUXILIARY',
              );
              const equipmentUnits = directChildren.filter((node) => node.nodeClass === 'EQUIPMENT_UNIT');
              const utilityStations = directChildren.filter((node) => node.nodeClass === 'UTILITY_STATION');
              const components = equipmentUnits.flatMap((equipment) =>
                (childrenByParent.get(equipment.id) ?? []).filter((node) => node.nodeClass === 'COMPONENT'),
              );

              const isUtilityRoom = room.nodeSubtype === 'UTILITY_SHARED';
              const processItems = isUtilityRoom ? utilityStations : equipmentUnits;
              const processZone: NodeCanvasLayoutHint['zone'] = isUtilityRoom ? 'utility_lane' : 'process_floor';

              return (
                <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelectNode(room.id)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        selectedNodeId === room.id
                          ? 'border-sky-400 bg-sky-50 text-sky-700'
                          : 'border-slate-300 bg-white text-slate-600'
                      }`}
                    >
                      ROOM {room.nodeName}
                    </button>
                    <Tag className="!m-0">{room.nodeSubtype ?? '-'}</Tag>
                  </div>

                  {!isUtilityRoom ? (
                    <div
                      className={`relative mb-2 overflow-hidden rounded-xl border border-slate-200 ${zoneClassMap.aux_lane}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDropToZone(event, room.id, 'aux_lane')}
                    >
                      {auxiliaryRooms.map((node, index) =>
                        renderNodeCard(node, getEffectiveHint(node, room.id, 'aux_lane', index)),
                      )}
                    </div>
                  ) : null}

                  <div
                    className={`relative overflow-hidden rounded-xl border border-slate-200 ${zoneClassMap[processZone]}`}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDropToZone(event, room.id, processZone)}
                  >
                    {processItems.map((node, index) =>
                      renderNodeCard(node, getEffectiveHint(node, room.id, processZone, index)),
                    )}
                  </div>

                  {!isUtilityRoom ? (
                    <div
                      className={`relative mt-2 overflow-hidden rounded-xl border border-slate-200 ${zoneClassMap.pipeline_lane}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => handleDropToZone(event, room.id, 'pipeline_lane')}
                    >
                      {components.map((node, index) =>
                        renderNodeCard(node, getEffectiveHint(node, room.id, 'pipeline_lane', index)),
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default NodeWorkbenchCanvas;
