import React, { useCallback, useMemo } from 'react';
import {
  ApartmentOutlined,
  BuildOutlined,
  DownOutlined,
  FilterOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
  ToolOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { Button, Empty, Segmented, Tag } from 'antd';
import { NodeCanvasLayoutHint, ResourceNode, TeamSummary } from '../types';

export type WorkbenchGroupMode = 'department' | 'team';

export interface RoomCreatePreview {
  active: boolean;
  roomName: string;
  roomTypeLabel: string;
  ownerLabel: string;
  targetGroupKey: string | null;
  targetGroupLabel: string;
}

interface FactoryLayoutCanvasProps {
  allNodes: ResourceNode[];
  selectedNodeId: number | null;
  selectedNode: ResourceNode | null;
  teams: TeamSummary[];
  searchValue: string;
  layoutDraft: Record<number, NodeCanvasLayoutHint>;
  groupBy: WorkbenchGroupMode;
  collapsedGroups: Record<string, boolean>;
  activeDepartmentCodes: string[];
  showInactive: boolean;
  qualifiedOnly: boolean;
  createRoomPreview: RoomCreatePreview | null;
  onSelectNode: (nodeId: number) => void;
  onLayoutChange: (nodeId: number, hint: NodeCanvasLayoutHint) => void;
  onToggleGroup: (groupKey: string) => void;
  onGroupByChange: (value: WorkbenchGroupMode) => void;
  onOpenPalette: () => void;
  onOpenFilters: () => void;
  onOpenInspector: () => void;
  onCreateRoom: () => void;
  onAddEquipment: (roomId: number) => void;
  onManageBinding: (nodeId: number) => void;
  onAutoLayout: () => void;
}

type GroupSummary = {
  key: string;
  label: string;
  description: string;
  rooms: ResourceNode[];
  assetCount: number;
};

type EquipmentIllustrationTone = 'blue' | 'green' | 'amber' | 'slate';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const zoneClassMap: Record<NodeCanvasLayoutHint['zone'], string> = {
  process_floor: 'h-[184px] bg-white/80',
  aux_lane: 'min-h-[48px] bg-white/70',
  utility_lane: 'h-[184px] bg-white/80',
  pipeline_lane: 'min-h-[72px] bg-white/70',
};

const roomToneMap: Record<string, string> = {
  USP: 'border-[#c0d2e4] bg-[#dde9f6]',
  DSP: 'border-[#c4d5bc] bg-[#e8f1e2]',
  SHARED: 'border-[#d8c7ab] bg-[#f3e9d8]',
};

const nodeIconMap: Record<ResourceNode['nodeClass'], React.ReactNode> = {
  SITE: <ApartmentOutlined />,
  LINE: <ApartmentOutlined />,
  ROOM: <BuildOutlined />,
  EQUIPMENT_UNIT: <ToolOutlined />,
  COMPONENT: <NodeIndexOutlined />,
  UTILITY_STATION: <SettingOutlined />,
};

const knownDepartmentLabelMap: Record<string, string> = {
  USP: 'USP Department',
  DSP: 'DSP Department',
  SPI: 'SPI Department',
  MAINT: 'Maintenance',
};

const getMetadataString = (node: ResourceNode, keys: string[]): string | null => {
  const metadata = node.metadata ?? {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const getTeamLabel = (node: ResourceNode, teamsById: Map<number, TeamSummary>) => {
  const directLabel = getMetadataString(node, ['teamLabel', 'teamName', 'ownerGroupLabel']);
  if (directLabel) {
    return directLabel;
  }

  const metadata = node.metadata ?? {};
  const rawTeamId = metadata.teamId;
  const numericTeamId = typeof rawTeamId === 'number' ? rawTeamId : Number(rawTeamId);
  if (Number.isInteger(numericTeamId) && teamsById.has(numericTeamId)) {
    return teamsById.get(numericTeamId)?.unit_name ?? 'Shared team';
  }

  if (node.departmentCode) {
    return `${node.departmentCode} Team`;
  }

  return 'Shared team';
};

const getDepartmentLabel = (node: ResourceNode) => {
  if (node.nodeSubtype === 'UTILITY_SHARED') {
    return 'Shared Services';
  }
  if (!node.departmentCode) {
    return 'Shared Services';
  }
  return knownDepartmentLabelMap[node.departmentCode] ?? `${node.departmentCode} Department`;
};

const getRoomToneKey = (room: ResourceNode) => {
  if (room.nodeSubtype === 'UTILITY_SHARED') {
    return 'SHARED';
  }
  return room.departmentCode ?? 'SHARED';
};

const matchesSearch = (node: ResourceNode, query: string) => {
  if (!query.trim()) {
    return true;
  }
  const normalizedQuery = query.trim().toLowerCase();
  return [node.nodeName, node.nodeCode, node.boundResourceCode ?? '', node.boundResourceName ?? '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
};

const getEquipmentIllustrationKind = (node: ResourceNode) => {
  const marker = [
    node.equipmentClass ?? '',
    node.equipmentModel ?? '',
    node.nodeName ?? '',
    node.nodeSubtype ?? '',
  ]
    .join(' ')
    .toUpperCase();

  if (marker.includes('UFDF')) {
    return 'ufdf';
  }
  if (marker.includes('CHROM') || marker.includes('AKTA')) {
    return 'chrom';
  }
  if (marker.includes('SEED')) {
    return 'seed';
  }
  if (marker.includes('TANK') || marker.includes('BUFFER')) {
    return 'tank';
  }
  if (marker.includes('CIP') || marker.includes('SIP')) {
    return 'utility';
  }
  return 'reactor';
};

const getEquipmentIllustrationTone = (node: ResourceNode): EquipmentIllustrationTone => {
  if (node.nodeClass === 'UTILITY_STATION') {
    return 'amber';
  }
  if (node.departmentCode === 'DSP') {
    return 'green';
  }
  if (node.nodeClass === 'COMPONENT') {
    return 'slate';
  }
  return 'blue';
};

const illustrationPalette: Record<EquipmentIllustrationTone, { soft: string; base: string; line: string }> = {
  blue: { soft: 'bg-[#e1edf7]', base: 'bg-[#d1e4f5]', line: 'bg-[#8ea5b9]' },
  green: { soft: 'bg-[#f6fbf3]', base: 'bg-[#dbe8d3]', line: 'bg-[#8da38b]' },
  amber: { soft: 'bg-[#fff9ee]', base: 'bg-[#f1dfbf]', line: 'bg-[#ba9357]' },
  slate: { soft: 'bg-[#f8fbfd]', base: 'bg-[#dce7ef]', line: 'bg-[#94a7b8]' },
};

const EquipmentIllustration: React.FC<{ node: ResourceNode }> = ({ node }) => {
  const kind = getEquipmentIllustrationKind(node);
  const palette = illustrationPalette[getEquipmentIllustrationTone(node)];

  if (kind === 'seed') {
    return (
      <div className="relative mx-auto h-11 w-24">
        <div className={`absolute left-0 top-4 h-4 w-4 rounded-full border border-white/60 ${palette.soft}`} />
        <div className={`absolute left-8 top-2 h-6 w-6 rounded-full border border-white/60 ${palette.base}`} />
        <div className={`absolute right-0 top-4 h-4 w-4 rounded-full border border-white/60 ${palette.soft}`} />
        <div className={`absolute left-4 top-5 h-1 w-4 rounded ${palette.line}`} />
        <div className={`absolute left-14 top-5 h-1 w-4 rounded ${palette.line}`} />
      </div>
    );
  }

  if (kind === 'chrom') {
    return (
      <div className="relative mx-auto h-11 w-24">
        <div className={`absolute left-5 top-0 h-1.5 w-14 rounded ${palette.line}`} />
        <div className={`absolute left-9 top-4 h-8 w-2 rounded ${palette.line}`} />
        <div className={`absolute left-[18px] top-6 h-2 w-16 rounded ${palette.line}`} />
        <div className={`absolute left-10 top-6 h-8 w-3 rounded border border-white/70 ${palette.soft}`} />
        <div className={`absolute left-16 top-6 h-8 w-3 rounded border border-white/70 ${palette.soft}`} />
      </div>
    );
  }

  if (kind === 'ufdf') {
    return (
      <div className="relative mx-auto h-11 w-24">
        <div className={`absolute left-2 top-7 h-2 w-16 rounded ${palette.line}`} />
        <div className={`absolute left-4 top-2 h-5 w-6 rounded-md border border-white/70 ${palette.soft}`} />
        <div className={`absolute left-12 top-2 h-5 w-6 rounded-md border border-white/70 ${palette.soft}`} />
        <div className={`absolute right-2 top-0 h-9 w-3 rounded-lg border border-white/60 ${palette.base}`} />
        <div className={`absolute left-10 top-4 h-1 w-10 rounded ${palette.line}`} />
      </div>
    );
  }

  if (kind === 'tank') {
    return (
      <div className="relative mx-auto h-11 w-24">
        <div className={`absolute left-8 top-0 h-3 w-10 rounded-full border border-white/70 ${palette.soft}`} />
        <div className={`absolute left-8 top-2 h-8 w-10 rounded-lg border border-white/70 ${palette.base}`} />
        <div className={`absolute left-8 top-8 h-3 w-10 rounded-full border border-white/70 ${palette.soft}`} />
        <div className={`absolute left-5 top-6 h-2 w-3 rounded ${palette.line}`} />
      </div>
    );
  }

  if (kind === 'utility') {
    return (
      <div className="relative mx-auto h-11 w-24">
        <div className={`absolute left-2 top-4 h-3 w-20 rounded ${palette.line}`} />
        <div className={`absolute left-7 top-0 h-7 w-10 rounded-lg border border-white/70 ${palette.soft}`} />
        <div className={`absolute left-10 top-10 h-1.5 w-4 rounded ${palette.line}`} />
      </div>
    );
  }

  return (
    <div className="relative mx-auto h-11 w-24">
      <div className={`absolute left-8 top-0 h-3 w-10 rounded-full border border-white/70 ${palette.soft}`} />
      <div className={`absolute left-8 top-2 h-8 w-10 rounded-lg border border-white/70 ${palette.base}`} />
      <div className={`absolute left-8 top-8 h-3 w-10 rounded-full border border-white/70 ${palette.soft}`} />
      <div className={`absolute left-5 top-4 h-2.5 w-3 rounded ${palette.line}`} />
    </div>
  );
};

const FactoryLayoutCanvas: React.FC<FactoryLayoutCanvasProps> = ({
  allNodes,
  selectedNodeId,
  selectedNode,
  teams,
  searchValue,
  layoutDraft,
  groupBy,
  collapsedGroups,
  activeDepartmentCodes,
  showInactive,
  qualifiedOnly,
  createRoomPreview,
  onSelectNode,
  onLayoutChange,
  onToggleGroup,
  onGroupByChange,
  onOpenPalette,
  onOpenFilters,
  onOpenInspector,
  onCreateRoom,
  onAddEquipment,
  onManageBinding,
  onAutoLayout,
}) => {
  const teamsById = useMemo(() => new Map(teams.map((team) => [Number(team.id), team])), [teams]);

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

  const resolveRoomAnchorId = useCallback((node: ResourceNode | null): number | null => {
    if (!node) {
      return null;
    }

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
  }, [nodeMap]);

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
      const col = index % 4;
      return {
        x: 0.05 + col * 0.23,
        y: 0.16,
        w: 0.2,
        h: 0.42,
        zone,
        roomAnchorId: roomId,
        manual: false,
      };
    }

    const col = index % 2;
    const row = Math.floor(index / 2);
    return {
      x: 0.06 + col * 0.42,
      y: 0.1 + row * 0.44,
      w: 0.34,
      h: 0.42,
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
    const w = clamp(current.w || 0.28, 0.16, 0.9);
    const h = clamp(current.h || 0.34, 0.22, 0.9);
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

  const mainRooms = useMemo(
    () =>
      allNodes.filter(
        (node) => node.nodeClass === 'ROOM' && node.nodeSubtype !== 'AUXILIARY',
      ),
    [allNodes],
  );

  const roomFilterPasses = useCallback((room: ResourceNode) => {
    if (!showInactive && !room.isActive) {
      return false;
    }

    if (activeDepartmentCodes.length && room.departmentCode && !activeDepartmentCodes.includes(room.departmentCode)) {
      return false;
    }

    if (!matchesSearch(room, searchValue)) {
      const directChildren = childrenByParent.get(room.id) ?? [];
      const descendantMatch = directChildren.some((child) => {
        if (matchesSearch(child, searchValue)) {
          return true;
        }
        const nested = childrenByParent.get(child.id) ?? [];
        return nested.some((item) => matchesSearch(item, searchValue));
      });
      if (!descendantMatch) {
        return false;
      }
    }

    if (!qualifiedOnly) {
      return true;
    }

    const roomAssets = (childrenByParent.get(room.id) ?? []).filter((node) =>
      node.nodeClass === 'EQUIPMENT_UNIT' || node.nodeClass === 'UTILITY_STATION',
    );
    return roomAssets.some(
      (asset) => asset.isActive && (!asset.boundResourceId || asset.boundResourceIsSchedulable),
    );
  }, [activeDepartmentCodes, childrenByParent, qualifiedOnly, searchValue, showInactive]);

  const visibleRooms = useMemo(() => mainRooms.filter(roomFilterPasses), [mainRooms, roomFilterPasses]);

  const groups = useMemo<GroupSummary[]>(() => {
    const map = new Map<string, GroupSummary>();

    visibleRooms.forEach((room) => {
      const departmentLabel = getDepartmentLabel(room);
      const teamLabel = getTeamLabel(room, teamsById);
      const label = groupBy === 'team' ? teamLabel : departmentLabel;
      const key = `${groupBy}:${label}`;
      const directChildren = childrenByParent.get(room.id) ?? [];
      const assetCount = directChildren.filter((node) =>
        node.nodeClass === 'EQUIPMENT_UNIT' || node.nodeClass === 'UTILITY_STATION',
      ).length;

      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          description: groupBy === 'team' ? departmentLabel : `${teamLabel} / group`,
          rooms: [],
          assetCount: 0,
        });
      }

      const existing = map.get(key)!;
      existing.rooms.push(room);
      existing.assetCount += assetCount;
    });

    const result = Array.from(map.values());
    result.forEach((group) =>
      group.rooms.sort((left, right) => left.nodeName.localeCompare(right.nodeName, 'zh-CN')),
    );
    result.sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'));
    return result;
  }, [childrenByParent, groupBy, teamsById, visibleRooms]);

  const selectedRoom = useMemo(() => {
    const roomId = resolveRoomAnchorId(selectedNode);
    return roomId ? nodeMap.get(roomId) ?? null : null;
  }, [nodeMap, resolveRoomAnchorId, selectedNode]);

  const selectedRoomAssetCount = useMemo(() => {
    if (!selectedRoom) {
      return 0;
    }
    return (childrenByParent.get(selectedRoom.id) ?? []).filter((node) =>
      node.nodeClass === 'EQUIPMENT_UNIT' || node.nodeClass === 'UTILITY_STATION',
    ).length;
  }, [childrenByParent, selectedRoom]);

  const activeFilterCount = [
    searchValue.trim() ? 1 : 0,
    activeDepartmentCodes.length ? 1 : 0,
    qualifiedOnly ? 1 : 0,
    !showInactive ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);

  const renderNodeCard = (node: ResourceNode, hint: NodeCanvasLayoutHint) => {
    const selected = selectedNodeId === node.id;

    return (
      <button
        key={node.id}
        type="button"
        draggable
        onDragStart={(event) => event.dataTransfer.setData('application/x-node-id', String(node.id))}
        onClick={() => onSelectNode(node.id)}
        className={`absolute rounded-2xl border px-3 py-2 text-left shadow-sm transition ${
          selected
            ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-300'
            : 'border-slate-200 bg-white/95 hover:border-sky-300 hover:shadow-md'
        }`}
        style={{
          left: `${hint.x * 100}%`,
          top: `${hint.y * 100}%`,
          width: `${hint.w * 100}%`,
          minHeight: `${hint.h * 100}%`,
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>{nodeIconMap[node.nodeClass]}</span>
            <span>{node.nodeClass === 'UTILITY_STATION' ? node.nodeSubtype ?? 'UTILITY' : 'Asset'}</span>
          </div>
          {!node.isActive ? <Tag className="!m-0" color="default">停用</Tag> : null}
        </div>
        <EquipmentIllustration node={node} />
        <div className="mt-2 truncate text-sm font-semibold text-slate-700">{node.nodeName}</div>
        {node.nodeClass === 'EQUIPMENT_UNIT' ? (
          <div className="mt-1 truncate text-[11px] text-slate-500">
            {[node.equipmentSystemType, node.equipmentClass, node.equipmentModel].filter(Boolean).join(' / ') || '未定义模板'}
          </div>
        ) : null}
      </button>
    );
  };

  const renderPreviewRoomCard = () => {
    if (!createRoomPreview?.active) {
      return null;
    }

    return (
      <div className="rounded-[26px] border-2 border-dashed border-[#153b61] bg-white/70 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[#153b61]">{createRoomPreview.roomName || 'New room'}</div>
            <div className="mt-1 text-sm text-slate-500">{createRoomPreview.ownerLabel}</div>
          </div>
          <Tag className="!m-0 rounded-full border-[#bfd0e3] bg-[#e7f0fa] px-3 py-1 text-[#4d647c]">
            {createRoomPreview.roomTypeLabel}
          </Tag>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-[#bfd0e3] bg-[#f7fbff] px-4 py-6 text-sm text-[#4d647c]">
          放置预览：点击高亮分组后，房间会插入到当前布局中。
        </div>
      </div>
    );
  };

  const renderRoomCard = (room: ResourceNode) => {
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
    const roomTone = roomToneMap[getRoomToneKey(room)] ?? roomToneMap.SHARED;
    const roomSelected = selectedRoom?.id === room.id || selectedNodeId === room.id;

    return (
      <div
        key={room.id}
        className={`rounded-[26px] border p-4 shadow-sm transition ${roomTone} ${roomSelected ? 'ring-2 ring-sky-300' : ''}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <button
              type="button"
              className="text-left text-xl font-semibold text-slate-800"
              onClick={() => onSelectNode(room.id)}
            >
              {room.nodeName}
            </button>
            <div className="mt-2 flex flex-wrap gap-2">
              <Tag className="!m-0 rounded-full border-0 bg-white/70 px-3 py-1 text-slate-600">
                {room.nodeSubtype === 'UTILITY_SHARED' ? 'Shared zone' : room.departmentCode ?? 'Room'}
              </Tag>
              {auxiliaryRooms.length ? (
                <Tag className="!m-0 rounded-full border-0 bg-white/70 px-3 py-1 text-slate-600">
                  {auxiliaryRooms.length} support room{auxiliaryRooms.length > 1 ? 's' : ''}
                </Tag>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="small" onClick={() => onAddEquipment(room.id)} icon={<PlusOutlined />}>
              Add equipment
            </Button>
            <Button size="small" type="text" onClick={() => { onSelectNode(room.id); onOpenInspector(); }}>
              Edit
            </Button>
          </div>
        </div>

        {auxiliaryRooms.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {auxiliaryRooms.map((auxRoom) => (
              <button
                key={auxRoom.id}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  selectedNodeId === auxRoom.id
                    ? 'border-sky-300 bg-sky-50 text-sky-700'
                    : 'border-white/60 bg-white/75 text-slate-600'
                }`}
                onClick={() => onSelectNode(auxRoom.id)}
              >
                {auxRoom.nodeName}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`relative mt-4 overflow-hidden rounded-2xl border border-white/70 ${zoneClassMap[processZone]}`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => handleDropToZone(event, room.id, processZone)}
        >
          {processItems.length ? (
            processItems.map((node, index) =>
              renderNodeCard(node, getEffectiveHint(node, room.id, processZone, index)),
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              {isUtilityRoom ? '暂无公用工程站点' : '暂无设备，点击 Add equipment 开始布置'}
            </div>
          )}
        </div>

        {!isUtilityRoom ? (
          <div
            className={`relative mt-3 overflow-hidden rounded-2xl border border-white/70 px-3 py-3 ${zoneClassMap.pipeline_lane}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => handleDropToZone(event, room.id, 'pipeline_lane')}
          >
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Components / lines</div>
            {components.length ? (
              <div className="flex flex-wrap gap-2">
                {components.map((component) => (
                  <button
                    key={component.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${
                      selectedNodeId === component.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                    onClick={() => onSelectNode(component.id)}
                  >
                    {component.nodeName}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400">暂无组件或管线</div>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderContextCard = () => {
    if (!selectedNode) {
      return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Workspace context</div>
          <div className="mt-3 text-lg font-semibold text-slate-900">Select a room to edit</div>
          <div className="mt-2 text-sm leading-6 text-slate-500">
            主画布用于浏览和布局，详细字段、绑定和 CIP 关系都退到抽屉里处理。
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={onOpenPalette} icon={<UnorderedListOutlined />}>
              Open palette
            </Button>
            <Button type="primary" onClick={onCreateRoom} icon={<PlusOutlined />}>
              Add room
            </Button>
          </div>
        </div>
      );
    }

    if (selectedNode.nodeClass === 'EQUIPMENT_UNIT' || selectedNode.nodeClass === 'COMPONENT' || selectedNode.nodeClass === 'UTILITY_STATION') {
      const linked = Boolean(selectedNode.boundResourceId);
      return (
        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-500">Asset context</div>
          <div className="mt-2 text-xl font-semibold text-slate-900">{selectedNode.nodeName}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Tag color={linked ? 'blue' : 'default'}>{linked ? 'Resource linked' : 'Unbound asset'}</Tag>
            {!selectedNode.isActive ? <Tag color="default">停用</Tag> : null}
          </div>
          <div className="mt-3 text-sm leading-6 text-slate-500">
            {[selectedNode.equipmentSystemType, selectedNode.equipmentClass, selectedNode.equipmentModel]
              .filter(Boolean)
              .join(' / ') || selectedNode.nodeSubtype || selectedNode.nodeCode}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="primary" onClick={() => onManageBinding(selectedNode.id)}>
              Manage binding
            </Button>
            <Button onClick={onOpenInspector}>Edit details</Button>
          </div>
        </div>
      );
    }

    const qualified = selectedRoom?.isActive ?? false;
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Room context</div>
        <div className="mt-2 text-xl font-semibold text-slate-900">{selectedRoom?.nodeName ?? selectedNode.nodeName}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Tag color={qualified ? 'blue' : 'default'}>{qualified ? 'Qualified' : 'Needs review'}</Tag>
          {selectedRoom?.departmentCode ? <Tag>{selectedRoom.departmentCode}</Tag> : null}
        </div>
        <div className="mt-3 text-sm leading-6 text-slate-500">
          {selectedRoomAssetCount} schedulable assets
          {selectedRoom?.nodeSubtype === 'UTILITY_SHARED' ? ' · Shared utilities' : ' · Room-level layout'}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {selectedRoom ? (
            <Button type="primary" onClick={() => onAddEquipment(selectedRoom.id)} icon={<PlusOutlined />}>
              Add equipment
            </Button>
          ) : null}
          <Button onClick={onOpenInspector}>Edit details</Button>
        </div>
      </div>
    );
  };

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<UnorderedListOutlined />} onClick={onOpenPalette}>
              Palette
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateRoom}>
              Add room
            </Button>
            <span className="ml-2 text-sm font-medium text-slate-500">Collapse by</span>
            <Segmented
              value={groupBy}
              onChange={(value) => onGroupByChange(value as WorkbenchGroupMode)}
              options={[
                { label: 'Department', value: 'department' },
                { label: 'Team', value: 'team' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              icon={<FilterOutlined />}
              onClick={onOpenFilters}
            >
              {activeFilterCount ? `Filter (${activeFilterCount})` : 'Filter'}
            </Button>
            <Button onClick={onAutoLayout}>Auto layout</Button>
            <Button onClick={onOpenInspector}>Advanced editor</Button>
          </div>
        </div>

        <div className="w-full max-w-[360px]">{renderContextCard()}</div>
      </div>

      {!groups.length ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-slate-200 bg-slate-50/70 px-6 py-16">
          <Empty description="当前筛选条件下没有可展示的房间" />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {groups.map((group) => {
            const collapsed = Boolean(collapsedGroups[group.key]);
            const previewInGroup = createRoomPreview?.active && createRoomPreview.targetGroupKey === group.key;
            const previewCard = previewInGroup ? renderPreviewRoomCard() : null;

            if (collapsed) {
              return (
                <button
                  key={group.key}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-[26px] border px-5 py-5 text-left shadow-sm transition ${
                    previewInGroup ? 'border-[#153b61] bg-[#eef5fb]' : 'border-slate-200 bg-slate-50/70'
                  }`}
                  onClick={() => onToggleGroup(group.key)}
                >
                  <div>
                    <div className="text-lg font-semibold text-slate-900">{group.label}</div>
                    <div className="mt-2 text-sm text-slate-500">
                      {group.rooms.length} rooms · {group.assetCount} assets · {group.description}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {previewInGroup ? (
                      <Tag color="blue">{createRoomPreview?.roomName || 'Pending room'}</Tag>
                    ) : null}
                    <RightOutlined className="text-slate-400" />
                  </div>
                </button>
              );
            }

            return (
              <div
                key={group.key}
                className={`rounded-[28px] border px-4 py-4 ${
                  previewInGroup ? 'border-[#153b61] bg-[#f7fbff]' : 'border-slate-200 bg-slate-50/70'
                }`}
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left"
                    onClick={() => onToggleGroup(group.key)}
                  >
                    <DownOutlined className="text-slate-400" />
                    <div>
                      <div className="text-base font-semibold text-slate-900">{group.label}</div>
                      <div className="text-sm text-slate-500">
                        {group.rooms.length} rooms · {group.assetCount} assets · {group.description}
                      </div>
                    </div>
                  </button>
                  <Button size="small" type="text" onClick={onCreateRoom} icon={<PlusOutlined />}>
                    Add room
                  </Button>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  {group.rooms.map(renderRoomCard)}
                  {previewCard}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default FactoryLayoutCanvas;
