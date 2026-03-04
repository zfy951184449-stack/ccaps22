import axios from 'axios';
import { Resource } from '../types/platform';
import {
  ResourceNode,
  ResourceNodeMovePayload,
  ResourceNodePayload,
  TemplateResourceBindingResponse,
  TemplateResourcePlannerResponse,
  TemplateSummary,
} from '../components/ProcessTemplateV2/types';

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const mapTemplate = (data: any): TemplateSummary => ({
  id: Number(data.id),
  template_code: data.template_code,
  template_name: data.template_name,
  team_id: data.team_id ?? null,
  team_code: data.team_code ?? null,
  team_name: data.team_name ?? null,
  description: data.description ?? '',
  total_days: Number(data.total_days ?? 0),
  created_at: data.created_at,
  updated_at: data.updated_at,
});

const mapResourceNode = (data: any): ResourceNode => ({
  id: Number(data.id),
  nodeCode: data.nodeCode ?? data.node_code,
  nodeName: data.nodeName ?? data.node_name,
  nodeClass: data.nodeClass ?? data.node_class,
  parentId: data.parentId ?? data.parent_id ?? null,
  departmentCode: data.departmentCode ?? data.department_code,
  ownerOrgUnitId: data.ownerOrgUnitId ?? data.owner_org_unit_id ?? null,
  ownerUnitName: data.ownerUnitName ?? data.owner_unit_name ?? null,
  ownerUnitCode: data.ownerUnitCode ?? data.owner_unit_code ?? null,
  boundResourceId: data.boundResourceId ?? data.bound_resource_id ?? null,
  boundResourceCode: data.boundResourceCode ?? data.bound_resource_code ?? null,
  boundResourceName: data.boundResourceName ?? data.bound_resource_name ?? null,
  boundResourceType: data.boundResourceType ?? data.bound_resource_type ?? null,
  boundResourceStatus: data.boundResourceStatus ?? data.bound_resource_status ?? null,
  boundResourceIsSchedulable: Boolean(data.boundResourceIsSchedulable ?? data.bound_resource_is_schedulable),
  sortOrder: Number(data.sortOrder ?? data.sort_order ?? 0),
  isActive: Boolean(data.isActive ?? data.is_active),
  metadata: data.metadata ?? null,
  childCount: Number(data.childCount ?? data.child_count ?? 0),
  children: (data.children ?? []).map((item: any) => mapResourceNode(item)),
});

const mapPlannerOperation = (data: any) => ({
  ...data,
  id: Number(data.id),
  stage_id: Number(data.stage_id),
  operation_id: Number(data.operation_id),
  operation_day: Number(data.operation_day ?? 0),
  recommended_time: Number(data.recommended_time ?? 0),
  recommended_day_offset:
    data.recommended_day_offset !== undefined && data.recommended_day_offset !== null
      ? Number(data.recommended_day_offset)
      : undefined,
  window_start_time:
    data.window_start_time !== undefined && data.window_start_time !== null ? Number(data.window_start_time) : undefined,
  window_start_day_offset:
    data.window_start_day_offset !== undefined && data.window_start_day_offset !== null
      ? Number(data.window_start_day_offset)
      : undefined,
  window_end_time:
    data.window_end_time !== undefined && data.window_end_time !== null ? Number(data.window_end_time) : undefined,
  window_end_day_offset:
    data.window_end_day_offset !== undefined && data.window_end_day_offset !== null
      ? Number(data.window_end_day_offset)
      : undefined,
  operation_order: Number(data.operation_order ?? 0),
  standard_time: data.standard_time !== undefined && data.standard_time !== null ? Number(data.standard_time) : undefined,
  required_people: data.required_people !== undefined && data.required_people !== null ? Number(data.required_people) : undefined,
  stage_order: Number(data.stage_order ?? 0),
  stage_start_day: Number(data.stage_start_day ?? 0),
  defaultResourceNodeId: data.default_resource_node_id ?? null,
  defaultResourceNodeName: data.default_resource_node_name ?? null,
  defaultResourceId: data.default_resource_id ?? null,
  defaultResourceCode: data.default_resource_code ?? null,
  bindingStatus: data.binding_status,
  bindingReason: data.binding_reason ?? null,
});

const mapPlannerResponse = (data: any): TemplateResourcePlannerResponse => ({
  template: mapTemplate(data.template),
  stages: (data.stages ?? []).map((item: any) => ({
    id: Number(item.id),
    template_id: Number(item.template_id),
    stage_code: item.stage_code,
    stage_name: item.stage_name,
    stage_order: Number(item.stage_order),
    start_day: Number(item.start_day),
    description: item.description ?? null,
    operation_count: item.operation_count !== undefined ? Number(item.operation_count) : undefined,
  })),
  operations: (data.operations ?? []).map(mapPlannerOperation),
  resourceTree: (data.resource_tree ?? []).map((item: any) => mapResourceNode(item)),
  metrics: {
    totalOperations: Number(data.metrics?.total_operations ?? 0),
    boundOperations: Number(data.metrics?.bound_operations ?? 0),
    unboundOperations: Number(data.metrics?.unbound_operations ?? 0),
    invalidBindings: Number(data.metrics?.invalid_bindings ?? 0),
    resourceNodeCount: Number(data.metrics?.resource_node_count ?? 0),
  },
  warnings: data.warnings ?? [],
});

const toResourceNodePayload = (payload: ResourceNodePayload) => ({
  node_code: payload.nodeCode,
  node_name: payload.nodeName,
  node_class: payload.nodeClass,
  parent_id: payload.parentId ?? null,
  department_code: payload.departmentCode,
  owner_org_unit_id: payload.ownerOrgUnitId ?? null,
  bound_resource_id: payload.boundResourceId ?? null,
  sort_order: payload.sortOrder,
  is_active: payload.isActive,
  metadata: payload.metadata ?? null,
});

const mapResource = (data: any): Resource => ({
  id: Number(data.id),
  resourceCode: data.resourceCode ?? data.resource_code,
  resourceName: data.resourceName ?? data.resource_name,
  resourceType: data.resourceType ?? data.resource_type,
  departmentCode: data.departmentCode ?? data.department_code,
  ownerOrgUnitId: data.ownerOrgUnitId ?? data.owner_org_unit_id ?? null,
  ownerUnitName: data.ownerUnitName ?? data.owner_unit_name ?? null,
  ownerUnitCode: data.ownerUnitCode ?? data.owner_unit_code ?? null,
  status: data.status,
  capacity: Number(data.capacity ?? 1),
  location: data.location ?? null,
  cleanLevel: data.cleanLevel ?? data.clean_level ?? null,
  isShared: Boolean(data.isShared ?? data.is_shared),
  isSchedulable: Boolean(data.isSchedulable ?? data.is_schedulable),
  metadata: data.metadata ?? null,
  stats: data.stats
    ? {
        calendarCount: Number(data.stats.calendarCount ?? data.stats.calendar_count ?? 0),
        maintenanceCount: Number(data.stats.maintenanceCount ?? data.stats.maintenance_count ?? 0),
        assignmentCount: Number(data.stats.assignmentCount ?? data.stats.assignment_count ?? 0),
      }
    : undefined,
});

export const processTemplateV2Api = {
  listTemplates: async (teamId?: string) => {
    const response = await client.get('/process-templates', {
      params: teamId && teamId !== 'all' ? { team_id: teamId } : undefined,
    });
    return (response.data ?? []).map(mapTemplate);
  },
  getTemplate: async (templateId: number) => {
    const response = await client.get(`/process-templates/${templateId}`);
    return mapTemplate(response.data);
  },
  createTemplate: async (payload: { templateName: string; teamId?: number | null; description?: string }) => {
    const response = await client.post('/process-templates', {
      template_name: payload.templateName,
      team_id: payload.teamId ?? null,
      description: payload.description ?? null,
    });
    return mapTemplate(response.data);
  },
  updateTemplate: async (
    templateId: number,
    payload: { templateName: string; teamId?: number | null; description?: string | null },
  ) => {
    await client.put(`/process-templates/${templateId}`, {
      template_name: payload.templateName,
      team_id: payload.teamId ?? null,
      description: payload.description ?? null,
    });
  },
  deleteTemplate: async (templateId: number) => {
    await client.delete(`/process-templates/${templateId}`);
  },
  copyTemplate: async (templateId: number, newName?: string) => {
    const response = await client.post(`/process-templates/${templateId}/copy`, {
      new_name: newName ?? null,
    });
    return {
      newTemplateId: Number(response.data.new_template_id),
      newTemplateCode: response.data.new_template_code,
    };
  },
  getPlanner: async (templateId: number) => {
    const response = await client.get(`/process-templates/${templateId}/resource-planner`);
    return mapPlannerResponse(response.data);
  },
  listResourceNodes: async (params?: {
    departmentCode?: string;
    ownerOrgUnitId?: number;
    includeInactive?: boolean;
    tree?: boolean;
  }) => {
    const response = await client.get('/resource-nodes', {
      params: {
        department_code: params?.departmentCode,
        owner_org_unit_id: params?.ownerOrgUnitId,
        include_inactive: params?.includeInactive,
        tree: params?.tree,
      },
    });
    return (response.data ?? []).map((item: any) => mapResourceNode(item));
  },
  createResourceNode: async (payload: ResourceNodePayload) => {
    const response = await client.post('/resource-nodes', toResourceNodePayload(payload));
    return Number(response.data.id);
  },
  updateResourceNode: async (nodeId: number, payload: Partial<ResourceNodePayload>) => {
    await client.patch(`/resource-nodes/${nodeId}`, toResourceNodePayload(payload as ResourceNodePayload));
  },
  moveResourceNode: async (nodeId: number, payload: ResourceNodeMovePayload) => {
    await client.post(`/resource-nodes/${nodeId}/move`, {
      parent_id: payload.parentId,
      sort_order: payload.sortOrder,
    });
  },
  deleteResourceNode: async (nodeId: number) => {
    await client.delete(`/resource-nodes/${nodeId}`);
  },
  getTemplateScheduleBinding: async (scheduleId: number): Promise<TemplateResourceBindingResponse> => {
    const response = await client.get(`/template-stage-operations/${scheduleId}/resource-binding`);
    return {
      templateScheduleId: Number(response.data.template_schedule_id),
      binding: response.data.binding
        ? {
            id: Number(response.data.binding.id),
            templateScheduleId: Number(response.data.binding.template_schedule_id),
            resourceNodeId: Number(response.data.binding.resource_node_id),
            bindingMode: response.data.binding.binding_mode,
            status: response.data.binding.status,
            reason: response.data.binding.reason ?? null,
            node: response.data.binding.node ? mapResourceNode(response.data.binding.node) : null,
          }
        : null,
    };
  },
  updateTemplateScheduleBinding: async (scheduleId: number, resourceNodeId: number | null) => {
    const response = await client.put(`/template-stage-operations/${scheduleId}/resource-binding`, {
      resource_node_id: resourceNodeId,
    });
    return response.data;
  },
  listResources: async (): Promise<Resource[]> => {
    const response = await client.get('/resources');
    const payload = Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    return payload.map(mapResource);
  },
};
