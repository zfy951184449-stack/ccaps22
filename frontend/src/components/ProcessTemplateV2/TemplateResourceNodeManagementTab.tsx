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
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BuildOutlined,
  ClusterOutlined,
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
import {
  PlannerOperation,
  ResourceNode,
  ResourceNodeClass,
  ResourceNodeScope,
  TeamSummary,
} from './types';

const { Text } = Typography;

type NodeBlueprint = {
  nodeClass: ResourceNodeClass;
  nodeSubtype?: string | null;
  label: string;
};

const NODE_CLASS_OPTIONS: Array<{ label: string; value: ResourceNodeClass; icon: React.ReactNode }> = [
  { label: '厂区', value: 'SITE', icon: <ClusterOutlined /> },
  { label: '产线', value: 'LINE', icon: <ApartmentOutlined /> },
  { label: '房间', value: 'ROOM', icon: <HomeOutlined /> },
  { label: '系统', value: 'SYSTEM', icon: <BuildOutlined /> },
  { label: '设备类', value: 'EQUIPMENT_CLASS', icon: <AppstoreOutlined /> },
  { label: '设备型号', value: 'EQUIPMENT_MODEL', icon: <SettingOutlined /> },
  { label: '设备实例', value: 'EQUIPMENT_UNIT', icon: <ToolOutlined /> },
  { label: '组件/管线', value: 'COMPONENT', icon: <SettingOutlined /> },
  { label: '工作站', value: 'UTILITY_STATION', icon: <ToolOutlined /> },
];

const NODE_CLASS_LABEL: Record<ResourceNodeClass, string> = {
  SITE: '厂区',
  LINE: '产线',
  ROOM: '房间',
  SYSTEM: '系统',
  EQUIPMENT_CLASS: '设备类',
  EQUIPMENT_MODEL: '设备型号',
  EQUIPMENT_UNIT: '设备实例',
  COMPONENT: '组件/管线',
  UTILITY_STATION: '工作站',
};

const NODE_CLASS_CODE: Record<ResourceNodeClass, string> = {
  SITE: 'SIT',
  LINE: 'LIN',
  ROOM: 'ROM',
  SYSTEM: 'SYS',
  EQUIPMENT_CLASS: 'ECL',
  EQUIPMENT_MODEL: 'EMD',
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
  SYSTEM: [
    { label: '一次性系统', value: 'SUS' },
    { label: '不锈钢系统', value: 'SS' },
  ],
  EQUIPMENT_CLASS: [],
  EQUIPMENT_MODEL: [],
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
  { label: '团队归属', value: 'TEAM' },
];
const DEPARTMENT_OPTIONS = [{ value: 'USP' }, { value: 'DSP' }, { value: 'SPI' }, { value: 'MAINT' }];

interface NodeFormValues {
  nodeCode: string;
  nodeName: string;
  nodeClass: ResourceNodeClass;
  nodeSubtype: string;
  parentId?: number | null;
  nodeScope: ResourceNodeScope;
  departmentCode: string | null;
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

const requiresSubtype = (nodeClass: ResourceNodeClass) => !['SITE', 'LINE', 'EQUIPMENT_UNIT'].includes(nodeClass);

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
      { nodeClass: 'SYSTEM', label: '工艺系统' },
    ];
  }

  if (parent.nodeClass === 'ROOM' && parent.nodeSubtype === 'UTILITY_SHARED') {
    return [{ nodeClass: 'UTILITY_STATION', nodeSubtype: 'CIP', label: 'CIP站' }];
  }

  if (parent.nodeClass === 'SYSTEM') {
    return [{ nodeClass: 'EQUIPMENT_CLASS', label: '设备类' }];
  }

  if (parent.nodeClass === 'EQUIPMENT_CLASS') {
    return [{ nodeClass: 'EQUIPMENT_MODEL', label: '设备型号' }];
  }

  if (parent.nodeClass === 'EQUIPMENT_MODEL') {
    return [{ nodeClass: 'EQUIPMENT_UNIT', label: '设备实例' }];
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
  return found?.icon ?? <AppstoreOutlined />;
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

const buildNodeCodePreview = (
  nodeScope: ResourceNodeScope,
  departmentCode: string | null,
  ownerOrgUnitId: number | null,
  nodeClass: ResourceNodeClass,
  nodes: ResourceNode[],
) => {
  const scopeCode = nodeScope === 'GLOBAL' ? 'GLB' : nodeScope === 'DEPARTMENT' ? 'DPT' : 'TEM';
  const domainToken =
    nodeScope === 'DEPARTMENT'
      ? departmentCode || 'USP'
      : nodeScope === 'TEAM'
        ? `TEAM${ownerOrgUnitId ?? 'X'}`
        : 'GLOBAL';
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
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [creatingResourceForNodeId, setCreatingResourceForNodeId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cleanableLoading, setCleanableLoading] = useState(false);
  const [cleanableTargetIds, setCleanableTargetIds] = useState<number[]>([]);
  const [cleanableCandidates, setCleanableCandidates] = useState<ResourceNode[]>([]);
  const [draftValues, setDraftValues] = useState<NodeFormValues>({
    nodeCode: '',
    nodeName: '',
    nodeClass: 'SITE',
    nodeSubtype: '',
    parentId: null,
    nodeScope: 'GLOBAL',
    departmentCode: null,
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
        draftValues.ownerOrgUnitId ?? null,
        draftValues.nodeClass,
        allNodes,
      ),
    [allNodes, draftValues.departmentCode, draftValues.nodeClass, draftValues.nodeScope, draftValues.ownerOrgUnitId],
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
        nodeClass: 'SITE',
        nodeSubtype: '',
        parentId: null,
        nodeScope: 'GLOBAL',
        departmentCode: null,
        ownerOrgUnitId: null,
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
        ownerOrgUnitId: selectedNode.ownerOrgUnitId ?? null,
        boundResourceId: null,
        sortOrder: undefined,
        isActive: true,
        metadataText: '',
      });
    }
  }, [childBlueprints, formMode, selectedNode]);

  useEffect(() => {
    if (!requiresSubtype(draftValues.nodeClass)) {
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
        if (next.departmentCode !== null || next.ownerOrgUnitId !== null) {
          next = { ...next, departmentCode: null, ownerOrgUnitId: null };
        }
      } else if (next.nodeScope === 'DEPARTMENT') {
        const normalizedDepartmentCode = next.departmentCode || 'USP';
        if (next.departmentCode !== normalizedDepartmentCode || next.ownerOrgUnitId !== null) {
          next = { ...next, departmentCode: normalizedDepartmentCode, ownerOrgUnitId: null };
        }
      } else if (next.nodeScope === 'TEAM') {
        if (next.departmentCode !== null) {
          next = { ...next, departmentCode: null };
        }
      }

      return next;
    });
  }, [draftValues.nodeClass, draftValues.nodeScope]);

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
        message.error('当前节点类型要求填写 node_subtype');
        return;
      }

      if (draftValues.nodeScope === 'DEPARTMENT' && !draftValues.departmentCode) {
        message.error('部门域范围下必须选择部门');
        return;
      }

      if (draftValues.nodeScope === 'TEAM' && !draftValues.ownerOrgUnitId) {
        message.error('团队范围下必须选择归属团队');
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
        nodeSubtype: requiresSubtype(draftValues.nodeClass) ? draftValues.nodeSubtype.trim().toUpperCase() : null,
        parentId: draftValues.parentId ?? null,
        nodeScope: draftValues.nodeScope,
        departmentCode: draftValues.nodeScope === 'DEPARTMENT' ? draftValues.departmentCode : null,
        ownerOrgUnitId: draftValues.nodeScope === 'TEAM' ? draftValues.ownerOrgUnitId ?? null : null,
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
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">工艺模板 V2 语义节点建模</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            采用“树 + 属性表单”维护 SITE/LINE/ROOM/SYSTEM/设备层级，并在 CIP 站配置可清洗对象的多对多引用关系。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">节点总数</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.totalCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">房间数</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.roomCount}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="text-xs text-slate-500">可绑定节点</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{nodeStats.bindableCount}</div>
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
            disabled={!selectedNode || !allowedChildBlueprints(selectedNode).length}
            onClick={() => setFormMode('create-child')}
          >
            新增子节点
          </Button>
        </Space>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">资源语义节点树</div>
              <Text type="secondary" className="text-xs">
                拖拽可移动层级
              </Text>
            </div>
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
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  {formMode === 'edit' ? '节点属性编辑' : formMode === 'create-root' ? '新增根节点' : '新增子节点'}
                </div>
                <div className="mt-1 text-xs text-slate-500">{selectedNodePath || '当前未选择节点'}</div>
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
                        }))
                      }
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">node_subtype</label>
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
                    ) : (
                      <Input value="(不需要)" disabled />
                    )}
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
                  {draftValues.nodeScope === 'TEAM' ? (
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
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">资源挂载</div>
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
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 text-sm font-semibold text-slate-700">CIP 可清洗对象</div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Alert type="info" showIcon message="仅允许关联位于 SYSTEM(SS) 路径下的 EQUIPMENT_UNIT/COMPONENT。" />
                <Select
                  mode="multiple"
                  showSearch
                  optionFilterProp="label"
                  loading={cleanableLoading}
                  value={cleanableTargetIds}
                  onChange={(value) => setCleanableTargetIds(value as number[])}
                  options={cleanableCandidates.map((node) => ({
                    value: node.id,
                    label: `${buildNodePath(node.id, nodeMap)
                      .map((item) => item.nodeName)
                      .join(' / ')} (${node.nodeCode})`,
                  }))}
                  style={{ width: '100%' }}
                  placeholder="选择可清洗对象"
                />
                <Button type="primary" loading={cleanableLoading} onClick={() => void handleSaveCleanableTargets()}>
                  保存 CIP 关系
                </Button>
              </Space>
            </div>
          ) : null}

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

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
