import axios from 'axios';
import { Resource } from '../types/platform';
import {
  CreateStageOperationPayload,
  CreateStagePayload,
  OperationLibraryItem,
  OperationTypeOption,
  PlannerOperation,
  ResourceNodeCleanableTargetsResponse,
  ResourceNode,
  ResourceNodeRelation,
  TemplateBindingStatus,
  ResourceNodeMovePayload,
  ResourceNodePayload,
  TemplateConstraintLink,
  TemplateResourceBindingResponse,
  TemplateResourceEditorResponse,
  TemplateResourcePlannerResponse,
  TemplateShareGroupSummary,
  TemplateSummary,
  UpdateStageOperationPayload,
  UpdateStagePayload,
} from '../components/ProcessTemplateV2/types';
import { ResourceRequirementRule } from '../components/ProcessTemplateGantt/types';

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
  stage_count:
    data.stage_count !== undefined && data.stage_count !== null
      ? Number(data.stage_count)
      : data.stageCount !== undefined && data.stageCount !== null
        ? Number(data.stageCount)
        : undefined,
  unbound_count:
    data.unbound_count !== undefined && data.unbound_count !== null
      ? Number(data.unbound_count)
      : data.unboundCount !== undefined && data.unboundCount !== null
        ? Number(data.unboundCount)
        : undefined,
  constraint_conflict_count:
    data.constraint_conflict_count !== undefined && data.constraint_conflict_count !== null
      ? Number(data.constraint_conflict_count)
      : data.constraintConflictCount !== undefined && data.constraintConflictCount !== null
        ? Number(data.constraintConflictCount)
        : undefined,
  invalid_binding_count:
    data.invalid_binding_count !== undefined && data.invalid_binding_count !== null
      ? Number(data.invalid_binding_count)
      : data.invalidBindingCount !== undefined && data.invalidBindingCount !== null
        ? Number(data.invalidBindingCount)
        : undefined,
  last_validated_at: data.last_validated_at ?? data.lastValidatedAt ?? null,
  created_at: data.created_at,
  updated_at: data.updated_at,
});

const mapStage = (data: any) => ({
  id: Number(data.id),
  template_id: Number(data.template_id),
  stage_code: data.stage_code,
  stage_name: data.stage_name,
  stage_order: Number(data.stage_order),
  start_day: Number(data.start_day),
  description: data.description ?? null,
  operation_count: data.operation_count !== undefined ? Number(data.operation_count) : undefined,
});

const mapResourceNode = (data: any): ResourceNode => ({
  id: Number(data.id),
  nodeCode: data.nodeCode ?? data.node_code,
  nodeName: data.nodeName ?? data.node_name,
  nodeClass: data.nodeClass ?? data.node_class,
  nodeSubtype: data.nodeSubtype ?? data.node_subtype ?? null,
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
  stages: (data.stages ?? []).map(mapStage),
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

const mapConstraint = (data: any): TemplateConstraintLink => ({
  constraintId: Number(data.constraintId ?? data.constraint_id),
  fromScheduleId: Number(data.fromScheduleId ?? data.from_schedule_id),
  fromOperationId: Number(data.fromOperationId ?? data.from_operation_id),
  fromOperationName: data.fromOperationName ?? data.from_operation_name,
  fromOperationCode: data.fromOperationCode ?? data.from_operation_code,
  toScheduleId: Number(data.toScheduleId ?? data.to_schedule_id),
  toOperationId: Number(data.toOperationId ?? data.to_operation_id),
  toOperationName: data.toOperationName ?? data.to_operation_name,
  toOperationCode: data.toOperationCode ?? data.to_operation_code,
  constraintType: Number(data.constraintType ?? data.constraint_type ?? 1),
  lagTime: Number(data.lagTime ?? data.lag_time ?? 0),
  lagType: data.lagType ?? data.lag_type ?? null,
  lagMin: data.lagMin !== undefined || data.lag_min !== undefined ? Number(data.lagMin ?? data.lag_min ?? 0) : null,
  lagMax: data.lagMax !== undefined || data.lag_max !== undefined ? Number(data.lagMax ?? data.lag_max) : null,
  shareMode: data.shareMode ?? data.share_mode ?? 'NONE',
  constraintLevel:
    data.constraintLevel !== undefined || data.constraint_level !== undefined
      ? Number(data.constraintLevel ?? data.constraint_level)
      : null,
  constraintName: data.constraintName ?? data.constraint_name ?? null,
  description: data.description ?? null,
  fromStageName: data.fromStageName ?? data.from_stage_name,
  toStageName: data.toStageName ?? data.to_stage_name,
  fromOperationDay: Number(data.fromOperationDay ?? data.from_operation_day ?? 0),
  fromRecommendedTime: Number(data.fromRecommendedTime ?? data.from_recommended_time ?? 0),
  fromRecommendedDayOffset:
    data.fromRecommendedDayOffset !== undefined || data.from_recommended_day_offset !== undefined
      ? Number(data.fromRecommendedDayOffset ?? data.from_recommended_day_offset ?? 0)
      : null,
  toOperationDay: Number(data.toOperationDay ?? data.to_operation_day ?? 0),
  toRecommendedTime: Number(data.toRecommendedTime ?? data.to_recommended_time ?? 0),
  toRecommendedDayOffset:
    data.toRecommendedDayOffset !== undefined || data.to_recommended_day_offset !== undefined
      ? Number(data.toRecommendedDayOffset ?? data.to_recommended_day_offset ?? 0)
      : null,
  fromStageStartDay: Number(data.fromStageStartDay ?? data.from_stage_start_day ?? 0),
  toStageStartDay: Number(data.toStageStartDay ?? data.to_stage_start_day ?? 0),
});

const mapShareGroup = (data: any): TemplateShareGroupSummary => ({
  id: Number(data.id),
  templateId: Number(data.templateId ?? data.template_id),
  groupCode: data.groupCode ?? data.group_code,
  groupName: data.groupName ?? data.group_name,
  shareMode: data.shareMode ?? data.share_mode,
  createdAt: data.createdAt ?? data.created_at,
  memberCount: Number(data.memberCount ?? data.member_count ?? 0),
  memberIds: (data.memberIds ?? data.member_ids ?? []).map((item: unknown) => Number(item)),
  members: (data.members ?? []).map((item: any) => ({
    id: Number(item.id),
    scheduleId: Number(item.scheduleId ?? item.schedule_id),
    operationName: item.operationName ?? item.operation_name,
    requiredPeople: Number(item.requiredPeople ?? item.required_people ?? 1),
    stageName: item.stageName ?? item.stage_name,
  })),
});

const mapOperationLibraryItem = (data: any): OperationLibraryItem => ({
  id: Number(data.id),
  operation_code: data.operation_code,
  operation_name: data.operation_name,
  standard_time: Number(data.standard_time ?? 0),
  required_people: Number(data.required_people ?? 1),
  description: data.description ?? null,
  operation_type_id:
    data.operation_type_id !== undefined && data.operation_type_id !== null ? Number(data.operation_type_id) : null,
  operation_type_code: data.operation_type_code ?? null,
  operation_type_name: data.operation_type_name ?? null,
  operation_type_color: data.operation_type_color ?? null,
  qualification_count:
    data.qualification_count !== undefined && data.qualification_count !== null ? Number(data.qualification_count) : undefined,
});

const mapOperationType = (data: any): OperationTypeOption => ({
  id: Number(data.id),
  typeCode: data.type_code,
  typeName: data.type_name,
  color: data.color ?? '#1677ff',
  teamId: data.team_id !== undefined && data.team_id !== null ? Number(data.team_id) : null,
  teamCode: data.team_code ?? null,
  teamName: data.team_name ?? null,
});

const mapResourceEditorResponse = (data: any): TemplateResourceEditorResponse => ({
  ...mapPlannerResponse(data),
  constraints: (data.constraints ?? []).map(mapConstraint),
  shareGroups: (data.share_groups ?? []).map(mapShareGroup),
  validation: {
    summary: {
      unplacedCount: Number(data.validation?.summary?.unplaced_count ?? 0),
      invalidBindingCount: Number(data.validation?.summary?.invalid_binding_count ?? 0),
      resourceRuleMismatchCount: Number(data.validation?.summary?.resource_rule_mismatch_count ?? 0),
      constraintConflictCount: Number(data.validation?.summary?.constraint_conflict_count ?? 0),
    },
    unplacedOperationIds: (data.validation?.unplaced_operation_ids ?? []).map((item: unknown) => Number(item)),
    invalidBindings: (data.validation?.invalid_bindings ?? []).map((item: any) => ({
      scheduleId: Number(item.scheduleId ?? item.schedule_id),
      status: item.status,
      reason: item.reason ?? null,
    })),
    resourceRuleMismatchIds: (data.validation?.resource_rule_mismatch_ids ?? []).map((item: unknown) => Number(item)),
    constraintConflicts: data.validation?.constraint_conflicts ?? [],
  },
  capabilities: {
    resourceRulesEnabled: Boolean(data.capabilities?.resource_rules_enabled),
    constraintEditEnabled: Boolean(data.capabilities?.constraint_edit_enabled),
    shareGroupEnabled: Boolean(data.capabilities?.share_group_enabled),
  },
  operationLibrary: (data.operation_library ?? []).map(mapOperationLibraryItem),
});

const buildValidationFromPlannerOperations = (operations: PlannerOperation[]) => {
  const unplacedOperationIds: number[] = [];
  const resourceRuleMismatchIds: number[] = [];
  const invalidBindings: Array<{
    scheduleId: number;
    status: TemplateBindingStatus;
    reason: string | null;
  }> = [];

  operations.forEach((operation) => {
    const scheduleId = Number(operation.id);
    const status = (operation.bindingStatus ?? 'UNBOUND') as TemplateBindingStatus;
    const reason = operation.bindingReason ?? null;

    if (status === 'UNBOUND') {
      unplacedOperationIds.push(scheduleId);
    }
    if (status !== 'BOUND') {
      invalidBindings.push({ scheduleId, status, reason });
    }
    if (status === 'RESOURCE_RULE_MISMATCH') {
      resourceRuleMismatchIds.push(scheduleId);
    }
  });

  return {
    summary: {
      unplacedCount: unplacedOperationIds.length,
      invalidBindingCount: invalidBindings.length,
      resourceRuleMismatchCount: resourceRuleMismatchIds.length,
      constraintConflictCount: 0,
    },
    unplacedOperationIds,
    invalidBindings,
    resourceRuleMismatchIds,
    constraintConflicts: [],
  };
};

const buildEditorFallbackFromPlanner = (planner: TemplateResourcePlannerResponse): TemplateResourceEditorResponse => ({
  ...planner,
  warnings: [
    ...(planner.warnings ?? []),
    'resource-editor 扩展接口不可用，已启用兼容模式（约束/共享组/规则编辑能力受限）。',
  ],
  constraints: [],
  shareGroups: [],
  validation: buildValidationFromPlannerOperations(planner.operations ?? []),
  capabilities: {
    resourceRulesEnabled: false,
    constraintEditEnabled: false,
    shareGroupEnabled: false,
  },
  operationLibrary: [],
});

const toResourceNodePayload = (payload: ResourceNodePayload) => ({
  node_code: payload.nodeCode,
  node_name: payload.nodeName,
  node_class: payload.nodeClass,
  node_subtype: payload.nodeSubtype ?? null,
  parent_id: payload.parentId ?? null,
  department_code: payload.departmentCode,
  owner_org_unit_id: payload.ownerOrgUnitId ?? null,
  bound_resource_id: payload.boundResourceId ?? null,
  sort_order: payload.sortOrder,
  is_active: payload.isActive,
  metadata: payload.metadata ?? null,
});

const mapResourceNodeRelation = (data: any): ResourceNodeRelation => ({
  id: Number(data.id),
  sourceNodeId: Number(data.sourceNodeId ?? data.source_node_id),
  targetNodeId: Number(data.targetNodeId ?? data.target_node_id),
  relationType: (data.relationType ?? data.relation_type ?? 'CIP_CLEANABLE') as 'CIP_CLEANABLE',
  metadata: data.metadata ?? null,
  target: mapResourceNode(data.target),
});

const mapResourceNodeCleanableTargetsResponse = (data: any): ResourceNodeCleanableTargetsResponse => ({
  sourceNodeId: Number(data.sourceNodeId ?? data.source_node_id),
  relationType: (data.relationType ?? data.relation_type ?? 'CIP_CLEANABLE') as 'CIP_CLEANABLE',
  targets: (data.targets ?? []).map((item: any) => mapResourceNodeRelation(item)),
  candidateTargets: (data.candidateTargets ?? data.candidate_targets ?? []).map((item: any) => mapResourceNode(item)),
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
  getResourceEditor: async (templateId: number) => {
    try {
      const response = await client.get(`/process-templates/${templateId}/resource-editor`);
      return mapResourceEditorResponse(response.data);
    } catch (error: any) {
      const status = Number(error?.response?.status ?? 0);
      const shouldFallback =
        !status || status === 404 || status === 500 || status === 502 || status === 503 || status === 504;

      if (!shouldFallback) {
        throw error;
      }

      const plannerResponse = await client.get(`/process-templates/${templateId}/resource-planner`);
      const plannerPayload = mapPlannerResponse(plannerResponse.data);
      return buildEditorFallbackFromPlanner(plannerPayload);
    }
  },
  validateResourceEditor: async (templateId: number) => {
    const response = await client.post(`/process-templates/${templateId}/editor-validate`);
    return response.data;
  },
  createStage: async (templateId: number, payload: CreateStagePayload) => {
    const response = await client.post(`/process-stages/template/${templateId}`, {
      stage_name: payload.stageName,
      stage_order: payload.stageOrder,
      start_day: payload.startDay,
      description: payload.description ?? null,
    });
    return mapStage(response.data);
  },
  updateStage: async (stageId: number, payload: UpdateStagePayload) => {
    await client.put(`/process-stages/${stageId}`, {
      stage_name: payload.stageName,
      stage_order: payload.stageOrder,
      start_day: payload.startDay,
      description: payload.description ?? null,
    });
  },
  deleteStage: async (stageId: number) => {
    await client.delete(`/process-stages/${stageId}`);
  },
  listOperationLibrary: async () => {
    const response = await client.get('/operations');
    return (response.data ?? []).map(mapOperationLibraryItem);
  },
  getNextOperationCode: async () => {
    const response = await client.get('/operations/next-code');
    return response.data?.nextCode ?? '';
  },
  listOperationTypes: async (teamId?: number | null) => {
    const response = await client.get('/operation-types', {
      params: teamId ? { team_id: teamId } : undefined,
    });
    return (response.data ?? []).map(mapOperationType);
  },
  createOperationLibraryItem: async (payload: {
    operationName: string;
    standardTime: number;
    requiredPeople: number;
    operationTypeId?: number | null;
    description?: string;
  }) => {
    const response = await client.post('/operations', {
      operation_name: payload.operationName,
      standard_time: payload.standardTime,
      required_people: payload.requiredPeople,
      operation_type_id: payload.operationTypeId ?? null,
      description: payload.description ?? null,
    });
    return mapOperationLibraryItem(response.data);
  },
  createStageOperation: async (stageId: number, payload: CreateStageOperationPayload) => {
    const response = await client.post(`/stage-operations/stage/${stageId}`, {
      operation_id: payload.operationId,
      operation_day: payload.operationDay,
      recommended_time: payload.recommendedTime,
      recommended_day_offset: payload.recommendedDayOffset ?? 0,
      window_start_time: payload.windowStartTime,
      window_start_day_offset: payload.windowStartDayOffset ?? 0,
      window_end_time: payload.windowEndTime,
      window_end_day_offset: payload.windowEndDayOffset ?? 0,
    });
    return Number(response.data.id);
  },
  createStageOperationFromCanvas: async (
    templateId: number,
    payload: CreateStageOperationPayload & {
      stageId: number;
      resourceNodeId?: number | null;
      absoluteStartHour?: number;
    },
  ) => {
    const response = await client.post(`/process-templates/${templateId}/stage-operations/from-canvas`, {
      stage_id: payload.stageId,
      operation_id: payload.operationId,
      resource_node_id: payload.resourceNodeId ?? null,
      operation_day: payload.operationDay,
      recommended_time: payload.recommendedTime,
      recommended_day_offset: payload.recommendedDayOffset ?? 0,
      window_start_time: payload.windowStartTime,
      window_start_day_offset: payload.windowStartDayOffset ?? 0,
      window_end_time: payload.windowEndTime,
      window_end_day_offset: payload.windowEndDayOffset ?? 0,
      absolute_start_hour: payload.absoluteStartHour,
    });
    return Number(response.data.id);
  },
  updateStageOperation: async (scheduleId: number, payload: UpdateStageOperationPayload) => {
    await client.put(`/stage-operations/${scheduleId}`, {
      operation_day: payload.operationDay,
      recommended_time: payload.recommendedTime,
      recommended_day_offset: payload.recommendedDayOffset,
      window_start_time: payload.windowStartTime,
      window_start_day_offset: payload.windowStartDayOffset,
      window_end_time: payload.windowEndTime,
      window_end_day_offset: payload.windowEndDayOffset,
      operation_order: payload.operationOrder,
    });
  },
  moveStageOperationToStage: async (scheduleId: number, targetStageId: number, targetOperationOrder?: number) => {
    await client.post(`/stage-operations/${scheduleId}/move-stage`, {
      target_stage_id: targetStageId,
      target_operation_order: targetOperationOrder,
    });
  },
  deleteStageOperation: async (scheduleId: number) => {
    await client.delete(`/stage-operations/${scheduleId}`);
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
  getResourceNodeCleanableTargets: async (nodeId: number): Promise<ResourceNodeCleanableTargetsResponse> => {
    const response = await client.get(`/resource-nodes/${nodeId}/cleanable-targets`);
    return mapResourceNodeCleanableTargetsResponse(response.data);
  },
  updateResourceNodeCleanableTargets: async (
    nodeId: number,
    payload: {
      targetNodeIds: number[];
    },
  ): Promise<ResourceNodeCleanableTargetsResponse> => {
    const response = await client.put(`/resource-nodes/${nodeId}/cleanable-targets`, {
      target_node_ids: payload.targetNodeIds,
    });
    return mapResourceNodeCleanableTargetsResponse(response.data);
  },
  clearResourceNodeTreeForRebuild: async () => {
    await client.post('/resource-nodes/rebuild/clear', { confirm: true });
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
  updateTemplateStageOperationResources: async (scheduleId: number, requirements: ResourceRequirementRule[]) => {
    const response = await client.put(`/template-stage-operations/${scheduleId}/resources`, {
      requirements: requirements.map((rule) => ({
        resource_type: rule.resource_type,
        required_count: rule.required_count,
        is_mandatory: rule.is_mandatory,
        requires_exclusive_use: rule.requires_exclusive_use,
        prep_minutes: rule.prep_minutes,
        changeover_minutes: rule.changeover_minutes,
        cleanup_minutes: rule.cleanup_minutes,
        candidate_resource_ids: rule.candidate_resource_ids,
      })),
    });
    return response.data;
  },
  getOperationConstraints: async (scheduleId: number) => {
    const response = await client.get(`/constraints/operation/${scheduleId}`);
    return response.data;
  },
  createConstraint: async (payload: Record<string, unknown>) => {
    const response = await client.post('/constraints', payload);
    return response.data;
  },
  updateConstraint: async (constraintId: number, payload: Record<string, unknown>) => {
    const response = await client.put(`/constraints/${constraintId}`, payload);
    return response.data;
  },
  deleteConstraint: async (constraintId: number) => {
    await client.delete(`/constraints/${constraintId}`);
  },
  listOperationShareGroups: async (scheduleId: number) => {
    const response = await client.get(`/share-groups/operation/${scheduleId}`);
    return (response.data ?? []).map(mapShareGroup);
  },
  createTemplateShareGroup: async (
    templateId: number,
    payload: { groupName: string; shareMode: 'SAME_TEAM' | 'DIFFERENT'; memberIds: number[] },
  ) => {
    const response = await client.post(`/share-groups/template/${templateId}`, {
      group_name: payload.groupName,
      share_mode: payload.shareMode,
      member_ids: payload.memberIds,
    });
    return response.data;
  },
  updateTemplateShareGroup: async (
    groupId: number,
    payload: { groupName?: string; shareMode?: 'SAME_TEAM' | 'DIFFERENT'; memberIds?: number[] },
  ) => {
    const response = await client.put(`/share-groups/${groupId}`, {
      group_name: payload.groupName,
      share_mode: payload.shareMode,
      member_ids: payload.memberIds,
    });
    return response.data;
  },
  assignOperationToShareGroup: async (scheduleId: number, groupId: number) => {
    const response = await client.post('/share-groups/assign', {
      schedule_id: scheduleId,
      share_group_id: groupId,
    });
    return response.data;
  },
  removeOperationFromShareGroup: async (scheduleId: number, groupId: number) => {
    await client.delete(`/share-groups/operation/${scheduleId}/group/${groupId}`);
  },
  deleteTemplateShareGroup: async (groupId: number) => {
    await client.delete(`/share-groups/${groupId}`);
  },
  listResources: async (): Promise<Resource[]> => {
    const response = await client.get('/resources');
    const payload = Array.isArray(response.data) ? response.data : response.data?.data ?? [];
    return payload.map(mapResource);
  },
};
