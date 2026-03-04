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
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import axios from 'axios';
import { DataNode } from 'antd/es/tree';
import { ResourceFormModal } from '../Platform/PlatformEditors';
import { Resource } from '../../types/platform';
import { processTemplateV2Api } from '../../services/processTemplateV2Api';
import { ResourceNode, ResourceNodeClass, TeamSummary } from './types';

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
    title: `${node.nodeName}${node.boundResourceCode ? ` / ${node.boundResourceCode}` : ''}`,
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

const TemplateResourceNodeManagementTab: React.FC<TemplateResourceNodeManagementTabProps> = ({
  templateId,
  active = true,
  refreshKey = 0,
}) => {
  const [loading, setLoading] = useState(false);
  const [nodes, setNodes] = useState<ResourceNode[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [impactOperations, setImpactOperations] = useState<any[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
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
  const selectedNode = useMemo(() => findNode(nodes, selectedNodeId), [nodes, selectedNodeId]);

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
      setDraftValues({
        nodeCode: '',
        nodeName: '',
        nodeClass: 'ROOM',
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
      if (!draftValues.departmentCode) {
        message.error('请选择部门域');
        return;
      }

      const metadata = draftValues.metadataText?.trim() ? JSON.parse(draftValues.metadataText) : null;
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
          <h3 className="mt-3 text-2xl font-semibold text-slate-900">全局资源节点主数据</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            在模板编辑器内维护房间、设备和设备组件树，同时挂载真实资源主数据。
          </p>
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

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)_320px]">
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
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              {formMode === 'edit' ? '编辑节点' : formMode === 'create-root' ? '新增根节点' : '新增子节点'}
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
