import { useState, useEffect, useCallback, useMemo } from 'react';
import { processTemplateV2Api } from '../../services/processTemplateV2Api';
import type {
  ResourceNode,
  ResourceNodePayload,
  EquipmentSystemType,
} from '../ProcessTemplateV2/types';

export type EquipmentViewMode = 'card' | 'table';
export type SystemTypeFilter = 'ALL' | 'SUS' | 'SS';

export interface RoomGroup {
  roomId: number | null;
  roomName: string;
  roomCode: string;
  nodes: ResourceNode[];
}

function flattenNodes(nodes: ResourceNode[]): ResourceNode[] {
  const result: ResourceNode[] = [];
  const walk = (list: ResourceNode[]) => {
    for (const n of list) {
      result.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(list);
  return result;
}

function buildRoomGroups(nodes: ResourceNode[]): RoomGroup[] {
  const flat = flattenNodes(nodes);
  const equipmentNodes = flat.filter(
    (n) => n.nodeClass === 'EQUIPMENT_UNIT' || n.nodeClass === 'COMPONENT',
  );

  const groupMap = new Map<number | null, RoomGroup>();
  const roomNodes = flat.filter((n) => n.nodeClass === 'ROOM');
  const roomLookup = new Map(roomNodes.map((r) => [r.id, r]));

  for (const eq of equipmentNodes) {
    const parentRoom = findAncestorRoom(eq, flat, roomLookup);
    const key = parentRoom?.id ?? null;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        roomId: key,
        roomName: parentRoom?.nodeName ?? '未分配房间',
        roomCode: parentRoom?.nodeCode ?? '',
        nodes: [],
      });
    }
    groupMap.get(key)!.nodes.push(eq);
  }

  const groups = Array.from(groupMap.values());
  groups.sort((a, b) => {
    if (a.roomId === null) return 1;
    if (b.roomId === null) return -1;
    return a.roomName.localeCompare(b.roomName);
  });
  return groups;
}

function findAncestorRoom(
  node: ResourceNode,
  flatList: ResourceNode[],
  roomLookup: Map<number, ResourceNode>,
): ResourceNode | null {
  let currentParentId = node.parentId;
  const visited = new Set<number>();
  while (currentParentId !== null) {
    if (visited.has(currentParentId)) break;
    visited.add(currentParentId);
    if (roomLookup.has(currentParentId)) return roomLookup.get(currentParentId)!;
    const parent = flatList.find((n) => n.id === currentParentId);
    if (!parent) break;
    currentParentId = parent.parentId;
  }
  return null;
}

export function useEquipmentManager() {
  const [allNodes, setAllNodes] = useState<ResourceNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [systemTypeFilter, setSystemTypeFilter] = useState<SystemTypeFilter>('ALL');
  const [viewMode, setViewMode] = useState<EquipmentViewMode>('card');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const loadNodes = useCallback(async () => {
    setLoading(true);
    try {
      const nodes = await processTemplateV2Api.listResourceNodes({
        tree: true,
        includeInactive: true,
      });
      setAllNodes(nodes);
    } catch (err) {
      console.error('Failed to load equipment nodes:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNodes();
  }, [loadNodes]);

  const flatNodes = useMemo(() => flattenNodes(allNodes), [allNodes]);

  const equipmentNodes = useMemo(
    () => flatNodes.filter((n) => n.nodeClass === 'EQUIPMENT_UNIT' || n.nodeClass === 'COMPONENT'),
    [flatNodes],
  );

  const filteredNodes = useMemo(() => {
    let result = equipmentNodes;

    if (systemTypeFilter !== 'ALL') {
      result = result.filter(
        (n) => n.equipmentSystemType === (systemTypeFilter as EquipmentSystemType),
      );
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (n) =>
          n.nodeName.toLowerCase().includes(q) ||
          n.nodeCode.toLowerCase().includes(q) ||
          (n.equipmentClass ?? '').toLowerCase().includes(q) ||
          (n.equipmentModel ?? '').toLowerCase().includes(q),
      );
    }

    return result;
  }, [equipmentNodes, systemTypeFilter, search]);

  const roomGroups = useMemo(() => {
    const flat = flatNodes;
    const roomNodes = flat.filter((n) => n.nodeClass === 'ROOM');
    const roomLookup = new Map(roomNodes.map((r) => [r.id, r]));

    const groupMap = new Map<number | null, RoomGroup>();

    for (const eq of filteredNodes) {
      const parentRoom = findAncestorRoom(eq, flat, roomLookup);
      const key = parentRoom?.id ?? null;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          roomId: key,
          roomName: parentRoom?.nodeName ?? '未分配房间',
          roomCode: parentRoom?.nodeCode ?? '',
          nodes: [],
        });
      }
      groupMap.get(key)!.nodes.push(eq);
    }

    const groups = Array.from(groupMap.values());
    groups.sort((a, b) => {
      if (a.roomId === null) return 1;
      if (b.roomId === null) return -1;
      return a.roomName.localeCompare(b.roomName);
    });
    return groups;
  }, [filteredNodes, flatNodes]);

  const roomNodeOptions = useMemo(
    () => flatNodes.filter((n) => n.nodeClass === 'ROOM'),
    [flatNodes],
  );

  const selectedNode = useMemo(
    () => (selectedNodeId !== null ? flatNodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [selectedNodeId, flatNodes],
  );

  const counts = useMemo(() => {
    const all = equipmentNodes.length;
    const sus = equipmentNodes.filter((n) => n.equipmentSystemType === 'SUS').length;
    const ss = equipmentNodes.filter((n) => n.equipmentSystemType === 'SS').length;
    return { all, sus, ss };
  }, [equipmentNodes]);

  const createNode = useCallback(
    async (payload: ResourceNodePayload) => {
      await processTemplateV2Api.createResourceNode(payload);
      await loadNodes();
    },
    [loadNodes],
  );

  const updateNode = useCallback(
    async (nodeId: number, payload: Partial<ResourceNodePayload>) => {
      await processTemplateV2Api.updateResourceNode(nodeId, payload);
      await loadNodes();
    },
    [loadNodes],
  );

  const deleteNode = useCallback(
    async (nodeId: number) => {
      await processTemplateV2Api.deleteResourceNode(nodeId);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      await loadNodes();
    },
    [loadNodes, selectedNodeId],
  );

  const toggleActive = useCallback(
    async (nodeId: number, isActive: boolean) => {
      await processTemplateV2Api.updateResourceNode(nodeId, { isActive });
      await loadNodes();
    },
    [loadNodes],
  );

  const batchToggleActive = useCallback(
    async (nodeIds: number[], isActive: boolean) => {
      await Promise.all(
        nodeIds.map((id) => processTemplateV2Api.updateResourceNode(id, { isActive })),
      );
      await loadNodes();
    },
    [loadNodes],
  );

  const batchDelete = useCallback(
    async (nodeIds: number[]) => {
      await Promise.all(nodeIds.map((id) => processTemplateV2Api.deleteResourceNode(id)));
      if (selectedNodeId !== null && nodeIds.includes(selectedNodeId)) setSelectedNodeId(null);
      setSelectedIds([]);
      await loadNodes();
    },
    [loadNodes, selectedNodeId],
  );

  return {
    allNodes,
    flatNodes,
    equipmentNodes,
    filteredNodes,
    roomGroups,
    roomNodeOptions,
    selectedNode,
    selectedNodeId,
    selectedIds,
    loading,
    search,
    systemTypeFilter,
    viewMode,
    counts,
    setSearch,
    setSystemTypeFilter,
    setViewMode,
    setSelectedNodeId,
    setSelectedIds,
    createNode,
    updateNode,
    deleteNode,
    toggleActive,
    batchToggleActive,
    batchDelete,
    refresh: loadNodes,
  };
}
