import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tree,
  message,
} from 'antd';
import {
  AppstoreOutlined,
  ApartmentOutlined,
  HomeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { DataNode } from 'antd/es/tree';
import { ResourceFormModal } from '../Platform/PlatformEditors';
import { Resource } from '../../types/platform';
import { processTemplateV2Api } from '../../services';
import { PlannerOperation, ResourceNode, ResourceNodeClass, TeamSummary } from './types';

const NODE_CLASS_OPTIONS: Array<{ label: string; value: ResourceNodeClass }> = [
  { label: 'Suite', value: 'SUITE' },
  { label: '房间', value: 'ROOM' },
  { label: '设备', value: 'EQUIPMENT' },
  { label: '设备组件', value: 'COMPONENT' },
  { label: '分组', value: 'GROUP' },
];

const NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SUITE: 'STE',
  ROOM: 'ROM',
  EQUIPMENT: 'EQP',
  COMPONENT: 'CMP',
  GROUP: 'GRP',
};

const NODE_CLASS_LABEL: Record<ResourceNodeClass, string> = {
  SUITE: 'Suite',
  ROOM: '房间',
  EQUIPMENT: '设备',
  COMPONENT: '组件',
  GROUP: '分组',
};

const NODE_CLASS_BADGE_CLASS: Record<ResourceNodeClass, string> = {
  SUITE: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  ROOM: 'border-sky-200 bg-sky-50 text-sky-700',
  EQUIPMENT: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  COMPONENT: 'border-amber-200 bg-amber-50 text-amber-700',
  GROUP: 'border-violet-200 bg-violet-50 text-violet-700',
};

const NODE_CLASS_ICON: Record<ResourceNodeClass, React.ReactNode> = {
  SUITE: <ApartmentOutlined />,
  ROOM: <HomeOutlined />,
  EQUIPMENT: <ToolOutlined />,
  COMPONENT: <SettingOutlined />,
  GROUP: <AppstoreOutlined />,
};

const ROOM_SCENE_NODE_CLASSES: ResourceNodeClass[] = ['EQUIPMENT', 'COMPONENT', 'GROUP'];

interface NodeFormValues {
  nodeCode: string;
  nodeName: string;
  nodeClass: ResourceNodeClass;
  parentId?: number | null;
  departmentCode: string;
  ownerOrgUnitId?: number | null;
  boundResourceId?: number | null;
  sortOrder?: number;
  isActive: boolean;
  metadataText?: string;
}

interface TemplateResourceNodeManagementTabProps {
  templateId: number;
  active?: boolean;
  refreshKey?: number;
}

const flattenNodes = (nodes: ResourceNode[]): ResourceNode[] => {
  const result: ResourceNode[] = [];
  const walk = (items: ResourceNode[]) => {
    items.forEach((item) => {
      result.push(item);
      walk(item.children);
    });
  };
  walk(nodes);
  return result;
};

const toTreeData = (nodes: ResourceNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.id,
    title: (
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-slate-500">{NODE_CLASS_ICON[node.nodeClass]}</span>
        <span className="truncate text-slate-800">
          {node.nodeName}
          {node.boundResourceCode ? ` / ${node.boundResourceCode}` : ''}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${NODE_CLASS_BADGE_CLASS[node.nodeClass]}`}
        >
          {NODE_CLASS_LABEL[node.nodeClass]}
        </span>
      </div>
    ),
    children: toTreeData(node.children),
  }));

const findNode = (nodes: ResourceNode[], nodeId: number | null): ResourceNode | null => {
  if (!nodeId) {
    return null;
  }

  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }
    const child = findNode(node.children, nodeId);
    if (child) {
      return child;
    }
  }

  return null;
};

const buildNodeCodePreview = (
  departmentCode: string,
  nodeClass: ResourceNodeClass,
  nodes: ResourceNode[],
) => {
  const prefix = `RN-${departmentCode}-${NODE_CLASS_CODE[nodeClass]}`;
  const maxSuffix = nodes.reduce((max, node) => {
    if (!node.nodeCode.startsWith(`${prefix}-`)) {
      return max;
    }
    const match = node.nodeCode.match(/-(\d{4,})$/);
    const suffix = Number(match?.[1] ?? 0);
    return Math.max(max, suffix);
  }, 0);

  return `${prefix}-${String(maxSuffix + 1).padStart(4, '0')}`;
};

const buildNodeMap = (nodes: ResourceNode[]) => {
  const map = new Map<number, ResourceNode>();
  nodes.forEach((node) => {
    map.set(node.id, node);
  });
  return map;
};

const buildParentMap = (nodes: ResourceNode[]) => {
  const map = new Map<number, number | null>();
  nodes.forEach((node) => {
    map.set(node.id, node.parentId ?? null);
  });
  return map;
};

const buildNodePath = (nodeId: number, nodeMap: Map<number, ResourceNode>): ResourceNode[] => {
  const visited = new Set<number>();
  const path: ResourceNode[] = [];
  let currentId: number | null = nodeId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const current = nodeMap.get(currentId);
    if (!current) {
      break;
    }
    path.unshift(current);
    currentId = current.parentId ?? null;
  }

  return path;
};

const isDescendantOf = (nodeId: number, ancestorId: number, parentMap: Map<number, number | null>) => {
  let currentId = parentMap.get(nodeId) ?? null;
  while (currentId) {
    if (currentId === ancestorId) {
      return true;
    }
    currentId = parentMap.get(currentId) ?? null;
  }

  return false;
};

const resolveParentRoomNode = (
  node: ResourceNode | null,
  nodeMap: Map<number, ResourceNode>,
): ResourceNode | null => {
  if (!node) {
    return null;
  }

  if (node.nodeClass === 'ROOM') {
    return node;
  }

  let currentId = node.parentId ?? null;
  while (currentId) {
    const current = nodeMap.get(currentId);
    if (!current) {
      return null;
    }

    if (current.nodeClass === 'ROOM') {
      return current;
    }

    currentId = current.parentId ?? null;
  }

  return null;
};

const TemplateResourceNodeManagementTab: React.FC<TemplateResourceNodeManagementTabProps> = ({
  templateId,
  active = true,
  refreshKey = 0,
}) => {
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<ResourceNode[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [impactOperations, setImpactOperations] = useState<PlannerOperation[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);
  const [warehouseKeyword, setWarehouseKeyword] = useState('');
  const [formMode, setFormMode] = useState<'edit' | 'create-root' | 'create-child'>('edit');
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [creatingResourceForNodeId, setCreatingResourceForNodeId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<NodeFormValues>({
    nodeCode: '',
    nodeName: '',
    nodeClass: 'SUITE',
    parentId: null,
    departmentCode: 'USP',
    ownerOrgUnitId: null,
    boundResourceId: null,
    sortOrder: undefined,
    isActive: true,
    metadataText: '',
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [nodeTree, resourceList, plannerResponse, teamsResponse] = await Promise.all([
        processTemplateV2Api.listResourceNodes({ includeInactive: true, tree: true }),
        processTemplateV2Api.listResources(),
        processTemplateV2Api.getPlanner(templateId),
        axios.get('/api/organization/teams').then((response) => response.data as TeamSummary[]),
      ]);
      setNodes(nodeTree);
      setResources(resourceList);
      setImpactOperations(plannerResponse.operations);
      setTeams(teamsResponse);
      if (nodeTree.length > 0) {
        setSelectedNodeId((current) => current ?? nodeTree[0].id);
      }
    } catch (error) {
      console.error('Failed to load resource node management data:', error);
      setNodes([]);
      setResources([]);
      setImpactOperations([]);
      setTeams([]);
      setErrorMessage('资源节点管理加载失败，请先确认资源节点表和资源中心模型已就绪。');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void loadData();
  }, [active, loadData, refreshKey]);

  const allNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const nodeMap = useMemo(() => buildNodeMap(allNodes), [allNodes]);
  const parentMap = useMemo(() => buildParentMap(allNodes), [allNodes]);
  const selectedNode = useMemo(() => findNode(nodes, selectedNodeId), [nodes, selectedNodeId]);
  const roomNodes = useMemo(() => allNodes.filter((node) => node.nodeClass === 'ROOM'), [allNodes]);

  const activeRoom = useMemo(() => {
    if (!activeRoomId) {
      return null;
    }

    const matched = nodeMap.get(activeRoomId);
    return matched?.nodeClass === 'ROOM' ? matched : null;
  }, [activeRoomId, nodeMap]);

  const roomPlacedNodes = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    return [...activeRoom.children]
      .filter((node) => ROOM_SCENE_NODE_CLASSES.includes(node.nodeClass))
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  }, [activeRoom]);

  const warehouseNodes = useMemo(() => {
    if (!activeRoom) {
      return [];
    }

    const query = warehouseKeyword.trim().toLowerCase();
    return allNodes
      .filter((node) => ROOM_SCENE_NODE_CLASSES.includes(node.nodeClass))
      .filter((node) => node.id !== activeRoom.id)
      .filter((node) => !isDescendantOf(node.id, activeRoom.id, parentMap))
      .filter((node) => {
        if (!query) {
          return true;
        }

        const searchPayload = [
          node.nodeCode,
          node.nodeName,
          node.boundResourceCode,
          node.boundResourceName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return searchPayload.includes(query);
      })
      .sort((left, right) => left.nodeName.localeCompare(right.nodeName, 'zh-CN'))
      .slice(0, 40);
  }, [activeRoom, allNodes, parentMap, warehouseKeyword]);

  const roomSceneSlots = useMemo(() => {
    const slotCount = Math.max(6, roomPlacedNodes.length + 2);
    return Array.from({ length: slotCount }, (_, index) => roomPlacedNodes[index] ?? null);
  }, [roomPlacedNodes]);

  const roomSelectOptions = useMemo(
    () =>
      roomNodes.map((room) => ({
        value: room.id,
        label: buildNodePath(room.id, nodeMap)
          .map((item) => item.nodeName)
          .join(' / '),
      })),
    [roomNodes, nodeMap],
  );

  const nodeStats = useMemo(
    () => ({
      roomCount: roomNodes.length,
      equipmentCount: allNodes.filter((node) => node.nodeClass === 'EQUIPMENT').length,
      componentCount: allNodes.filter((node) => node.nodeClass === 'COMPONENT').length,
      mappedResourceCount: allNodes.filter((node) => Boolean(node.boundResourceId)).length,
    }),
    [allNodes, roomNodes.length],
  );

  const selectedNodePath = useMemo(() => {
    if (!selectedNode) {
      return '';
    }

    return buildNodePath(selectedNode.id, nodeMap)
      .map((item) => item.nodeName)
      .join(' / ');
  }, [nodeMap, selectedNode]);

  useEffect(() => {
    if (!roomNodes.length) {
      setActiveRoomId(null);
      return;
    }

    setActiveRoomId((current) => {
      if (!current) {
        return roomNodes[0].id;
      }
      return roomNodes.some((room) => room.id === current) ? current : roomNodes[0].id;
    });
  }, [roomNodes]);

  useEffect(() => {
    const roomNode = resolveParentRoomNode(selectedNode, nodeMap);
    if (roomNode) {
      setActiveRoomId(roomNode.id);
    }
  }, [selectedNode, nodeMap]);

  useEffect(() => {
    if (formMode === 'edit' && selectedNode) {
      setDraftValues({
        nodeCode: selectedNode.nodeCode,
        nodeName: selectedNode.nodeName,
        nodeClass: selectedNode.nodeClass,
        parentId: selectedNode.parentId ?? null,
        departmentCode: selectedNode.departmentCode,
        ownerOrgUnitId: selectedNode.ownerOrgUnitId ?? null,
        boundResourceId: selectedNode.boundResourceId ?? null,
        sortOrder: selectedNode.sortOrder,
        isActive: selectedNode.isActive,
        metadataText: selectedNode.metadata ? JSON.stringify(selectedNode.metadata, null, 2) : '',
      });
      return;
    }

    if (formMode === 'create-root') {
      setDraftValues({
        nodeCode: '',
        nodeName: '',
        nodeClass: 'SUITE',
        parentId: null,
        departmentCode: 'USP',
        ownerOrgUnitId: null,
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
      return;
    }

    if (formMode === 'create-child' && selectedNode) {
      const defaultChildClass: ResourceNodeClass =
        selectedNode.nodeClass === 'SUITE'
          ? 'ROOM'
          : selectedNode.nodeClass === 'ROOM'
            ? 'EQUIPMENT'
            : selectedNode.nodeClass === 'EQUIPMENT'
              ? 'COMPONENT'
              : 'GROUP';

      setDraftValues({
        nodeCode: '',
        nodeName: '',
        nodeClass: defaultChildClass,
        parentId: selectedNode.id,
        departmentCode: selectedNode.departmentCode,
        ownerOrgUnitId: selectedNode.ownerOrgUnitId ?? null,
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
    }
  }, [formMode, selectedNode]);

  const availableResources = useMemo(() => {
    const boundIds = new Set(allNodes.map((node) => node.boundResourceId).filter(Boolean));
    return resources.filter((resource) => !boundIds.has(resource.id) || resource.id === selectedNode?.boundResourceId);
  }, [allNodes, resources, selectedNode?.boundResourceId]);

  const unassignedResources = useMemo(() => {
    const boundIds = new Set(allNodes.map((node) => node.boundResourceId).filter(Boolean));
    return resources.filter((resource) => !boundIds.has(resource.id));
  }, [allNodes, resources]);

  const impactedOperations = useMemo(
    () =>
      selectedNode
        ? impactOperations.filter((operation) => Number(operation.defaultResourceNodeId) === Number(selectedNode.id))
        : [],
    [impactOperations, selectedNode],
  );

  const generatedNodeCodePreview = useMemo(
    () => buildNodeCodePreview(draftValues.departmentCode, draftValues.nodeClass, allNodes),
    [allNodes, draftValues.departmentCode, draftValues.nodeClass],
  );

  const handleSaveNode = async () => {
    try {
      if (!draftValues.nodeName.trim()) {
        message.error('请输入节点名称');
        return;
      }

      let metadata: Record<string, unknown> | null = null;
      if (draftValues.metadataText?.trim()) {
        try {
          metadata = JSON.parse(draftValues.metadataText);
        } catch {
          message.error('扩展信息 JSON 格式不正确，请修正后再保存。');
          return;
        }
      }
      const payload = {
        nodeCode: formMode === 'edit' ? draftValues.nodeCode.trim() : undefined,
        nodeName: draftValues.nodeName.trim(),
        nodeClass: draftValues.nodeClass,
        parentId: draftValues.parentId ?? null,
        departmentCode: draftValues.departmentCode,
        ownerOrgUnitId: draftValues.ownerOrgUnitId ?? null,
        boundResourceId: draftValues.boundResourceId ?? null,
        sortOrder: draftValues.sortOrder,
        isActive: draftValues.isActive,
        metadata,
      };

      if (formMode === 'edit' && selectedNode) {
        await processTemplateV2Api.updateResourceNode(selectedNode.id, payload);
        message.success('资源节点已更新');
      } else {
        const createdId = await processTemplateV2Api.createResourceNode(payload);
        setSelectedNodeId(createdId);
        setFormMode('edit');
        message.success('资源节点已创建');
      }

      await loadData();
    } catch (error: any) {
      console.error('Failed to save resource node:', error);
      message.error(error?.response?.data?.error || error?.message || '保存资源节点失败');
    }
  };

  const handleDeleteNode = async () => {
    if (!selectedNode) {
      return;
    }

    try {
      await processTemplateV2Api.deleteResourceNode(selectedNode.id);
      message.success('资源节点已删除');
      setSelectedNodeId(null);
      setFormMode('edit');
      await loadData();
    } catch (error: any) {
      console.error('Failed to delete resource node:', error);
      message.error(error?.response?.data?.error || '删除资源节点失败');
    }
  };

  const handleTreeDrop = async (info: any) => {
    const dragNodeId = Number(info.dragNode.key);
    const dropNodeId = Number(info.node.key);
    const dropNode = allNodes.find((node) => node.id === dropNodeId);

    if (!dropNode || dragNodeId === dropNodeId) {
      return;
    }

    try {
      if (info.dropToGap) {
        await processTemplateV2Api.moveResourceNode(dragNodeId, {
          parentId: dropNode.parentId ?? null,
          sortOrder: dropNode.sortOrder,
        });
      } else {
        await processTemplateV2Api.moveResourceNode(dragNodeId, {
          parentId: dropNode.id,
        });
      }
      message.success('资源节点层级已更新');
      await loadData();
    } catch (error: any) {
      console.error('Failed to move resource node:', error);
      message.error(error?.response?.data?.error || '移动资源节点失败');
    }
  };

  const handleMoveNodeToRoom = async (nodeId: number, sortOrder?: number) => {
    if (!activeRoom) {
      message.warning('请先选择目标房间');
      return;
    }

    if (nodeId === activeRoom.id) {
      return;
    }

    if (isDescendantOf(activeRoom.id, nodeId, parentMap)) {
      message.error('不能将父级节点摆放到其子节点房间中');
      return;
    }

    try {
      await processTemplateV2Api.moveResourceNode(nodeId, {
        parentId: activeRoom.id,
        sortOrder,
      });
      setSelectedNodeId(nodeId);
      setFormMode('edit');
      message.success('设备已摆放到房间');
      await loadData();
    } catch (error: any) {
      console.error('Failed to move node into room:', error);
      message.error(error?.response?.data?.error || '摆放设备失败');
    } finally {
      setDraggingNodeId(null);
    }
  };

  const handleMoveNodeWithinRoom = async (nodeId: number, direction: 'forward' | 'backward') => {
    if (!activeRoom) {
      return;
    }

    const currentIndex = roomPlacedNodes.findIndex((node) => node.id === nodeId);
    if (currentIndex < 0) {
      return;
    }

    const targetIndex = direction === 'forward' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= roomPlacedNodes.length) {
      return;
    }

    const targetNode = roomPlacedNodes[targetIndex];
    await handleMoveNodeToRoom(nodeId, targetNode.sortOrder);
  };

  const handleMoveNodeOutOfRoom = async (nodeId: number) => {
    if (!activeRoom) {
      return;
    }

    try {
      await processTemplateV2Api.moveResourceNode(nodeId, {
        parentId: activeRoom.parentId ?? null,
      });
      message.success('设备已移出当前房间');
      await loadData();
    } catch (error: any) {
      console.error('Failed to move node out of room:', error);
      message.error(error?.response?.data?.error || '移出房间失败');
    }
  };

  const handleSceneDragStart = (event: React.DragEvent<HTMLDivElement>, nodeId: number) => {
    setDraggingNodeId(nodeId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/resource-node-id', String(nodeId));
    event.dataTransfer.setData('text/plain', String(nodeId));
  };

  const handleSceneDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    options?: {
      sortOrder?: number;
    },
  ) => {
    event.preventDefault();
    const rawValue =
      event.dataTransfer.getData('application/resource-node-id') ||
      event.dataTransfer.getData('text/plain') ||
      (draggingNodeId ? String(draggingNodeId) : '');
    const nodeId = Number(rawValue);
    if (!Number.isInteger(nodeId) || nodeId <= 0) {
      setDraggingNodeId(null);
      return;
    }

    await handleMoveNodeToRoom(nodeId, options?.sortOrder);
  };

  const handleSceneDragEnd = () => {
    setDraggingNodeId(null);
  };

  const handleCreateResource = async (payload: any) => {
    try {
      const response = await axios.post('/api/resources', {
        resource_code: payload.resourceCode,
        resource_name: payload.resourceName,
        resource_type: payload.resourceType,
        department_code: payload.departmentCode,
        owner_org_unit_id: payload.ownerOrgUnitId ?? null,
        status: payload.status,
        capacity: payload.capacity,
        location: payload.location ?? null,
        clean_level: payload.cleanLevel ?? null,
        is_shared: payload.isShared ? 1 : 0,
        is_schedulable: payload.isSchedulable ? 1 : 0,
        metadata: payload.metadata ?? null,
      });

      const createdResourceId = Number(response.data.id);
      if (creatingResourceForNodeId) {
        await processTemplateV2Api.updateResourceNode(creatingResourceForNodeId, {
          boundResourceId: createdResourceId,
        });
      }

      setResourceModalOpen(false);
      setCreatingResourceForNodeId(null);
      message.success('资源已创建并绑定');
      await loadData();
    } catch (error: any) {
      console.error('Failed to create resource:', error);
      message.error(error?.response?.data?.error || '新建资源失败');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[540px] items-center justify-center rounded-3xl border border-slate-200 bg-white">
        <Spin />
      </div>
    );
  }

  if (errorMessage) {
    return <Alert type="error" showIcon message={errorMessage} />;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-5 py-5 shadow-sm">
        <div>
          <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold tracking-wide text-white inline-block">
            节点管理
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">房间场景节点编辑</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            以“房间 + 设备摆放”的方式维护节点层级，设备可直接拖拽进房间并调整站位顺序。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">房间</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.roomCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">设备</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.equipmentCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">组件</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.componentCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">已挂载资源</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.mappedResourceCount}</div>
            </div>
          </div>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            刷新
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setFormMode('create-root');
              setSelectedNodeId(null);
            }}
          >
            新增根节点
          </Button>
          <Button
            icon={<PlusOutlined />}
            disabled={!selectedNode}
            onClick={() => setFormMode('create-child')}
          >
            新增子节点
          </Button>
        </Space>
      </div>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">资源节点树</div>
            {nodes.length ? (
              <Tree
                draggable
                blockNode
                treeData={toTreeData(nodes)}
                selectedKeys={selectedNodeId ? [selectedNodeId] : []}
                onSelect={(keys) => {
                  const nextId = keys.length ? Number(keys[0]) : null;
                  setSelectedNodeId(nextId);
                  setFormMode('edit');
                }}
                onDrop={(info) => void handleTreeDrop(info)}
                defaultExpandAll
              />
            ) : (
              <Empty description="尚未创建资源节点" />
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">房间导航</div>
            {roomNodes.length ? (
              <div className="max-h-64 space-y-2 overflow-auto">
                {roomNodes.map((room) => {
                  const pathLabel = buildNodePath(room.id, nodeMap)
                    .map((item) => item.nodeName)
                    .join(' / ');
                  const active = room.id === activeRoomId;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                        active
                          ? 'border-sky-300 bg-sky-50 text-sky-700'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                      onClick={() => {
                        setActiveRoomId(room.id);
                        setSelectedNodeId(room.id);
                        setFormMode('edit');
                      }}
                    >
                      <div className="text-sm font-medium">{room.nodeName}</div>
                      <div className="mt-1 text-xs text-slate-500">{pathLabel}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty description="暂无房间节点，请先创建 ROOM 节点" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">房间场景编辑器</div>
                <h4 className="mt-1 text-lg font-semibold text-slate-900">
                  {activeRoom ? activeRoom.nodeName : '请选择房间'}
                </h4>
                <p className="mt-1 text-xs text-slate-500">
                  将设备卡片拖到房间平面图中完成摆放，也可以点击“放入房间”按钮进行无拖拽操作。
                </p>
              </div>
              <Space wrap>
                <Select
                  value={activeRoomId ?? undefined}
                  options={roomSelectOptions}
                  style={{ width: 260 }}
                  placeholder="选择房间"
                  onChange={(value) => {
                    setActiveRoomId(value);
                    setSelectedNodeId(value);
                    setFormMode('edit');
                  }}
                />
                <Button
                  icon={<PlusOutlined />}
                  disabled={!activeRoom}
                  onClick={() => {
                    if (!activeRoom) {
                      return;
                    }
                    setSelectedNodeId(activeRoom.id);
                    setFormMode('create-child');
                  }}
                >
                  在房间新增设备
                </Button>
              </Space>
            </div>

            {!activeRoom ? (
              <Empty description="请选择房间后开始拟物编辑" />
            ) : (
              <div className="space-y-4">
                <div
                  className="rounded-3xl border-2 border-dashed border-slate-300 bg-[radial-gradient(circle_at_20%_20%,rgba(203,213,225,0.2),rgba(255,255,255,0.95))] p-4"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => void handleSceneDrop(event)}
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-700">房间平面图</div>
                    <div className="text-xs text-slate-500">
                      已摆放 {roomPlacedNodes.length} 台设备
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {roomSceneSlots.map((node, index) => (
                      <div
                        key={`scene-slot-${index}-${node?.id ?? 'empty'}`}
                        className={`min-h-[148px] rounded-2xl border p-3 transition ${
                          node
                            ? 'border-slate-300 bg-white shadow-sm'
                            : draggingNodeId
                              ? 'border-sky-300 bg-sky-50/70'
                              : 'border-slate-200 bg-slate-50/70'
                        }`}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => void handleSceneDrop(event, { sortOrder: index + 1 })}
                      >
                        {node ? (
                          <div
                            draggable
                            onDragStart={(event) => handleSceneDragStart(event, node.id)}
                            onDragEnd={handleSceneDragEnd}
                            className={`h-full cursor-grab rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-100 p-3 shadow-[0_8px_16px_rgba(15,23,42,0.08)] active:cursor-grabbing ${
                              selectedNodeId === node.id ? 'ring-2 ring-sky-300' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-slate-500">工位 {index + 1}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${NODE_CLASS_BADGE_CLASS[node.nodeClass]}`}
                              >
                                {NODE_CLASS_LABEL[node.nodeClass]}
                              </span>
                            </div>
                            <div className="mt-2 text-sm font-semibold text-slate-900">{node.nodeName}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {node.boundResourceCode
                                ? `${node.boundResourceCode} / ${node.boundResourceName ?? '已挂载资源'}`
                                : '未挂载真实资源'}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                size="small"
                                onClick={() => {
                                  setSelectedNodeId(node.id);
                                  setFormMode('edit');
                                }}
                              >
                                编辑
                              </Button>
                              <Button
                                size="small"
                                disabled={index === 0}
                                onClick={() => void handleMoveNodeWithinRoom(node.id, 'forward')}
                              >
                                前移
                              </Button>
                              <Button
                                size="small"
                                disabled={index >= roomPlacedNodes.length - 1}
                                onClick={() => void handleMoveNodeWithinRoom(node.id, 'backward')}
                              >
                                后移
                              </Button>
                              <Button
                                size="small"
                                onClick={() => void handleMoveNodeOutOfRoom(node.id)}
                              >
                                移出
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full min-h-[110px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/60 text-xs text-slate-400">
                            将设备拖到此位置
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-700">设备仓库</div>
                    <Input
                      allowClear
                      placeholder="搜索设备编码/名称"
                      value={warehouseKeyword}
                      onChange={(event) => setWarehouseKeyword(event.target.value)}
                      style={{ width: 220, maxWidth: '100%' }}
                    />
                  </div>

                  {warehouseNodes.length ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {warehouseNodes.map((node) => (
                        <div
                          key={node.id}
                          draggable
                          onDragStart={(event) => handleSceneDragStart(event, node.id)}
                          onDragEnd={handleSceneDragEnd}
                          className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium text-slate-900">{node.nodeName}</div>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${NODE_CLASS_BADGE_CLASS[node.nodeClass]}`}
                            >
                              {NODE_CLASS_LABEL[node.nodeClass]}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{node.nodeCode}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {node.boundResourceCode
                              ? `${node.boundResourceCode} / ${node.boundResourceName}`
                              : '未挂载资源'}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <Button size="small" onClick={() => void handleMoveNodeToRoom(node.id)}>
                              放入房间
                            </Button>
                            <Button
                              size="small"
                              type="link"
                              onClick={() => {
                                setSelectedNodeId(node.id);
                                setFormMode('edit');
                              }}
                            >
                              打开属性
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty description="仓库里暂无可摆放设备" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  {formMode === 'edit' ? '节点属性编辑' : formMode === 'create-root' ? '新增根节点' : '新增子节点'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {selectedNodePath || '当前未选择节点'}
                </div>
              </div>
              <Space>
                <Button onClick={() => setFormMode('edit')} disabled={formMode === 'edit'}>
                  回到编辑
                </Button>
                <Button type="primary" onClick={() => void handleSaveNode()}>
                  保存节点
                </Button>
              </Space>
            </div>

            {!selectedNode && formMode === 'edit' ? (
              <Empty description="选择一个节点后即可编辑" />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">节点编码</label>
                    <Input
                      value={formMode === 'edit' ? draftValues.nodeCode : generatedNodeCodePreview}
                      disabled
                    />
                    <div className="mt-1 text-xs text-slate-400">
                      {formMode === 'edit'
                        ? '节点编码由系统生成，保持唯一，不建议手动修改。'
                        : '保存后由系统自动生成唯一编码；预览会根据当前部门域和节点分类变化。'}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">节点名称</label>
                    <Input
                      value={draftValues.nodeName}
                      onChange={(event) =>
                        setDraftValues((current) => ({ ...current, nodeName: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">节点分类</label>
                    <Select
                      value={draftValues.nodeClass}
                      options={NODE_CLASS_OPTIONS}
                      onChange={(value) => setDraftValues((current) => ({ ...current, nodeClass: value }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">部门域</label>
                    <Select
                      value={draftValues.departmentCode}
                      options={[{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }]}
                      onChange={(value) => setDraftValues((current) => ({ ...current, departmentCode: value }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">父节点</label>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={draftValues.parentId ?? undefined}
                      onChange={(value) => setDraftValues((current) => ({ ...current, parentId: value ?? null }))}
                      options={allNodes
                        .filter((node) => node.id !== selectedNode?.id)
                        .map((node) => ({ value: node.id, label: node.nodeName }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">归属团队</label>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={draftValues.ownerOrgUnitId ?? undefined}
                      onChange={(value) =>
                        setDraftValues((current) => ({ ...current, ownerOrgUnitId: value ?? null }))
                      }
                      options={teams.map((team) => ({ value: Number(team.id), label: team.unit_name }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">挂载资源</label>
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      value={draftValues.boundResourceId ?? undefined}
                      onChange={(value) =>
                        setDraftValues((current) => ({ ...current, boundResourceId: value ?? null }))
                      }
                      options={availableResources.map((resource) => ({
                        value: resource.id,
                        label: `${resource.resourceCode} / ${resource.resourceName}`,
                      }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">排序</label>
                    <InputNumber
                      min={1}
                      value={draftValues.sortOrder}
                      onChange={(value) =>
                        setDraftValues((current) => ({
                          ...current,
                          sortOrder: typeof value === 'number' ? value : undefined,
                        }))
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">启用状态</label>
                  <Select
                    value={draftValues.isActive}
                    options={[
                      { value: true, label: '启用' },
                      { value: false, label: '停用' },
                    ]}
                    onChange={(value) => setDraftValues((current) => ({ ...current, isActive: value }))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">扩展信息 JSON</label>
                  <Input.TextArea
                    rows={6}
                    value={draftValues.metadataText}
                    onChange={(event) =>
                      setDraftValues((current) => ({ ...current, metadataText: event.target.value }))
                    }
                  />
                </div>
                {selectedNode && formMode === 'edit' ? (
                  <div className="flex justify-end">
                    <Popconfirm
                      title="确定删除当前节点吗？"
                      description="存在子节点或模板工序绑定时会被阻止。"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void handleDeleteNode()}
                    >
                      <Button danger>删除节点</Button>
                    </Popconfirm>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">资源挂载</div>
              <Button
                type="link"
                onClick={() => {
                  setCreatingResourceForNodeId(selectedNode?.id ?? null);
                  setResourceModalOpen(true);
                }}
              >
                新建资源并绑定
              </Button>
            </div>
            {selectedNode ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type={selectedNode.children.length ? 'warning' : 'info'}
                  showIcon
                  message={selectedNode.children.length ? '当前节点已有子节点，绑定资源会被后端校验阻止。' : '叶子节点可直接挂载真实资源。'}
                />
                <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  当前挂载：
                  {selectedNode.boundResourceCode
                    ? ` ${selectedNode.boundResourceCode} / ${selectedNode.boundResourceName}`
                    : ' 未挂载资源'}
                </div>
                <div className="max-h-48 overflow-auto rounded-2xl border border-slate-200">
                  {unassignedResources.length ? (
                    unassignedResources.slice(0, 12).map((resource) => (
                      <button
                        key={resource.id}
                        type="button"
                        className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50"
                        onClick={async () => {
                          try {
                            await processTemplateV2Api.updateResourceNode(selectedNode.id, {
                              boundResourceId: resource.id,
                            });
                            message.success('资源已挂载到当前节点');
                            await loadData();
                          } catch (error: any) {
                            message.error(error?.response?.data?.error || '挂载资源失败');
                          }
                        }}
                      >
                        <span>{resource.resourceCode} / {resource.resourceName}</span>
                        <span className="text-xs text-slate-400">{resource.resourceType}</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-sm text-slate-400">当前没有未挂载资源</div>
                  )}
                </div>
              </Space>
            ) : (
              <Empty description="先选择节点后再挂载资源" />
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 text-sm font-semibold text-slate-700">影响分析</div>
            {selectedNode ? (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="info"
                  showIcon
                  message={`当前节点被 ${impactedOperations.length} 个模板工序默认引用`}
                />
                <div className="max-h-64 overflow-auto rounded-2xl border border-slate-200">
                  {impactedOperations.length ? (
                    impactedOperations.map((operation) => (
                      <div key={operation.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                        <div className="font-medium text-slate-800">{operation.operation_name}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {operation.stage_name} / {operation.bindingStatus}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-4 text-sm text-slate-400">当前节点暂未被模板工序引用</div>
                  )}
                </div>
              </Space>
            ) : (
              <Empty description="先选择节点查看影响" />
            )}
          </div>
        </div>
      </div>

      <ResourceFormModal
        open={resourceModalOpen}
        resource={null}
        orgUnitOptions={teams.map((team) => ({ value: Number(team.id), label: team.unit_name }))}
        onCancel={() => {
          setResourceModalOpen(false);
          setCreatingResourceForNodeId(null);
        }}
        onSubmit={handleCreateResource}
      />
    </section>
  );
};

export default TemplateResourceNodeManagementTab;
