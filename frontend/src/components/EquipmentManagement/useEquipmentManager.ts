/**
 * useEquipmentManager — 全功能资源节点管理 Hook
 *
 * 职责：数据加载、筛选、CRUD、CIP、影响分析、导出备份
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { processTemplateV2Api } from '../../services';
import type {
  EquipmentSystemType,
  ResourceNode,
  ResourceNodeClass,
  ResourceNodePayload,
  PlannerOperation,
} from '../ProcessTemplateV2/types';
import { Resource } from '../../types/resourceModel';
import axios from 'axios';
import {
  flattenNodes,
  buildNodeMap,
  buildNodePath,
  findNode,
  filterNodesByQuery,
  BINDABLE_CLASSES,
  allowedChildBlueprints,
  buildNodeCodePreview,
  type NodeBlueprint,
} from './resourceNodeConstants';

/* ────────────────── Types ────────────────── */

export type SystemTypeFilter = 'ALL' | 'SUS' | 'SS' | 'VIRTUAL';
export type ViewMode = 'card' | 'table' | 'tree';

export interface RoomGroup {
  roomNode: ResourceNode;
  equipmentNodes: ResourceNode[];
}

export interface NodeStats {
  totalCount: number;
  roomCount: number;
  bindableCount: number;
  mappedResourceCount: number;
  susByType: number;
  ssByType: number;
  virtualByType: number;
}

/* ────────────────── Hook ────────────────── */

export function useEquipmentManager(templateId?: number) {
  /* ── State ── */
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nodes, setNodes] = useState<ResourceNode[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [impactOperations, setImpactOperations] = useState<PlannerOperation[]>([]);

  const [search, setSearch] = useState('');
  const [systemTypeFilter, setSystemTypeFilter] = useState<SystemTypeFilter>('ALL');
  const [nodeClassFilter, setNodeClassFilter] = useState<ResourceNodeClass | 'ALL'>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  /* ── Load data ── */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      const promises: Promise<any>[] = [
        processTemplateV2Api.listResourceNodes({ includeInactive: true, tree: true }),
        processTemplateV2Api.listResources(),
      ];

      if (templateId) {
        promises.push(processTemplateV2Api.getPlanner(templateId));
      }

      const results = await Promise.all(promises);
      const [nodeTree, resourceList] = results;

      setNodes(nodeTree);
      setResources(resourceList);

      if (templateId && results[2]) {
        setImpactOperations(results[2].operations ?? []);
      }

      if (nodeTree.length > 0) {
        setSelectedNodeId((current) => current ?? nodeTree[0].id);
      } else {
        setSelectedNodeId(null);
      }
    } catch (err: any) {
      console.error('Failed to load resource node data:', err);
      setNodes([]);
      setResources([]);
      setImpactOperations([]);
      setErrorMessage('资源节点管理加载失败，请先确认资源节点表和资源中心模型已就绪。');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /* ── Derived data ── */
  const allNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const nodeMap = useMemo(() => buildNodeMap(allNodes), [allNodes]);
  const selectedNode = useMemo(() => findNode(nodes, selectedNodeId), [nodes, selectedNodeId]);

  const selectedNodePath = useMemo(() => {
    if (!selectedNode) return '';
    return buildNodePath(selectedNode.id, nodeMap)
      .map((n) => n.nodeName)
      .join(' / ');
  }, [nodeMap, selectedNode]);

  const childBlueprints = useMemo<NodeBlueprint[]>(
    () => allowedChildBlueprints(selectedNode),
    [selectedNode],
  );

  /* ── Filtering ── */
  const filteredNodes = useMemo(() => {
    let list = allNodes;

    // Node class filter
    if (nodeClassFilter !== 'ALL') {
      list = list.filter((n) => n.nodeClass === nodeClassFilter);
    }

    // System type filter
    if (systemTypeFilter !== 'ALL') {
      list = list.filter(
        (n) => n.equipmentSystemType === (systemTypeFilter as EquipmentSystemType),
      );
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (n) =>
          n.nodeName.toLowerCase().includes(q) ||
          n.nodeCode.toLowerCase().includes(q) ||
          (n.boundResourceCode ?? '').toLowerCase().includes(q) ||
          (n.boundResourceName ?? '').toLowerCase().includes(q),
      );
    }

    return list;
  }, [allNodes, nodeClassFilter, systemTypeFilter, search]);

  const filteredTree = useMemo(
    () => filterNodesByQuery(nodes, search),
    [nodes, search],
  );

  /* ── Room groups (for card view) ── */
  const roomGroups = useMemo<RoomGroup[]>(() => {
    const rooms = allNodes.filter((n) => n.nodeClass === 'ROOM');
    return rooms.map((room) => ({
      roomNode: room,
      equipmentNodes: allNodes.filter((n) => n.parentId === room.id),
    }));
  }, [allNodes]);

  /* ── Statistics ── */
  const nodeStats = useMemo<NodeStats>(() => {
    const equipNodes = allNodes.filter((n) => n.nodeClass === 'EQUIPMENT_UNIT');
    return {
      totalCount: allNodes.length,
      roomCount: allNodes.filter((n) => n.nodeClass === 'ROOM').length,
      bindableCount: allNodes.filter((n) => BINDABLE_CLASSES.has(n.nodeClass)).length,
      mappedResourceCount: allNodes.filter((n) => Boolean(n.boundResourceId)).length,
      susByType: equipNodes.filter((n) => n.equipmentSystemType === 'SUS').length,
      ssByType: equipNodes.filter((n) => n.equipmentSystemType === 'SS').length,
      virtualByType: equipNodes.filter((n) => n.equipmentSystemType === 'VIRTUAL').length,
    };
  }, [allNodes]);

  /* ── Impact operations ── */
  const selectedNodeImpactOps = useMemo(
    () =>
      selectedNode
        ? impactOperations.filter(
            (op) => Number(op.defaultResourceNodeId) === Number(selectedNode.id),
          )
        : [],
    [impactOperations, selectedNode],
  );

  /* ── Available resources ── */
  const availableResources = useMemo(() => {
    const boundIds = new Set(allNodes.map((n) => n.boundResourceId).filter(Boolean));
    return resources.filter(
      (r) => !boundIds.has(r.id) || r.id === selectedNode?.boundResourceId,
    );
  }, [allNodes, resources, selectedNode?.boundResourceId]);

  const unassignedResources = useMemo(() => {
    const boundIds = new Set(allNodes.map((n) => n.boundResourceId).filter(Boolean));
    return resources.filter((r) => !boundIds.has(r.id));
  }, [allNodes, resources]);

  /* ── Room & parent options ── */
  const roomNodeOptions = useMemo(
    () => allNodes.filter((n) => n.nodeClass === 'ROOM'),
    [allNodes],
  );

  const parentOptionsForClass = useCallback(
    (nodeClass: ResourceNodeClass): ResourceNode[] => {
      switch (nodeClass) {
        case 'SITE':
          return []; // root
        case 'LINE':
          return allNodes.filter((n) => n.nodeClass === 'SITE');
        case 'ROOM':
          return allNodes.filter(
            (n) => n.nodeClass === 'SITE' || n.nodeClass === 'LINE' || n.nodeClass === 'ROOM',
          );
        case 'EQUIPMENT_UNIT':
          return allNodes.filter(
            (n) => n.nodeClass === 'ROOM' && n.nodeSubtype === 'MAIN_PROCESS',
          );
        case 'COMPONENT':
          return allNodes.filter((n) => n.nodeClass === 'EQUIPMENT_UNIT');
        case 'UTILITY_STATION':
          return allNodes.filter(
            (n) => n.nodeClass === 'ROOM' && n.nodeSubtype === 'UTILITY_SHARED',
          );
        default:
          return allNodes;
      }
    },
    [allNodes],
  );

  /* ── Code preview ── */
  const getCodePreview = useCallback(
    (nodeScope: string, departmentCode: string | null, nodeClass: ResourceNodeClass) =>
      buildNodeCodePreview(nodeScope as any, departmentCode, nodeClass, allNodes),
    [allNodes],
  );

  /* ── CRUD ── */
  const createNode = useCallback(
    async (payload: ResourceNodePayload) => {
      const createdId = await processTemplateV2Api.createResourceNode(payload);
      setSelectedNodeId(createdId);
      await loadData();
      return createdId;
    },
    [loadData],
  );

  const updateNode = useCallback(
    async (nodeId: number, payload: Partial<ResourceNodePayload>) => {
      await processTemplateV2Api.updateResourceNode(nodeId, payload);
      await loadData();
    },
    [loadData],
  );

  const deleteNode = useCallback(
    async (nodeId: number) => {
      await processTemplateV2Api.deleteResourceNode(nodeId);
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
      await loadData();
    },
    [loadData, selectedNodeId],
  );

  const toggleActive = useCallback(
    async (nodeId: number, isActive: boolean) => {
      await processTemplateV2Api.updateResourceNode(nodeId, { isActive });
      await loadData();
    },
    [loadData],
  );

  const moveNode = useCallback(
    async (nodeId: number, parentId: number | null, sortOrder?: number) => {
      await processTemplateV2Api.moveResourceNode(nodeId, { parentId, sortOrder });
      await loadData();
    },
    [loadData],
  );

  /* ── Batch ── */
  const batchToggleActive = useCallback(
    async (ids: number[], isActive: boolean) => {
      await Promise.all(
        ids.map((id) => processTemplateV2Api.updateResourceNode(id, { isActive })),
      );
      setSelectedIds([]);
      await loadData();
    },
    [loadData],
  );

  const batchDelete = useCallback(
    async (ids: number[]) => {
      await Promise.all(ids.map((id) => processTemplateV2Api.deleteResourceNode(id)));
      setSelectedIds([]);
      await loadData();
    },
    [loadData],
  );

  /* ── Resource binding ── */
  const bindResource = useCallback(
    async (nodeId: number, resourceId: number | null) => {
      await processTemplateV2Api.updateResourceNode(nodeId, { boundResourceId: resourceId });
      await loadData();
    },
    [loadData],
  );

  const createResourceAndBind = useCallback(
    async (nodeId: number, resourcePayload: any) => {
      const response = await axios.post('/api/resources', {
        resource_code: resourcePayload.resourceCode,
        resource_name: resourcePayload.resourceName,
        resource_type: resourcePayload.resourceType,
        department_code: resourcePayload.departmentCode,
        owner_org_unit_id: resourcePayload.ownerOrgUnitId ?? null,
        status: resourcePayload.status,
        capacity: resourcePayload.capacity,
        location: resourcePayload.location ?? null,
        clean_level: resourcePayload.cleanLevel ?? null,
        is_shared: resourcePayload.isShared ? 1 : 0,
        is_schedulable: resourcePayload.isSchedulable ? 1 : 0,
        metadata: resourcePayload.metadata ?? null,
      });
      const createdResourceId = Number(response.data.id);
      await processTemplateV2Api.updateResourceNode(nodeId, {
        boundResourceId: createdResourceId,
      });
      await loadData();
      return createdResourceId;
    },
    [loadData],
  );

  /* ── Export & rebuild ── */
  const exportBackup = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      nodes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resource-nodes-backup-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }, [nodes]);

  const clearForRebuild = useCallback(async () => {
    await processTemplateV2Api.clearResourceNodeTreeForRebuild();
    setSelectedNodeId(null);
    await loadData();
  }, [loadData]);

  /* ── Return ── */
  return {
    // State
    loading,
    errorMessage,
    nodes,
    allNodes,
    nodeMap,
    resources,

    // Selection
    selectedNodeId,
    setSelectedNodeId,
    selectedNode,
    selectedNodePath,
    selectedIds,
    setSelectedIds,
    childBlueprints,

    // Filters
    search,
    setSearch,
    systemTypeFilter,
    setSystemTypeFilter,
    nodeClassFilter,
    setNodeClassFilter,
    viewMode,
    setViewMode,

    // Derived
    filteredNodes,
    filteredTree,
    roomGroups,
    nodeStats,
    selectedNodeImpactOps,
    availableResources,
    unassignedResources,
    roomNodeOptions,
    parentOptionsForClass,
    getCodePreview,

    // CRUD
    createNode,
    updateNode,
    deleteNode,
    toggleActive,
    moveNode,

    // Batch
    batchToggleActive,
    batchDelete,

    // Binding
    bindResource,
    createResourceAndBind,

    // Export
    exportBackup,
    clearForRebuild,

    // Refresh
    refresh: loadData,
  };
}
