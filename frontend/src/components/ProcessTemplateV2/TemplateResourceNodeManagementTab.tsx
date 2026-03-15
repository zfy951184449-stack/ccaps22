import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  ClusterOutlined,
  HomeOutlined,
  ReloadOutlined,
  SettingOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { DataNode } from 'antd/es/tree';
import { ResourceFormModal } from '../Platform/PlatformEditors';
import { Resource } from '../../types/platform';
import { processTemplateV2Api } from '../../services';
import {
  EquipmentSystemType,
  NodeCanvasLayoutHint,
  PlannerOperation,
  ResourceNode,
  ResourceNodeClass,
  ResourceNodeScope,
  TeamSummary,
} from './types';
import NodeWorkbenchNavigator from './node-workbench/NodeWorkbenchNavigator';
import NodeInspectorDrawer from './node-workbench/NodeInspectorDrawer';
import FactoryLayoutCanvas, {
  RoomCreatePreview,
  WorkbenchGroupMode,
} from './node-workbench/FactoryLayoutCanvas';

type NodeBlueprint = {
  nodeClass: ResourceNodeClass;
  nodeSubtype?: string | null;
  label: string;
};

const NODE_CLASS_OPTIONS: Array<{ label: string; value: ResourceNodeClass; icon: React.ReactNode }> = [
  { label: '厂区', value: 'SITE', icon: <ClusterOutlined /> },
  { label: '产线', value: 'LINE', icon: <ApartmentOutlined /> },
  { label: '房间', value: 'ROOM', icon: <HomeOutlined /> },
  { label: '设备实例', value: 'EQUIPMENT_UNIT', icon: <ToolOutlined /> },
  { label: '组件/管线', value: 'COMPONENT', icon: <SettingOutlined /> },
  { label: '工作站', value: 'UTILITY_STATION', icon: <ToolOutlined /> },
];

const NODE_CLASS_LABEL: Record<ResourceNodeClass, string> = {
  SITE: '厂区',
  LINE: '产线',
  ROOM: '房间',
  EQUIPMENT_UNIT: '设备实例',
  COMPONENT: '组件/管线',
  UTILITY_STATION: '工作站',
};

const NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SITE: 'SIT',
  LINE: 'LIN',
  ROOM: 'ROM',
  EQUIPMENT_UNIT: 'EUN',
  COMPONENT: 'CMP',
  UTILITY_STATION: 'UST',
};

const NODE_SUBTYPE_OPTIONS: Record<ResourceNodeClass, Array<{ label: string; value: string }>> = {
  SITE: [],
  LINE: [],
  ROOM: [
    { label: '主工艺房间', value: 'MAIN_PROCESS' },
    { label: '辅助间', value: 'AUXILIARY' },
    { label: '通用房间', value: 'UTILITY_SHARED' },
  ],
  EQUIPMENT_UNIT: [],
  COMPONENT: [],
  UTILITY_STATION: [
    { label: 'CIP', value: 'CIP' },
    { label: 'SIP', value: 'SIP' },
  ],
};

const BINDABLE_CLASSES = new Set<ResourceNodeClass>(['EQUIPMENT_UNIT', 'COMPONENT', 'UTILITY_STATION']);
const NODE_SCOPE_OPTIONS: Array<{ label: string; value: ResourceNodeScope }> = [
  { label: '全局共享', value: 'GLOBAL' },
  { label: '部门域', value: 'DEPARTMENT' },
];
const DEPARTMENT_OPTIONS = [{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }];

const ROOM_TEMPLATE_OPTIONS: Array<{
  value: RoomTemplateKey;
  label: string;
  nodeSubtype: string;
  departmentCode: string | null;
}> = [
  { value: 'USP_PROCESS', label: 'USP room', nodeSubtype: 'MAIN_PROCESS', departmentCode: 'USP' },
  { value: 'DSP_PROCESS', label: 'DSP room', nodeSubtype: 'MAIN_PROCESS', departmentCode: 'DSP' },
  { value: 'SUPPORT', label: 'Support', nodeSubtype: 'AUXILIARY', departmentCode: null },
  { value: 'UTILITY', label: 'Utility', nodeSubtype: 'UTILITY_SHARED', departmentCode: null },
];

const EQUIPMENT_TEMPLATE_OPTIONS: Array<{
  value: EquipmentTemplateKey;
  label: string;
  systemType: EquipmentSystemType;
  equipmentClass: string;
  equipmentModel: string;
}> = [
  { value: 'BIOREACTOR', label: 'Bioreactor', systemType: 'SS', equipmentClass: 'REACTOR', equipmentModel: 'BIOREACTOR' },
  { value: 'SEED_TRAIN', label: 'Seed train', systemType: 'SS', equipmentClass: 'SEED', equipmentModel: 'SEED_TRAIN' },
  { value: 'CHROM_SKID', label: 'Chrom skid', systemType: 'SS', equipmentClass: 'CHROM', equipmentModel: 'CHROM_SKID' },
  { value: 'UFDF_SKID', label: 'UFDF skid', systemType: 'SS', equipmentClass: 'UFDF', equipmentModel: 'UFDF_SKID' },
  { value: 'BUFFER_TANK', label: 'Buffer tank', systemType: 'SS', equipmentClass: 'TANK', equipmentModel: 'BUFFER_TANK' },
];

interface NodeFormValues {
  nodeCode: string;
  nodeName: string;
  nodeClass: ResourceNodeClass;
  nodeSubtype: string;
  parentId?: number | null;
  nodeScope: ResourceNodeScope;
  departmentCode: string | null;
  equipmentSystemType: EquipmentSystemType | null;
  equipmentClass: string;
  equipmentModel: string;
  boundResourceId?: number | null;
  sortOrder?: number;
  isActive: boolean;
  metadataText?: string;
}

type RoomTemplateKey = 'USP_PROCESS' | 'DSP_PROCESS' | 'SUPPORT' | 'UTILITY';
type EquipmentTemplateKey = 'BIOREACTOR' | 'SEED_TRAIN' | 'CHROM_SKID' | 'UFDF_SKID' | 'BUFFER_TANK';

interface RoomCreateDraft {
  template: RoomTemplateKey;
  nodeName: string;
  parentId: number | null;
  ownerGroupLabel: string;
}

interface EquipmentCreateDraft {
  template: EquipmentTemplateKey;
  roomId: number | null;
  nodeName: string;
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

const buildNodeMap = (nodes: ResourceNode[]) => {
  const map = new Map<number, ResourceNode>();
  nodes.forEach((node) => {
    map.set(node.id, node);
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

const requiresSubtype = (nodeClass: ResourceNodeClass) =>
  nodeClass === 'ROOM' || nodeClass === 'UTILITY_STATION';
const supportsOptionalSubtype = (nodeClass: ResourceNodeClass) => nodeClass === 'COMPONENT';

const allowedChildBlueprints = (parent: ResourceNode | null): NodeBlueprint[] => {
  if (!parent) {
    return [{ nodeClass: 'SITE', label: '厂区' }];
  }

  if (parent.nodeClass === 'SITE') {
    return [
      { nodeClass: 'LINE', label: '产线' },
      { nodeClass: 'ROOM', nodeSubtype: 'UTILITY_SHARED', label: '通用房间' },
    ];
  }

  if (parent.nodeClass === 'LINE') {
    return [{ nodeClass: 'ROOM', nodeSubtype: 'MAIN_PROCESS', label: '主工艺房间' }];
  }

  if (parent.nodeClass === 'ROOM' && parent.nodeSubtype === 'MAIN_PROCESS') {
    return [
      { nodeClass: 'ROOM', nodeSubtype: 'AUXILIARY', label: '辅助间' },
      { nodeClass: 'EQUIPMENT_UNIT', label: '设备实例' },
    ];
  }

  if (parent.nodeClass === 'ROOM' && parent.nodeSubtype === 'UTILITY_SHARED') {
    return [
      { nodeClass: 'UTILITY_STATION', nodeSubtype: 'CIP', label: 'CIP站' },
      { nodeClass: 'UTILITY_STATION', nodeSubtype: 'SIP', label: 'SIP站' },
    ];
  }

  if (parent.nodeClass === 'EQUIPMENT_UNIT') {
    return [{ nodeClass: 'COMPONENT', label: '组件/管线' }];
  }

  return [];
};

const getSubtypeOptions = (
  nodeClass: ResourceNodeClass,
  formMode: 'edit' | 'create-root' | 'create-child',
  childBlueprints: NodeBlueprint[],
) => {
  if (formMode === 'create-child') {
    const options = childBlueprints
      .filter((item) => item.nodeClass === nodeClass)
      .map((item) => item.nodeSubtype)
      .filter((item): item is string => Boolean(item))
      .map((item) => ({ label: item, value: item }));

    if (options.length) {
      return options;
    }
  }

  return NODE_SUBTYPE_OPTIONS[nodeClass] ?? [];
};

const getClassIcon = (nodeClass: ResourceNodeClass) => {
  const found = NODE_CLASS_OPTIONS.find((item) => item.value === nodeClass);
  return found?.icon ?? <SettingOutlined />;
};

const toTreeData = (nodes: ResourceNode[]): DataNode[] =>
  nodes.map((node) => ({
    key: node.id,
    title: (
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-slate-500">{getClassIcon(node.nodeClass)}</span>
        <span className="truncate text-slate-800">{node.nodeName}</span>
        <Tag className="!m-0" color="blue">{NODE_CLASS_LABEL[node.nodeClass]}</Tag>
        {node.nodeSubtype ? <Tag className="!m-0">{node.nodeSubtype}</Tag> : null}
      </div>
    ),
    children: toTreeData(node.children),
  }));

const filterNodesByQuery = (nodes: ResourceNode[], query: string): ResourceNode[] => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const nextChildren = filterNodesByQuery(node.children, query);
      const matched = [node.nodeName, node.nodeCode, node.boundResourceCode ?? '', node.boundResourceName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(normalized);

      if (!matched && !nextChildren.length) {
        return null;
      }

      return {
        ...node,
        children: nextChildren,
      };
    })
    .filter((item): item is ResourceNode => Boolean(item));
};

const buildAutoLayoutDraft = (allNodes: ResourceNode[]): Record<number, NodeCanvasLayoutHint> => {
  const draft: Record<number, NodeCanvasLayoutHint> = {};
  const childrenByParent = new Map<number, ResourceNode[]>();
  allNodes.forEach((node) => {
    if (!node.parentId) {
      return;
    }
    const current = childrenByParent.get(node.parentId) ?? [];
    current.push(node);
    childrenByParent.set(node.parentId, current);
  });
  childrenByParent.forEach((items) => items.sort((left, right) => left.sortOrder - right.sortOrder));

  const rooms = allNodes.filter((node) => node.nodeClass === 'ROOM');
  rooms.forEach((room) => {
    const children = childrenByParent.get(room.id) ?? [];
    if (room.nodeSubtype === 'UTILITY_SHARED') {
      const stations = children.filter((node) => node.nodeClass === 'UTILITY_STATION');
      stations.forEach((station, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        draft[station.id] = {
          x: 0.05 + col * 0.31,
          y: 0.08 + row * 0.42,
          w: 0.28,
          h: 0.34,
          zone: 'utility_lane',
          roomAnchorId: room.id,
          manual: false,
        };
      });
      return;
    }

    const auxiliaryRooms = children.filter(
      (node) => node.nodeClass === 'ROOM' && node.nodeSubtype === 'AUXILIARY',
    );
    auxiliaryRooms.forEach((aux, index) => {
      const col = index % 4;
      draft[aux.id] = {
        x: 0.04 + col * 0.235,
        y: 0.12,
        w: 0.22,
        h: 0.72,
        zone: 'aux_lane',
        roomAnchorId: room.id,
        manual: false,
      };
    });

    const equipments = children.filter((node) => node.nodeClass === 'EQUIPMENT_UNIT');
    equipments.forEach((equipment, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      draft[equipment.id] = {
        x: 0.05 + col * 0.31,
        y: 0.08 + row * 0.42,
        w: 0.28,
        h: 0.34,
        zone: 'process_floor',
        roomAnchorId: room.id,
        manual: false,
      };

      const components = (childrenByParent.get(equipment.id) ?? []).filter((node) => node.nodeClass === 'COMPONENT');
      components.forEach((component, componentIndex) => {
        const globalIndex = index * 4 + componentIndex;
        const pipelineCol = globalIndex % 4;
        draft[component.id] = {
          x: 0.04 + pipelineCol * 0.235,
          y: 0.2,
          w: 0.21,
          h: 0.55,
          zone: 'pipeline_lane',
          roomAnchorId: room.id,
          pinnedToNodeId: equipment.id,
          manual: false,
        };
      });
    });
  });

  return draft;
};

const buildNodeCodePreview = (
  nodeScope: ResourceNodeScope,
  departmentCode: string | null,
  nodeClass: ResourceNodeClass,
  nodes: ResourceNode[],
) => {
  const scopeCode = nodeScope === 'GLOBAL' ? 'GLB' : 'DPT';
  const domainToken = nodeScope === 'DEPARTMENT' ? departmentCode || 'USP' : 'GLOBAL';
  const prefix = `RN-${scopeCode}-${domainToken}-${NODE_CLASS_CODE[nodeClass]}`;
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
  const [formMode, setFormMode] = useState<'edit' | 'create-root' | 'create-child'>('edit');
  const [workbenchSearch, setWorkbenchSearch] = useState('');
  const [layoutDraft, setLayoutDraft] = useState<Record<number, NodeCanvasLayoutHint>>({});
  const [layoutDirtyNodeIds, setLayoutDirtyNodeIds] = useState<number[]>([]);
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [creatingResourceForNodeId, setCreatingResourceForNodeId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cleanableLoading, setCleanableLoading] = useState(false);
  const [cleanableTargetIds, setCleanableTargetIds] = useState<number[]>([]);
  const [cleanableCandidates, setCleanableCandidates] = useState<ResourceNode[]>([]);
  const [paletteDrawerOpen, setPaletteDrawerOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<WorkbenchGroupMode>('department');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activeDepartmentCodes, setActiveDepartmentCodes] = useState<string[]>([]);
  const [showInactiveRooms, setShowInactiveRooms] = useState(true);
  const [qualifiedOnly, setQualifiedOnly] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [createEquipmentOpen, setCreateEquipmentOpen] = useState(false);
  const [draftValues, setDraftValues] = useState<NodeFormValues>({
    nodeCode: '',
    nodeName: '',
    nodeClass: 'SITE',
    nodeSubtype: '',
    parentId: null,
    nodeScope: 'GLOBAL',
    departmentCode: null,
    equipmentSystemType: null,
    equipmentClass: '',
    equipmentModel: '',
    boundResourceId: null,
    sortOrder: undefined,
    isActive: true,
    metadataText: '',
  });
  const [roomCreateDraft, setRoomCreateDraft] = useState<RoomCreateDraft>({
    template: 'USP_PROCESS',
    nodeName: 'USP Buffer Prep',
    parentId: null,
    ownerGroupLabel: 'USP Department / Upstream Team',
  });
  const [equipmentCreateDraft, setEquipmentCreateDraft] = useState<EquipmentCreateDraft>({
    template: 'BIOREACTOR',
    roomId: null,
    nodeName: 'BR-101',
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
      setLayoutDraft({});
      setLayoutDirtyNodeIds([]);
      if (nodeTree.length > 0) {
        setSelectedNodeId((current) => current ?? nodeTree[0].id);
      }
      if (!nodeTree.length) {
        setSelectedNodeId(null);
        setFormMode('create-root');
      }
    } catch (error) {
      console.error('Failed to load resource node management data:', error);
      setNodes([]);
      setResources([]);
      setImpactOperations([]);
      setTeams([]);
      setLayoutDraft({});
      setLayoutDirtyNodeIds([]);
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
  const selectedNode = useMemo(() => findNode(nodes, selectedNodeId), [nodes, selectedNodeId]);

  const selectedNodePath = useMemo(() => {
    if (!selectedNode) {
      return '';
    }

    return buildNodePath(selectedNode.id, nodeMap)
      .map((item) => item.nodeName)
      .join(' / ');
  }, [nodeMap, selectedNode]);

  const getMetadataString = useCallback((node: ResourceNode | null, keys: string[]) => {
    if (!node?.metadata) {
      return null;
    }
    for (const key of keys) {
      const value = node.metadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }, []);

  const selectedRoomAnchor = useMemo(() => {
    if (!selectedNode) {
      return null;
    }

    if (selectedNode.nodeClass === 'ROOM') {
      return selectedNode;
    }

    let cursor: ResourceNode | undefined = selectedNode;
    const visited = new Set<number>();
    while (cursor?.parentId && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const parent = nodeMap.get(cursor.parentId);
      if (!parent) {
        return null;
      }
      if (parent.nodeClass === 'ROOM') {
        return parent;
      }
      cursor = parent;
    }
    return null;
  }, [nodeMap, selectedNode]);

  const lineParentOptions = useMemo(
    () =>
      allNodes
        .filter((node) => node.nodeClass === 'LINE')
        .map((node) => ({
          value: node.id,
          label: buildNodePath(node.id, nodeMap)
            .map((item) => item.nodeName)
            .join(' / '),
          departmentCode: node.departmentCode,
          ownerGroupLabel: getMetadataString(node, ['teamLabel', 'teamName', 'ownerGroupLabel']),
        })),
    [allNodes, getMetadataString, nodeMap],
  );

  const processRoomParentOptions = useMemo(
    () =>
      allNodes
        .filter((node) => node.nodeClass === 'ROOM' && node.nodeSubtype === 'MAIN_PROCESS')
        .map((node) => ({
          value: node.id,
          label: buildNodePath(node.id, nodeMap)
            .map((item) => item.nodeName)
            .join(' / '),
          departmentCode: node.departmentCode,
          ownerGroupLabel: getMetadataString(node, ['teamLabel', 'teamName', 'ownerGroupLabel']),
        })),
    [allNodes, getMetadataString, nodeMap],
  );

  const siteParentOptions = useMemo(
    () =>
      allNodes
        .filter((node) => node.nodeClass === 'SITE')
        .map((node) => ({
          value: node.id,
          label: buildNodePath(node.id, nodeMap)
            .map((item) => item.nodeName)
            .join(' / '),
          departmentCode: node.departmentCode,
          ownerGroupLabel: getMetadataString(node, ['teamLabel', 'teamName', 'ownerGroupLabel']),
        })),
    [allNodes, getMetadataString, nodeMap],
  );

  const mainRoomOptions = useMemo(
    () =>
      allNodes
        .filter((node) => node.nodeClass === 'ROOM' && node.nodeSubtype === 'MAIN_PROCESS')
        .map((node) => ({
          value: node.id,
          label: buildNodePath(node.id, nodeMap)
            .map((item) => item.nodeName)
            .join(' / '),
          departmentCode: node.departmentCode,
          ownerGroupLabel: getMetadataString(node, ['teamLabel', 'teamName', 'ownerGroupLabel']),
        })),
    [allNodes, getMetadataString, nodeMap],
  );

  const roomParentOptions = useMemo(() => {
    if (roomCreateDraft.template === 'UTILITY') {
      return siteParentOptions;
    }
    if (roomCreateDraft.template === 'SUPPORT') {
      return processRoomParentOptions;
    }
    const targetDepartmentCode = ROOM_TEMPLATE_OPTIONS.find((item) => item.value === roomCreateDraft.template)?.departmentCode;
    const matching = lineParentOptions.filter((item) => !targetDepartmentCode || item.departmentCode === targetDepartmentCode);
    return matching.length ? matching : lineParentOptions;
  }, [lineParentOptions, processRoomParentOptions, roomCreateDraft.template, siteParentOptions]);

  const createRoomPreview = useMemo<RoomCreatePreview | null>(() => {
    if (!createRoomOpen) {
      return null;
    }

    const parentNode = roomCreateDraft.parentId ? nodeMap.get(roomCreateDraft.parentId) ?? null : null;
    const templateConfig = ROOM_TEMPLATE_OPTIONS.find((item) => item.value === roomCreateDraft.template);
    if (!templateConfig) {
      return null;
    }

    const ownerLabel =
      roomCreateDraft.ownerGroupLabel ||
      getMetadataString(parentNode, ['teamLabel', 'teamName', 'ownerGroupLabel']) ||
      (templateConfig.departmentCode ? `${templateConfig.departmentCode} Department` : 'Shared Services');

    const targetDepartmentCode =
      templateConfig.departmentCode ?? parentNode?.departmentCode ?? selectedRoomAnchor?.departmentCode ?? null;
    const targetGroupLabel =
      groupBy === 'team'
        ? ownerLabel
        : targetDepartmentCode
          ? `${targetDepartmentCode} Department`
          : 'Shared Services';

    return {
      active: true,
      roomName: roomCreateDraft.nodeName,
      roomTypeLabel: templateConfig.label,
      ownerLabel,
      targetGroupKey: targetGroupLabel ? `${groupBy}:${targetGroupLabel}` : null,
      targetGroupLabel,
    };
  }, [
    createRoomOpen,
    getMetadataString,
    groupBy,
    nodeMap,
    roomCreateDraft.nodeName,
    roomCreateDraft.ownerGroupLabel,
    roomCreateDraft.parentId,
    roomCreateDraft.template,
    selectedRoomAnchor?.departmentCode,
  ]);

  const childBlueprints = useMemo(() => allowedChildBlueprints(selectedNode), [selectedNode]);

  const classOptions = useMemo(() => {
    if (formMode === 'create-root') {
      return NODE_CLASS_OPTIONS.filter((item) => item.value === 'SITE');
    }

    if (formMode === 'create-child') {
      const allowed = new Set(childBlueprints.map((item) => item.nodeClass));
      return NODE_CLASS_OPTIONS.filter((item) => allowed.has(item.value));
    }

    return NODE_CLASS_OPTIONS;
  }, [childBlueprints, formMode]);

  const subtypeOptions = useMemo(
    () => getSubtypeOptions(draftValues.nodeClass, formMode, childBlueprints),
    [childBlueprints, draftValues.nodeClass, formMode],
  );

  const generatedNodeCodePreview = useMemo(
    () =>
      buildNodeCodePreview(
        draftValues.nodeScope,
        draftValues.departmentCode,
        draftValues.nodeClass,
        allNodes,
      ),
    [allNodes, draftValues.departmentCode, draftValues.nodeClass, draftValues.nodeScope],
  );

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

  const nodeStats = useMemo(
    () => ({
      totalCount: allNodes.length,
      roomCount: allNodes.filter((node) => node.nodeClass === 'ROOM').length,
      bindableCount: allNodes.filter((node) => BINDABLE_CLASSES.has(node.nodeClass)).length,
      mappedResourceCount: allNodes.filter((node) => Boolean(node.boundResourceId)).length,
    }),
    [allNodes],
  );

  const filteredNavigatorNodes = useMemo(() => filterNodesByQuery(nodes, workbenchSearch), [nodes, workbenchSearch]);
  const navigatorTreeData = useMemo(() => toTreeData(filteredNavigatorNodes), [filteredNavigatorNodes]);

  useEffect(() => {
    if (formMode === 'edit' && selectedNode) {
      setDraftValues({
        nodeCode: selectedNode.nodeCode,
        nodeName: selectedNode.nodeName,
        nodeClass: selectedNode.nodeClass,
        nodeSubtype: selectedNode.nodeSubtype ?? '',
        parentId: selectedNode.parentId ?? null,
        nodeScope: selectedNode.nodeScope,
        departmentCode: selectedNode.departmentCode,
        equipmentSystemType: selectedNode.equipmentSystemType ?? null,
        equipmentClass: selectedNode.equipmentClass ?? '',
        equipmentModel: selectedNode.equipmentModel ?? '',
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
        nodeClass: 'SITE',
        nodeSubtype: '',
        parentId: null,
        nodeScope: 'GLOBAL',
        departmentCode: null,
        equipmentSystemType: null,
        equipmentClass: '',
        equipmentModel: '',
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
      return;
    }

    if (formMode === 'create-child' && selectedNode) {
      const firstBlueprint = childBlueprints[0];
      setDraftValues({
        nodeCode: '',
        nodeName: '',
        nodeClass: firstBlueprint?.nodeClass ?? selectedNode.nodeClass,
        nodeSubtype: firstBlueprint?.nodeSubtype ?? '',
        parentId: selectedNode.id,
        nodeScope: selectedNode.nodeScope,
        departmentCode: selectedNode.departmentCode,
        equipmentSystemType: null,
        equipmentClass: '',
        equipmentModel: '',
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
    }
  }, [childBlueprints, formMode, selectedNode]);

  useEffect(() => {
    if (!requiresSubtype(draftValues.nodeClass) && !supportsOptionalSubtype(draftValues.nodeClass)) {
      if (draftValues.nodeSubtype) {
        setDraftValues((current) => ({ ...current, nodeSubtype: '' }));
      }
      return;
    }

    if (subtypeOptions.length === 1 && draftValues.nodeSubtype !== subtypeOptions[0].value) {
      setDraftValues((current) => ({ ...current, nodeSubtype: subtypeOptions[0].value }));
      return;
    }

    if (subtypeOptions.length > 1 && !subtypeOptions.some((item) => item.value === draftValues.nodeSubtype)) {
      setDraftValues((current) => ({ ...current, nodeSubtype: subtypeOptions[0].value }));
    }
  }, [draftValues.nodeClass, draftValues.nodeSubtype, subtypeOptions]);

  useEffect(() => {
    setDraftValues((current) => {
      let next = current;

      if (next.nodeClass === 'SITE' && next.nodeScope !== 'GLOBAL') {
        next = { ...next, nodeScope: 'GLOBAL' };
      }

      if (next.nodeScope === 'GLOBAL') {
        if (next.departmentCode !== null) {
          next = { ...next, departmentCode: null };
        }
      } else if (next.nodeScope === 'DEPARTMENT') {
        const normalizedDepartmentCode = next.departmentCode || 'USP';
        if (next.departmentCode !== normalizedDepartmentCode) {
          next = { ...next, departmentCode: normalizedDepartmentCode };
        }
      }

      if (next.nodeClass !== 'EQUIPMENT_UNIT') {
        if (next.equipmentSystemType !== null || next.equipmentClass || next.equipmentModel) {
          next = {
            ...next,
            equipmentSystemType: null,
            equipmentClass: '',
            equipmentModel: '',
          };
        }
      }

      return next;
    });
  }, [draftValues.nodeClass, draftValues.nodeScope]);

  useEffect(() => {
    if (!roomParentOptions.length) {
      if (roomCreateDraft.parentId !== null) {
        setRoomCreateDraft((current) => ({ ...current, parentId: null }));
      }
      return;
    }

    const matchingParent = roomParentOptions.find((item) => item.value === roomCreateDraft.parentId);
    if (matchingParent) {
      if (!roomCreateDraft.ownerGroupLabel && matchingParent.ownerGroupLabel) {
        setRoomCreateDraft((current) => ({
          ...current,
          ownerGroupLabel: current.ownerGroupLabel || matchingParent.ownerGroupLabel || '',
        }));
      }
      return;
    }

    const selectedRoomParent = selectedRoomAnchor?.id
      ? roomParentOptions.find((item) => item.value === selectedRoomAnchor.id)
      : undefined;
    const selectedDirectParent = selectedNode?.id
      ? roomParentOptions.find((item) => item.value === selectedNode.id)
      : undefined;
    const nextParent = selectedDirectParent ?? selectedRoomParent ?? roomParentOptions[0];

    setRoomCreateDraft((current) => ({
      ...current,
      parentId: nextParent?.value ?? null,
      ownerGroupLabel: current.ownerGroupLabel || nextParent?.ownerGroupLabel || '',
    }));
  }, [
    roomCreateDraft.ownerGroupLabel,
    roomCreateDraft.parentId,
    roomParentOptions,
    selectedNode?.id,
    selectedRoomAnchor?.id,
  ]);

  useEffect(() => {
    const currentRoom = equipmentCreateDraft.roomId
      ? mainRoomOptions.find((item) => item.value === equipmentCreateDraft.roomId)
      : undefined;
    if (currentRoom) {
      return;
    }

    const preferredRoom =
      (selectedRoomAnchor?.nodeSubtype === 'MAIN_PROCESS'
        ? mainRoomOptions.find((item) => item.value === selectedRoomAnchor.id)
        : undefined) ?? mainRoomOptions[0];

    if (preferredRoom || equipmentCreateDraft.roomId !== null) {
      setEquipmentCreateDraft((current) => ({
        ...current,
        roomId: preferredRoom?.value ?? null,
      }));
    }
  }, [equipmentCreateDraft.roomId, mainRoomOptions, selectedRoomAnchor]);

  const loadCleanableTargets = useCallback(async (node: ResourceNode | null) => {
    if (!node || node.nodeClass !== 'UTILITY_STATION' || node.nodeSubtype !== 'CIP') {
      setCleanableTargetIds([]);
      setCleanableCandidates([]);
      return;
    }

    try {
      setCleanableLoading(true);
      const response = await processTemplateV2Api.getResourceNodeCleanableTargets(node.id);
      setCleanableTargetIds(response.targets.map((item) => item.targetNodeId));
      setCleanableCandidates(response.candidateTargets);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '加载 CIP 可清洗对象失败');
      setCleanableTargetIds([]);
      setCleanableCandidates([]);
    } finally {
      setCleanableLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCleanableTargets(selectedNode);
  }, [loadCleanableTargets, selectedNode]);

  const handleSaveNode = async () => {
    try {
      if (!draftValues.nodeName.trim()) {
        message.error('请输入节点名称');
        return;
      }

      if (requiresSubtype(draftValues.nodeClass) && !draftValues.nodeSubtype.trim()) {
        message.error('当前节点类型要求填写节点子类型');
        return;
      }

      if (draftValues.nodeScope === 'DEPARTMENT' && !draftValues.departmentCode) {
        message.error('部门域范围下必须选择部门');
        return;
      }

      if (
        draftValues.nodeClass === 'EQUIPMENT_UNIT' &&
        (!draftValues.equipmentSystemType || !draftValues.equipmentClass.trim() || !draftValues.equipmentModel.trim())
      ) {
        message.error('设备实例必须填写系统类型、设备类和设备型号');
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

      if (formMode === 'edit' && selectedNode) {
        const layoutHint = layoutDraft[selectedNode.id];
        if (layoutHint) {
          metadata = {
            ...(selectedNode.metadata ?? {}),
            ...(metadata ?? {}),
            ui_layout_v1: layoutHint,
          };
        }
      }

      const payload = {
        nodeCode: formMode === 'edit' ? draftValues.nodeCode.trim() : undefined,
        nodeName: draftValues.nodeName.trim(),
        nodeClass: draftValues.nodeClass,
        nodeSubtype:
          requiresSubtype(draftValues.nodeClass) || supportsOptionalSubtype(draftValues.nodeClass)
            ? draftValues.nodeSubtype.trim().toUpperCase() || null
            : null,
        parentId: draftValues.parentId ?? null,
        nodeScope: draftValues.nodeScope,
        departmentCode: draftValues.nodeScope === 'DEPARTMENT' ? draftValues.departmentCode : null,
        equipmentSystemType: draftValues.nodeClass === 'EQUIPMENT_UNIT' ? draftValues.equipmentSystemType : null,
        equipmentClass: draftValues.nodeClass === 'EQUIPMENT_UNIT' ? draftValues.equipmentClass.trim() : null,
        equipmentModel: draftValues.nodeClass === 'EQUIPMENT_UNIT' ? draftValues.equipmentModel.trim() : null,
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

  const handleOpenCreateRoom = useCallback(() => {
    setCreateRoomOpen(true);

    const preferredTemplate: RoomTemplateKey =
      selectedRoomAnchor?.nodeSubtype === 'MAIN_PROCESS'
        ? 'SUPPORT'
        : selectedNode?.departmentCode === 'DSP'
          ? 'DSP_PROCESS'
          : 'USP_PROCESS';

    setRoomCreateDraft((current) => ({
      ...current,
      template: preferredTemplate,
      nodeName:
        preferredTemplate === 'SUPPORT'
          ? 'USP Buffer Prep'
          : preferredTemplate === 'DSP_PROCESS'
            ? 'DSP Purification Room'
            : 'USP Seed Suite',
      ownerGroupLabel:
        current.ownerGroupLabel ||
        getMetadataString(selectedRoomAnchor, ['teamLabel', 'teamName', 'ownerGroupLabel']) ||
        (selectedRoomAnchor?.departmentCode ? `${selectedRoomAnchor.departmentCode} Department / Team` : 'USP Department / Upstream Team'),
    }));
  }, [getMetadataString, selectedNode?.departmentCode, selectedRoomAnchor]);

  const handleOpenCreateEquipment = useCallback((roomId?: number | null) => {
    const targetRoomId = roomId ?? (selectedRoomAnchor?.nodeSubtype === 'MAIN_PROCESS' ? selectedRoomAnchor.id : null);
    setCreateEquipmentOpen(true);
    setEquipmentCreateDraft((current) => ({
      ...current,
      roomId: targetRoomId ?? current.roomId,
      template: 'BIOREACTOR',
      nodeName: 'BR-101',
    }));
  }, [selectedRoomAnchor]);

  const handleCreateRoom = useCallback(async () => {
    const templateConfig = ROOM_TEMPLATE_OPTIONS.find((item) => item.value === roomCreateDraft.template);
    if (!templateConfig) {
      message.error('请选择房间模板');
      return;
    }

    if (!roomCreateDraft.nodeName.trim()) {
      message.error('请输入房间名称');
      return;
    }

    if (!roomCreateDraft.parentId) {
      message.error('请选择房间落位的父节点');
      return;
    }

    const parentNode = nodeMap.get(roomCreateDraft.parentId);
    if (!parentNode) {
      message.error('目标父节点不存在，请刷新后重试');
      return;
    }

    try {
      const createdId = await processTemplateV2Api.createResourceNode({
        nodeName: roomCreateDraft.nodeName.trim(),
        nodeClass: 'ROOM',
        nodeSubtype: templateConfig.nodeSubtype,
        parentId: roomCreateDraft.parentId,
        nodeScope: templateConfig.nodeSubtype === 'UTILITY_SHARED' ? parentNode.nodeScope ?? 'GLOBAL' : parentNode.nodeScope ?? 'DEPARTMENT',
        departmentCode:
          templateConfig.nodeSubtype === 'UTILITY_SHARED'
            ? null
            : templateConfig.departmentCode ?? parentNode.departmentCode ?? null,
        equipmentSystemType: null,
        equipmentClass: null,
        equipmentModel: null,
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadata: {
          teamLabel: roomCreateDraft.ownerGroupLabel || undefined,
          ownerGroupLabel: roomCreateDraft.ownerGroupLabel || undefined,
          qualified: true,
          sceneTemplate: templateConfig.value,
        },
      });

      setSelectedNodeId(createdId);
      setCreateRoomOpen(false);
      message.success('房间已创建');
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '创建房间失败');
    }
  }, [loadData, nodeMap, roomCreateDraft]);

  const handleCreateEquipment = useCallback(async () => {
    const templateConfig = EQUIPMENT_TEMPLATE_OPTIONS.find((item) => item.value === equipmentCreateDraft.template);
    if (!templateConfig) {
      message.error('请选择设备模板');
      return;
    }

    if (!equipmentCreateDraft.nodeName.trim()) {
      message.error('请输入设备名称');
      return;
    }

    if (!equipmentCreateDraft.roomId) {
      message.error('请选择设备归属房间');
      return;
    }

    const roomNode = nodeMap.get(equipmentCreateDraft.roomId);
    if (!roomNode || roomNode.nodeClass !== 'ROOM') {
      message.error('设备归属房间不存在，请刷新后重试');
      return;
    }

    try {
      const createdId = await processTemplateV2Api.createResourceNode({
        nodeName: equipmentCreateDraft.nodeName.trim(),
        nodeClass: 'EQUIPMENT_UNIT',
        nodeSubtype: null,
        parentId: equipmentCreateDraft.roomId,
        nodeScope: roomNode.nodeScope,
        departmentCode: roomNode.departmentCode,
        equipmentSystemType: templateConfig.systemType,
        equipmentClass: templateConfig.equipmentClass,
        equipmentModel: templateConfig.equipmentModel,
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadata: {
          teamLabel: getMetadataString(roomNode, ['teamLabel', 'teamName', 'ownerGroupLabel']) || undefined,
          sceneTemplate: templateConfig.value,
        },
      });

      setSelectedNodeId(createdId);
      setCreateEquipmentOpen(false);
      message.success('设备已创建');
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '创建设备失败');
    }
  }, [equipmentCreateDraft, getMetadataString, loadData, nodeMap]);

  const handleOpenInspector = useCallback(() => {
    setFormMode('edit');
    setInspectorDrawerOpen(true);
  }, []);

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

  const handleSaveCleanableTargets = async () => {
    if (!selectedNode || selectedNode.nodeClass !== 'UTILITY_STATION' || selectedNode.nodeSubtype !== 'CIP') {
      return;
    }

    try {
      setCleanableLoading(true);
      await processTemplateV2Api.updateResourceNodeCleanableTargets(selectedNode.id, {
        targetNodeIds: cleanableTargetIds,
      });
      message.success('CIP 可清洗对象已更新');
      await loadData();
      await loadCleanableTargets(selectedNode);
    } catch (error: any) {
      message.error(error?.response?.data?.error || '更新 CIP 可清洗对象失败');
    } finally {
      setCleanableLoading(false);
    }
  };

  const handleExportBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      nodes,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `resource-nodes-backup-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleClearForRebuild = async () => {
    try {
      await processTemplateV2Api.clearResourceNodeTreeForRebuild();
      message.success('节点树、模板绑定和 CIP 关系已清空');
      setSelectedNodeId(null);
      setFormMode('create-root');
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '清空节点树失败');
    }
  };

  const handleLayoutChange = useCallback((nodeId: number, hint: NodeCanvasLayoutHint) => {
    setLayoutDraft((current) => ({
      ...current,
      [nodeId]: hint,
    }));
    setLayoutDirtyNodeIds((current) => (current.includes(nodeId) ? current : [...current, nodeId]));
  }, []);

  const handleAutoLayout = useCallback(() => {
    const nextDraft = buildAutoLayoutDraft(allNodes);
    const dirtyIds = Object.keys(nextDraft).map((item) => Number(item));
    setLayoutDraft(nextDraft);
    setLayoutDirtyNodeIds(dirtyIds);
    if (dirtyIds.length) {
      message.success(`已生成 ${dirtyIds.length} 个节点的自动布局草稿`);
    } else {
      message.info('当前没有可自动编排的节点');
    }
  }, [allNodes]);

  const handleSaveLayout = useCallback(async () => {
    const targetIds = layoutDirtyNodeIds.filter((nodeId) => Boolean(layoutDraft[nodeId]));
    if (!targetIds.length) {
      message.info('当前没有需要保存的布局变更');
      return;
    }

    try {
      setLayoutSaving(true);
      for (const nodeId of targetIds) {
        const hint = layoutDraft[nodeId];
        const node = nodeMap.get(nodeId);
        if (!hint || !node) {
          continue;
        }
        // Persist only ui_layout_v1 and keep other metadata keys unchanged.
        await processTemplateV2Api.updateResourceNodeLayoutHint(nodeId, hint, node.metadata ?? null);
      }
      message.success(`布局已保存（${targetIds.length} 个节点）`);
      setLayoutDirtyNodeIds([]);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.error || '保存布局失败');
    } finally {
      setLayoutSaving(false);
    }
  }, [layoutDirtyNodeIds, layoutDraft, loadData, nodeMap]);

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
            资源工作台
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">工艺模板 V2 资源节点拟物建模</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            左侧层级导航定位节点，中央拟物画布完成布局与关系，右侧属性抽屉负责精细字段编辑与资源绑定。
          </p>
        </div>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
            刷新
          </Button>
          <Button icon={<ReloadOutlined />} onClick={handleAutoLayout}>
            自动编排
          </Button>
          <Button type="primary" loading={layoutSaving} onClick={() => void handleSaveLayout()}>
            保存布局{layoutDirtyNodeIds.length ? ` (${layoutDirtyNodeIds.length})` : ''}
          </Button>
        </Space>
      </div>

      <FactoryLayoutCanvas
        allNodes={allNodes}
        selectedNodeId={selectedNodeId}
        selectedNode={selectedNode}
        teams={teams}
        searchValue={workbenchSearch}
        layoutDraft={layoutDraft}
        groupBy={groupBy}
        collapsedGroups={collapsedGroups}
        activeDepartmentCodes={activeDepartmentCodes}
        showInactive={showInactiveRooms}
        qualifiedOnly={qualifiedOnly}
        createRoomPreview={createRoomPreview}
        onSelectNode={(nodeId) => {
          setSelectedNodeId(nodeId);
          setFormMode('edit');
        }}
        onLayoutChange={handleLayoutChange}
        onToggleGroup={(groupKey) =>
          setCollapsedGroups((current) => ({
            ...current,
            [groupKey]: !current[groupKey],
          }))
        }
        onGroupByChange={(value) => setGroupBy(value)}
        onOpenPalette={() => setPaletteDrawerOpen(true)}
        onOpenFilters={() => setFilterDrawerOpen(true)}
        onOpenInspector={handleOpenInspector}
        onCreateRoom={handleOpenCreateRoom}
        onAddEquipment={(roomId) => handleOpenCreateEquipment(roomId)}
        onManageBinding={(nodeId) => {
          setSelectedNodeId(nodeId);
          setFormMode('edit');
          setInspectorDrawerOpen(true);
        }}
        onAutoLayout={handleAutoLayout}
      />

      <Modal
        title="Palette"
        width={420}
        open={paletteDrawerOpen}
        onCancel={() => setPaletteDrawerOpen(false)}
        footer={null}
        destroyOnClose={false}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-800">Quick actions</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="primary" onClick={handleOpenCreateRoom}>
                Add room
              </Button>
              <Button onClick={() => handleOpenCreateEquipment()}>
                Add equipment
              </Button>
              <Button
                onClick={() => {
                  setFormMode('create-root');
                  setSelectedNodeId(null);
                  setInspectorDrawerOpen(true);
                }}
              >
                New root node
              </Button>
              <Button
                disabled={!selectedNode || !allowedChildBlueprints(selectedNode).length}
                onClick={() => {
                  setFormMode('create-child');
                  setInspectorDrawerOpen(true);
                }}
              >
                New child node
              </Button>
            </div>
          </div>

          <NodeWorkbenchNavigator
            treeData={navigatorTreeData}
            selectedNodeId={selectedNodeId}
            canCreateChild={Boolean(selectedNode && allowedChildBlueprints(selectedNode).length)}
            searchValue={workbenchSearch}
            stats={nodeStats}
            onSearchChange={setWorkbenchSearch}
            onRefresh={() => void loadData()}
            onCreateRoot={() => {
              setFormMode('create-root');
              setSelectedNodeId(null);
              setInspectorDrawerOpen(true);
            }}
            onCreateChild={() => {
              setFormMode('create-child');
              setInspectorDrawerOpen(true);
            }}
            onLocateSelected={() => {
              if (!selectedNode) {
                return;
              }
              setWorkbenchSearch('');
              message.success(`已定位到 ${selectedNode.nodeName}`);
            }}
            onSelect={(nodeId) => {
              setSelectedNodeId(nodeId);
              setFormMode('edit');
              setPaletteDrawerOpen(false);
            }}
            onDrop={(info) => void handleTreeDrop(info)}
          />
        </div>
      </Modal>

      <Modal
        title="Filters"
        width={360}
        open={filterDrawerOpen}
        onCancel={() => setFilterDrawerOpen(false)}
        footer={null}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Search</label>
            <Input
              allowClear
              placeholder="搜索房间、设备、资源编码"
              value={workbenchSearch}
              onChange={(event) => setWorkbenchSearch(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Departments</label>
            <Select
              mode="multiple"
              allowClear
              value={activeDepartmentCodes}
              onChange={(value) => setActiveDepartmentCodes(value)}
              options={DEPARTMENT_OPTIONS}
              style={{ width: '100%' }}
              placeholder="全部部门"
            />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-700">Show inactive rooms</div>
              <div className="text-xs text-slate-500">停用房间也保留在布局图里</div>
            </div>
            <Switch checked={showInactiveRooms} onChange={setShowInactiveRooms} />
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-700">Qualified only</div>
              <div className="text-xs text-slate-500">只看已可用/可排产的房间</div>
            </div>
            <Switch checked={qualifiedOnly} onChange={setQualifiedOnly} />
          </div>
          <Button
            onClick={() => {
              setWorkbenchSearch('');
              setActiveDepartmentCodes([]);
              setShowInactiveRooms(true);
              setQualifiedOnly(false);
            }}
          >
            Reset filters
          </Button>
        </div>
      </Modal>

      <Modal
        title={formMode === 'edit' ? 'Inspector' : formMode === 'create-root' ? 'Create root node' : 'Create child node'}
        width={760}
        open={inspectorDrawerOpen || formMode !== 'edit'}
        onCancel={() => {
          setInspectorDrawerOpen(false);
          setFormMode('edit');
        }}
        footer={null}
        destroyOnClose={false}
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}
      >
        <NodeInspectorDrawer
          mode={formMode}
          selectedNodePath={selectedNodePath}
          hasEditableNode={Boolean(selectedNode)}
          onBackToEdit={() => setFormMode('edit')}
          onSaveNode={() => void handleSaveNode()}
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">节点编码</label>
                  <Input value={formMode === 'edit' ? draftValues.nodeCode : generatedNodeCodePreview} disabled />
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
                    options={classOptions.map((item) => ({ label: item.label, value: item.value }))}
                    onChange={(value) =>
                      setDraftValues((current) => ({
                        ...current,
                        nodeClass: value,
                        nodeSubtype: '',
                        equipmentSystemType: null,
                        equipmentClass: '',
                        equipmentModel: '',
                      }))
                    }
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">节点子类型</label>
                  {requiresSubtype(draftValues.nodeClass) ? (
                    subtypeOptions.length > 0 ? (
                      <Select
                        value={draftValues.nodeSubtype || undefined}
                        options={subtypeOptions}
                        onChange={(value) => setDraftValues((current) => ({ ...current, nodeSubtype: value }))}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      <Input
                        value={draftValues.nodeSubtype}
                        placeholder="例如 REACTOR / AKTA / ABEC / PIPELINE"
                        onChange={(event) =>
                          setDraftValues((current) => ({ ...current, nodeSubtype: event.target.value }))
                        }
                      />
                    )
                  ) : supportsOptionalSubtype(draftValues.nodeClass) ? (
                    <Input
                      value={draftValues.nodeSubtype}
                      placeholder="可选，例如 PIPELINE"
                      onChange={(event) =>
                        setDraftValues((current) => ({ ...current, nodeSubtype: event.target.value }))
                      }
                    />
                  ) : (
                    <Input value="(不需要)" disabled />
                  )}
                </div>
                {draftValues.nodeClass === 'EQUIPMENT_UNIT' ? (
                  <>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">设备系统类型</label>
                      <Select
                        value={draftValues.equipmentSystemType ?? undefined}
                        options={[
                          { value: 'SUS', label: 'SUS' },
                          { value: 'SS', label: 'SS' },
                        ]}
                        onChange={(value) =>
                          setDraftValues((current) => ({
                            ...current,
                            equipmentSystemType: value as EquipmentSystemType,
                          }))
                        }
                        style={{ width: '100%' }}
                        placeholder="选择系统类型"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">设备类</label>
                      <Input
                        value={draftValues.equipmentClass}
                        placeholder="例如 REACTOR / AKTA"
                        onChange={(event) =>
                          setDraftValues((current) => ({ ...current, equipmentClass: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">设备型号</label>
                      <Input
                        value={draftValues.equipmentModel}
                        placeholder="例如 ABEC / AKTA1"
                        onChange={(event) =>
                          setDraftValues((current) => ({ ...current, equipmentModel: event.target.value }))
                        }
                      />
                    </div>
                  </>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">父节点</label>
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    value={draftValues.parentId ?? undefined}
                    onChange={(value) => setDraftValues((current) => ({ ...current, parentId: value ?? null }))}
                    options={allNodes
                      .filter((node) => (formMode === 'create-child' ? true : node.id !== selectedNode?.id))
                      .map((node) => ({
                        value: node.id,
                        label: buildNodePath(node.id, nodeMap)
                          .map((item) => item.nodeName)
                          .join(' / '),
                      }))}
                    style={{ width: '100%' }}
                    disabled={formMode === 'create-child'}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">归属范围</label>
                  <Select
                    value={draftValues.nodeScope}
                    options={NODE_SCOPE_OPTIONS}
                    onChange={(value) =>
                      setDraftValues((current) => ({ ...current, nodeScope: value as ResourceNodeScope }))
                    }
                    style={{ width: '100%' }}
                    disabled={draftValues.nodeClass === 'SITE'}
                  />
                </div>
                {draftValues.nodeScope === 'DEPARTMENT' ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">部门域</label>
                    <Select
                      value={draftValues.departmentCode ?? undefined}
                      options={DEPARTMENT_OPTIONS}
                      onChange={(value) => setDraftValues((current) => ({ ...current, departmentCode: value }))}
                      style={{ width: '100%' }}
                    />
                  </div>
                ) : null}
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

              <div className="mt-4">
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

              <div className="mt-4">
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
                <div className="mt-4 flex justify-end">
                  <Popconfirm
                    title="确定删除当前节点吗？"
                    description="存在子节点、模板绑定或 CIP 关系引用时会被阻止。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => void handleDeleteNode()}
                  >
                    <Button danger>删除节点</Button>
                  </Popconfirm>
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-700">资源绑定</div>
                <Button
                  type="link"
                  onClick={() => {
                    setCreatingResourceForNodeId(selectedNode?.id ?? null);
                    setResourceModalOpen(true);
                  }}
                  disabled={!selectedNode || !BINDABLE_CLASSES.has(selectedNode.nodeClass)}
                >
                  新建资源并绑定
                </Button>
              </div>
              {selectedNode ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert
                    type={BINDABLE_CLASSES.has(selectedNode.nodeClass) ? 'info' : 'warning'}
                    showIcon
                    message={
                      BINDABLE_CLASSES.has(selectedNode.nodeClass)
                        ? '当前节点类型支持挂载资源（叶子节点）。'
                        : '当前节点类型不支持直接挂载资源。'
                    }
                  />
                  <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    当前挂载：
                    {selectedNode.boundResourceCode
                      ? ` ${selectedNode.boundResourceCode} / ${selectedNode.boundResourceName}`
                      : ' 未挂载资源'}
                  </div>
                  {BINDABLE_CLASSES.has(selectedNode.nodeClass) ? (
                    <>
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
                        placeholder="选择挂载资源"
                      />
                      <div className="max-h-40 overflow-auto rounded-2xl border border-slate-200">
                        {unassignedResources.length ? (
                          unassignedResources.slice(0, 10).map((resource) => (
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
                              <span>
                                {resource.resourceCode} / {resource.resourceName}
                              </span>
                              <span className="text-xs text-slate-400">{resource.resourceType}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-sm text-slate-400">当前没有未挂载资源</div>
                        )}
                      </div>
                    </>
                  ) : null}
                </Space>
              ) : (
                <Empty description="先选择节点后再挂载资源" />
              )}
            </div>

            {selectedNode && selectedNode.nodeClass === 'UTILITY_STATION' && selectedNode.nodeSubtype === 'CIP' ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="mb-3 text-sm font-semibold text-slate-700">CIP 可清洗对象</div>
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert type="info" showIcon message="仅允许关联设备系统类型为 SS 的设备实例或组件。" />
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    loading={cleanableLoading}
                    value={cleanableTargetIds}
                    onChange={(value) => setCleanableTargetIds(value as number[])}
                    options={cleanableCandidates.map((node) => {
                      const parentNode = node.parentId ? nodeMap.get(node.parentId) : null;
                      const systemType =
                        node.equipmentSystemType ??
                        (parentNode?.nodeClass === 'EQUIPMENT_UNIT' ? parentNode.equipmentSystemType : null);
                      const equipmentClass =
                        node.equipmentClass ??
                        (parentNode?.nodeClass === 'EQUIPMENT_UNIT' ? parentNode.equipmentClass : null);
                      const equipmentModel =
                        node.equipmentModel ??
                        (parentNode?.nodeClass === 'EQUIPMENT_UNIT' ? parentNode.equipmentModel : null);
                      const equipmentLabel = [systemType, equipmentClass, equipmentModel].filter(Boolean).join(' / ');

                      return {
                        value: node.id,
                        label: `${buildNodePath(node.id, nodeMap)
                          .map((item) => item.nodeName)
                          .join(' / ')} (${node.nodeCode})${equipmentLabel ? ` [${equipmentLabel}]` : ''}`,
                      };
                    })}
                    style={{ width: '100%' }}
                    placeholder="选择可清洗对象"
                  />
                  <Button type="primary" loading={cleanableLoading} onClick={() => void handleSaveCleanableTargets()}>
                    保存 CIP 关系
                  </Button>
                </Space>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-3 text-sm font-semibold text-slate-700">影响分析</div>
              {selectedNode ? (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  <Alert type="info" showIcon message={`当前节点被 ${impactedOperations.length} 个模板工序默认引用`} />
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

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-3 text-sm font-semibold text-slate-700">人工重建工具</div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert
                  type="warning"
                  showIcon
                  message="建议先导出备份，再执行清空；清空会同时删除模板默认绑定与 CIP 关系。"
                />
                <Button onClick={handleExportBackup}>导出备份 (JSON)</Button>
                <Popconfirm
                  title="确认清空节点树吗？"
                  description="会清空 resource_nodes、template 默认绑定和 CIP 关系，且不可恢复。"
                  okText="确认清空"
                  cancelText="取消"
                  onConfirm={() => void handleClearForRebuild()}
                >
                  <Button danger>清空节点树（重建模式）</Button>
                </Popconfirm>
              </Space>
            </div>
          </div>
        </NodeInspectorDrawer>
      </Modal>

      <Modal
        title="Add room"
        width={420}
        open={createRoomOpen}
        onCancel={() => setCreateRoomOpen(false)}
        footer={null}
        destroyOnClose={false}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Room template</label>
            <div className="grid grid-cols-2 gap-3">
              {ROOM_TEMPLATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    roomCreateDraft.template === option.value
                      ? 'border-sky-500 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-sky-300'
                  }`}
                  onClick={() =>
                    setRoomCreateDraft((current) => ({
                      ...current,
                      template: option.value,
                      nodeName:
                        option.value === 'DSP_PROCESS'
                          ? 'DSP Purification Room'
                          : option.value === 'SUPPORT'
                            ? 'USP Buffer Prep'
                            : option.value === 'UTILITY'
                              ? 'Shared Utilities'
                              : 'USP Seed Suite',
                    }))
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {option.nodeSubtype === 'MAIN_PROCESS'
                      ? '主工艺房间'
                      : option.nodeSubtype === 'AUXILIARY'
                        ? '辅助/支持房间'
                        : '共享公用工程房间'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Room name</label>
            <Input
              placeholder="例如 USP Seed Suite"
              value={roomCreateDraft.nodeName}
              onChange={(event) =>
                setRoomCreateDraft((current) => ({
                  ...current,
                  nodeName: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Department / team</label>
            <Input
              placeholder="例如 USP Department / Upstream Team"
              value={roomCreateDraft.ownerGroupLabel}
              onChange={(event) =>
                setRoomCreateDraft((current) => ({
                  ...current,
                  ownerGroupLabel: event.target.value,
                }))
              }
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Placement parent</label>
            <Select
              showSearch
              optionFilterProp="label"
              value={roomCreateDraft.parentId ?? undefined}
              onChange={(value) =>
                setRoomCreateDraft((current) => ({
                  ...current,
                  parentId: value ?? null,
                  ownerGroupLabel:
                    current.ownerGroupLabel ||
                    roomParentOptions.find((item) => item.value === value)?.ownerGroupLabel ||
                    current.ownerGroupLabel,
                }))
              }
              options={roomParentOptions}
              style={{ width: '100%' }}
              placeholder="选择房间插入位置"
            />
          </div>

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            画布会高亮当前分组，并展示新房间的落位预览。保存后会自动回到主画布。
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateRoomOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void handleCreateRoom()}>
              Place on canvas
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title="Add equipment"
        width={420}
        open={createEquipmentOpen}
        onCancel={() => setCreateEquipmentOpen(false)}
        footer={null}
        destroyOnClose={false}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto' } }}
      >
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">Equipment template</label>
            <div className="grid grid-cols-2 gap-3">
              {EQUIPMENT_TEMPLATE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    equipmentCreateDraft.template === option.value
                      ? 'border-sky-500 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-sky-300'
                  }`}
                  onClick={() =>
                    setEquipmentCreateDraft((current) => ({
                      ...current,
                      template: option.value,
                      nodeName:
                        option.value === 'SEED_TRAIN'
                          ? 'Seed Train'
                          : option.value === 'CHROM_SKID'
                            ? 'Chrom-01'
                            : option.value === 'UFDF_SKID'
                              ? 'UFDF-01'
                              : option.value === 'BUFFER_TANK'
                                ? 'Buffer Tank'
                                : 'BR-101',
                    }))
                  }
                >
                  <div className="text-sm font-semibold text-slate-900">{option.label}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {[option.systemType, option.equipmentClass, option.equipmentModel].join(' / ')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Target room</label>
            <Select
              showSearch
              optionFilterProp="label"
              value={equipmentCreateDraft.roomId ?? undefined}
              onChange={(value) =>
                setEquipmentCreateDraft((current) => ({
                  ...current,
                  roomId: value ?? null,
                }))
              }
              options={mainRoomOptions}
              style={{ width: '100%' }}
              placeholder="选择设备所属房间"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Equipment name</label>
            <Input
              placeholder="例如 BR-101"
              value={equipmentCreateDraft.nodeName}
              onChange={(event) =>
                setEquipmentCreateDraft((current) => ({
                  ...current,
                  nodeName: event.target.value,
                }))
              }
            />
          </div>

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            新增设备会自动放入目标房间，并进入当前房间的设备布局区等待进一步拖拽调整。
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateEquipmentOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => void handleCreateEquipment()}>
              Add equipment
            </Button>
          </div>
        </div>
      </Modal>

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
