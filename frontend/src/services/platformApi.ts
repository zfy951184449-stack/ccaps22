import axios from 'axios';
import {
  MaintenanceWindow,
  MaintenanceWindowInput,
  OperationResourceRequirement,
  OperationResourceRequirementInput,
  PlatformBusinessRulesCoverage,
  PlatformConflict,
  PlatformConflictDetail,
  PlatformMaintenanceImpact,
  PlatformOperationResourceBindingInput,
  PlatformOperationUpdateInput,
  PlatformOverview,
  PlatformProject,
  PlatformProjectBatch,
  PlatformProjectDetail,
  PlatformProjectTimelineResponse,
  PlatformReadinessSummary,
  PlatformRiskItem,
  PlatformRunDetail,
  PlatformRunSummary,
  PlatformTimelineDependency,
  PlatformTimelineItem,
  PlatformTimelineLane,
  PlatformResourceTimelineResponse,
  Resource,
  ResourceCalendarEntry,
  ResourceCalendarEntryInput,
  ResourceInput,
} from '../types/platform';

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const extractArrayPayload = <T = any>(payload: any): T[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

const mapRiskItem = (data: any): PlatformRiskItem => ({
  id: String(data.id ?? data.project_code ?? data.resource_code ?? data.label),
  label: data.label ?? data.projectName ?? data.project_name ?? data.resourceName ?? data.resource_name ?? data.project_code ?? data.resource_code,
  sublabel:
    data.sublabel ??
    data.resourceCode ??
    data.resource_code ??
    data.projectCode ??
    data.project_code ??
    data.departmentCode ??
    data.department_code ??
    undefined,
  domainCode: data.domainCode ?? data.domain_code ?? data.departmentCode ?? data.department_code ?? null,
  metric: Number(
    data.metric ??
      data.missingResourceRequirementCount ??
      data.missing_resource_requirement_count ??
      data.maintenanceWindowCount ??
      data.maintenance_window_count ??
      data.assignmentCount ??
      data.assignment_count ??
      0,
  ),
  metricLabel:
    data.metricLabel ??
    data.metric_label ??
    (data.missingResourceRequirementCount !== undefined || data.missing_resource_requirement_count !== undefined
      ? '缺规则'
      : data.maintenanceWindowCount !== undefined || data.maintenance_window_count !== undefined
        ? '维护窗口'
        : '指标'),
});

const mapRun = (data: any): PlatformRunSummary => ({
  id: Number(data.id),
  runCode: data.runCode ?? data.run_code,
  status: data.status,
  stage: data.stage,
  createdAt: data.createdAt ?? data.created_at,
  completedAt: data.completedAt ?? data.completed_at ?? null,
  solverStatus: data.solverStatus ?? data.solver_status ?? null,
  fillRate: data.fillRate ?? data.fill_rate ?? null,
  solveTime: data.solveTime ?? data.solve_time ?? null,
});

const mapReadiness = (data: any): PlatformReadinessSummary => ({
  domainCode: data.domainCode ?? data.domain_code,
  projectCount: Number(data.projectCount ?? data.project_count ?? 0),
  resourceCount: Number(data.resourceCount ?? data.resource_count ?? 0),
  resourceRequirementCoverage: Number(data.resourceRequirementCoverage ?? data.resource_requirement_coverage ?? 0),
  candidateBindingCoverage: Number(data.candidateBindingCoverage ?? data.candidate_binding_coverage ?? 0),
  conflictCount: Number(data.conflictCount ?? data.conflict_count ?? 0),
  maintenanceBlockCount: Number(data.maintenanceBlockCount ?? data.maintenance_block_count ?? 0),
  readinessStatus: data.readinessStatus ?? data.readiness_status ?? 'NOT_READY',
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

const mapResourceCalendarEntry = (data: any): ResourceCalendarEntry => ({
  id: Number(data.id),
  resourceId: Number(data.resourceId ?? data.resource_id),
  startDatetime: data.startDatetime ?? data.start_datetime,
  endDatetime: data.endDatetime ?? data.end_datetime,
  eventType: data.eventType ?? data.event_type,
  sourceType: data.sourceType ?? data.source_type,
  sourceId: data.sourceId ?? data.source_id ?? null,
  notes: data.notes ?? null,
});

const mapRequirement = (data: any): OperationResourceRequirement => ({
  id: Number(data.id),
  operationId: Number(data.operationId ?? data.operation_id),
  operationCode: data.operationCode ?? data.operation_code ?? undefined,
  operationName: data.operationName ?? data.operation_name ?? undefined,
  resourceType: data.resourceType ?? data.resource_type,
  requiredCount: Number(data.requiredCount ?? data.required_count ?? 1),
  isMandatory: Boolean(data.isMandatory ?? data.is_mandatory),
  requiresExclusiveUse: Boolean(data.requiresExclusiveUse ?? data.requires_exclusive_use),
  prepMinutes: Number(data.prepMinutes ?? data.prep_minutes ?? 0),
  changeoverMinutes: Number(data.changeoverMinutes ?? data.changeover_minutes ?? 0),
  cleanupMinutes: Number(data.cleanupMinutes ?? data.cleanup_minutes ?? 0),
  candidateResourceIds: (data.candidateResourceIds ?? data.candidate_resource_ids ?? []).map((id: unknown) => Number(id)),
  candidateResources: (data.candidateResources ?? data.candidate_resources ?? []).map((resource: any) => ({
    id: Number(resource.id),
    resourceCode: resource.resourceCode ?? resource.resource_code,
    resourceName: resource.resourceName ?? resource.resource_name,
    resourceType: resource.resourceType ?? resource.resource_type,
  })),
});

const mapMaintenanceWindow = (data: any): MaintenanceWindow => ({
  id: Number(data.id),
  resourceId: Number(data.resourceId ?? data.resource_id),
  resourceName: data.resourceName ?? data.resource_name ?? undefined,
  resourceCode: data.resourceCode ?? data.resource_code ?? undefined,
  departmentCode: data.departmentCode ?? data.department_code ?? undefined,
  windowType: data.windowType ?? data.window_type,
  startDatetime: data.startDatetime ?? data.start_datetime,
  endDatetime: data.endDatetime ?? data.end_datetime,
  isHardBlock: Boolean(data.isHardBlock ?? data.is_hard_block),
  ownerDeptCode: (data.ownerDeptCode ?? data.owner_dept_code ?? 'MAINT') as 'MAINT',
  notes: data.notes ?? null,
});

const mapProject = (data: any): PlatformProject => ({
  id: String(data.id),
  projectCode: data.projectCode ?? data.project_code,
  projectName: data.projectName ?? data.project_name,
  plannedStartDate: data.plannedStartDate ?? data.planned_start_date ?? null,
  plannedEndDate: data.plannedEndDate ?? data.planned_end_date ?? null,
  batchCount: Number(data.batchCount ?? data.batch_count ?? 0),
  activatedBatchCount: Number(data.activatedBatchCount ?? data.activated_batch_count ?? 0),
  teamCount: Number(data.teamCount ?? data.team_count ?? 0),
  departmentCodes: data.departmentCodes ?? data.department_codes ?? [],
  missingResourceRequirementCount: Number(data.missingResourceRequirementCount ?? data.missing_resource_requirement_count ?? 0),
});

const mapProjectBatch = (data: any): PlatformProjectBatch => ({
  id: Number(data.id),
  batchCode: data.batchCode ?? data.batch_code,
  batchName: data.batchName ?? data.batch_name,
  planStatus: data.planStatus ?? data.plan_status,
  plannedStartDate: data.plannedStartDate ?? data.planned_start_date ?? null,
  plannedEndDate: data.plannedEndDate ?? data.planned_end_date ?? null,
  templateName: data.templateName ?? data.template_name ?? null,
  teamCode: data.teamCode ?? data.team_code ?? null,
  teamName: data.teamName ?? data.team_name ?? null,
});

const mapConflict = (data: any): PlatformConflict => ({
  id: String(data.id),
  conflictType: data.conflictType ?? data.conflict_type,
  severity: data.severity,
  title: data.title,
  departmentCode: data.departmentCode ?? data.department_code ?? null,
  projectCode: data.projectCode ?? data.project_code ?? null,
  resourceName: data.resourceName ?? data.resource_name ?? null,
  resourceId: data.resourceId ?? data.resource_id ?? null,
  employeeName: data.employeeName ?? data.employee_name ?? null,
  windowStart: data.windowStart ?? data.window_start,
  windowEnd: data.windowEnd ?? data.window_end,
  details: data.details,
});

const mapTimelineLane = (data: any): PlatformTimelineLane => ({
  id: String(data.id),
  label: data.label,
  groupLabel: data.groupLabel ?? data.group_label ?? null,
  domainCode: data.domainCode ?? data.domain_code ?? null,
  laneType: data.laneType ?? data.lane_type ?? null,
});

const mapTimelineItem = (data: any): PlatformTimelineItem => ({
  id: String(data.id),
  laneId: data.laneId ?? data.lane_id,
  itemType: data.itemType ?? data.item_type,
  title: data.title,
  subtitle: data.subtitle ?? null,
  startDatetime: data.startDatetime ?? data.start_datetime,
  endDatetime: data.endDatetime ?? data.end_datetime,
  color: data.color,
  status: data.status ?? null,
  domainCode: data.domainCode ?? data.domain_code ?? null,
  isConflicted: Boolean(data.isConflicted ?? data.is_conflicted),
  maintenanceBlocked: Boolean(data.maintenanceBlocked ?? data.maintenance_blocked),
  resourceConflicted: Boolean(data.resourceConflicted ?? data.resource_conflicted),
  metadata: data.metadata ?? null,
});

const mapTimelineDependency = (data: any): PlatformTimelineDependency => ({
  id: Number(data.id),
  fromItemId: data.fromItemId ?? data.from_item_id,
  toItemId: data.toItemId ?? data.to_item_id,
  type: data.type,
  label: data.label ?? null,
});

const toResourcePayload = (data: Partial<ResourceInput>) => ({
  resource_code: data.resourceCode,
  resource_name: data.resourceName,
  resource_type: data.resourceType,
  department_code: data.departmentCode,
  owner_org_unit_id: data.ownerOrgUnitId ?? null,
  status: data.status,
  capacity: data.capacity,
  location: data.location ?? null,
  clean_level: data.cleanLevel ?? null,
  is_shared: data.isShared,
  is_schedulable: data.isSchedulable,
  metadata: data.metadata ?? null,
});

const toResourceCalendarPayload = (data: ResourceCalendarEntryInput) => ({
  start_datetime: data.startDatetime,
  end_datetime: data.endDatetime,
  event_type: data.eventType,
  source_type: data.sourceType,
  source_id: data.sourceId ?? null,
  notes: data.notes ?? null,
});

const toRequirementPayload = (data: Partial<OperationResourceRequirementInput>) => ({
  operation_id: data.operationId,
  resource_type: data.resourceType,
  required_count: data.requiredCount,
  is_mandatory: data.isMandatory,
  requires_exclusive_use: data.requiresExclusiveUse,
  prep_minutes: data.prepMinutes,
  changeover_minutes: data.changeoverMinutes,
  cleanup_minutes: data.cleanupMinutes,
  candidate_resource_ids: data.candidateResourceIds ?? [],
});

const toMaintenancePayload = (data: Partial<MaintenanceWindowInput>) => ({
  resource_id: data.resourceId,
  window_type: data.windowType,
  start_datetime: data.startDatetime,
  end_datetime: data.endDatetime,
  is_hard_block: data.isHardBlock,
  owner_dept_code: data.ownerDeptCode,
  notes: data.notes ?? null,
});

const toOperationPayload = (data: PlatformOperationUpdateInput) => ({
  planned_start_datetime: data.plannedStartDatetime,
  planned_end_datetime: data.plannedEndDatetime,
  notes: data.notes ?? null,
});

const toOperationBindingPayload = (data: PlatformOperationResourceBindingInput) => ({
  resource_type: data.resourceType,
  required_count: data.requiredCount,
  candidate_resource_ids: data.candidateResourceIds ?? [],
  prep_minutes: data.prepMinutes,
  changeover_minutes: data.changeoverMinutes,
  cleanup_minutes: data.cleanupMinutes,
  is_mandatory: data.isMandatory,
  requires_exclusive_use: data.requiresExclusiveUse,
});

export const resourcesApi = {
  list: async (params?: Record<string, string | number | boolean>) => {
    const response = await client.get('/resources', { params });
    return extractArrayPayload(response.data).map(mapResource);
  },
  getById: async (id: number) => {
    const response = await client.get(`/resources/${id}`);
    return mapResource(response.data);
  },
  create: async (payload: ResourceInput) => {
    const response = await client.post('/resources', toResourcePayload(payload));
    return response.data;
  },
  update: async (id: number, payload: Partial<ResourceInput>) => {
    const response = await client.patch(`/resources/${id}`, toResourcePayload(payload));
    return response.data;
  },
  getCalendar: async (id: number, params?: { from?: string; to?: string }) => {
    const response = await client.get(`/resources/${id}/calendar`, { params });
    return extractArrayPayload(response.data).map(mapResourceCalendarEntry);
  },
  createCalendarEntry: async (id: number, payload: ResourceCalendarEntryInput) => {
    const response = await client.post(`/resources/${id}/calendar`, toResourceCalendarPayload(payload));
    return response.data;
  },
  updateCalendarEntry: async (id: number, eventId: number, payload: Partial<ResourceCalendarEntryInput>) => {
    const response = await client.patch(`/resources/${id}/calendar/${eventId}`, toResourceCalendarPayload(payload as ResourceCalendarEntryInput));
    return response.data;
  },
  deleteCalendarEntry: async (id: number, eventId: number) => {
    const response = await client.delete(`/resources/${id}/calendar/${eventId}`);
    return response.data;
  },
};

export const operationResourceRequirementsApi = {
  list: async (params?: Record<string, string | number>) => {
    const response = await client.get('/operation-resource-requirements', { params });
    return extractArrayPayload(response.data).map(mapRequirement);
  },
  create: async (payload: OperationResourceRequirementInput) => {
    const response = await client.post('/operation-resource-requirements', toRequirementPayload(payload));
    return response.data;
  },
  update: async (id: number, payload: Partial<OperationResourceRequirementInput>) => {
    const response = await client.patch(`/operation-resource-requirements/${id}`, toRequirementPayload(payload));
    return response.data;
  },
};

export const maintenanceWindowsApi = {
  list: async (params?: Record<string, string | number | boolean>) => {
    const response = await client.get('/maintenance-windows', { params });
    return extractArrayPayload(response.data).map(mapMaintenanceWindow);
  },
  create: async (payload: MaintenanceWindowInput) => {
    const response = await client.post('/maintenance-windows', toMaintenancePayload(payload));
    return response.data;
  },
  update: async (id: number, payload: Partial<MaintenanceWindowInput>) => {
    const response = await client.patch(`/maintenance-windows/${id}`, toMaintenancePayload(payload));
    return response.data;
  },
  delete: async (id: number) => {
    const response = await client.delete(`/maintenance-windows/${id}`);
    return response.data;
  },
};

export const platformApi = {
  getOverview: async (params?: Record<string, string | number | boolean>): Promise<PlatformOverview> => {
    const response = await client.get('/platform/overview', { params });
    const data = response.data;
    const readiness = (data.readiness ?? []).map(mapReadiness);
    const missingCount = Number(data.missingMasterDataCount ?? data.missing_master_data_count ?? 0);
    const activeBatchCount = Number(data.activeBatchCount ?? data.active_batch_count ?? 0);

    return {
      projectCount: Number(data.projectCount ?? data.project_count ?? 0),
      activeBatchCount,
      resourceCount: Number(data.resourceCount ?? data.resource_count ?? 0),
      resourceConflictCount: Number(data.resourceConflictCount ?? data.resource_conflict_count ?? 0),
      personnelConflictCount: Number(data.personnelConflictCount ?? data.personnel_conflict_count ?? 0),
      maintenanceBlockCount: Number(data.maintenanceBlockCount ?? data.maintenance_block_count ?? 0),
      missingMasterDataCount: missingCount,
      ruleCoverageRate:
        activeBatchCount > 0 ? Math.max(0, 1 - missingCount / Math.max(activeBatchCount, 1)) : 0,
      departments: (data.departments ?? []).map((row: any) => ({
        departmentCode: row.departmentCode ?? row.department_code,
        resourceCount: Number(row.resourceCount ?? row.resource_count ?? 0),
      })),
      recentRuns: (data.recentRuns ?? data.recent_runs ?? []).map(mapRun),
      readiness,
      topResources: (data.topResources ?? data.top_resources ?? []).map(mapRiskItem),
      topProjects: (data.topProjects ?? data.top_projects ?? []).map(mapRiskItem),
      warnings: data.warnings ?? [],
    };
  },
  getOverviewReadiness: async (): Promise<PlatformReadinessSummary[]> => {
    const response = await client.get('/platform/overview/readiness');
    return extractArrayPayload(response.data).map(mapReadiness);
  },
  getProjects: async (): Promise<PlatformProject[]> => {
    const response = await client.get('/platform/projects');
    return extractArrayPayload(response.data).map(mapProject);
  },
  getProjectById: async (id: string): Promise<PlatformProjectDetail> => {
    const response = await client.get(`/platform/projects/${id}`);
    const data = response.data;
    return {
      project: mapProject(data.project),
      batches: (data.batches ?? []).map(mapProjectBatch),
      operationsSummary: {
        totalOperations: Number(data.operationsSummary?.totalOperations ?? data.operations_summary?.total_operations ?? 0),
        missingResourceRequirementCount: Number(
          data.operationsSummary?.missingResourceRequirementCount ??
            data.operations_summary?.missing_resource_requirement_count ??
            0,
        ),
      },
    };
  },
  getProjectTimeline: async (
    id: string,
    params?: { from?: string; to?: string },
  ): Promise<PlatformProjectTimelineResponse> => {
    const response = await client.get(`/platform/projects/${id}/timeline`, { params });
    const data = response.data;
    return {
      project: {
        id: String(data.project.id),
        projectCode: data.project.projectCode ?? data.project.project_code,
        projectName: data.project.projectName ?? data.project.project_name,
        plannedStartDate: data.project.plannedStartDate ?? data.project.planned_start_date ?? null,
        plannedEndDate: data.project.plannedEndDate ?? data.project.planned_end_date ?? null,
      },
      lanes: (data.lanes ?? []).map(mapTimelineLane),
      items: (data.items ?? []).map(mapTimelineItem),
      dependencies: (data.dependencies ?? []).map(mapTimelineDependency),
      conflicts: (data.conflicts ?? []).map(mapConflict),
      windowStart: data.windowStart ?? data.window_start,
      windowEnd: data.windowEnd ?? data.window_end,
    };
  },
  updateOperationPlan: async (operationPlanId: number, payload: PlatformOperationUpdateInput) => {
    const response = await client.patch(`/platform/operations/${operationPlanId}`, toOperationPayload(payload));
    return response.data;
  },
  updateOperationResourceBinding: async (operationPlanId: number, payload: PlatformOperationResourceBindingInput) => {
    const response = await client.patch(
      `/platform/operations/${operationPlanId}/resource-binding`,
      toOperationBindingPayload(payload),
    );
    return response.data;
  },
  getConflicts: async (params?: Record<string, string | number | boolean>): Promise<PlatformConflict[]> => {
    const response = await client.get('/platform/conflicts', { params });
    return extractArrayPayload(response.data).map(mapConflict);
  },
  getConflictDetail: async (id: string): Promise<PlatformConflictDetail> => {
    const response = await client.get(`/platform/conflicts/${id}`);
    const data = response.data;
    return {
      ...mapConflict(data),
      relatedProjects: (data.relatedProjects ?? data.related_projects ?? []).map((item: any) => ({
        projectCode: item.projectCode ?? item.project_code,
      })),
      relatedBatches: (data.relatedBatches ?? data.related_batches ?? []).map((item: any) => ({
        id: Number(item.id),
        batchCode: item.batchCode ?? item.batch_code,
        batchName: item.batchName ?? item.batch_name,
      })),
      relatedOperations: (data.relatedOperations ?? data.related_operations ?? []).map((item: any) => ({
        id: Number(item.id),
        operationId: Number(item.operationId ?? item.operation_id),
        operationCode: item.operationCode ?? item.operation_code,
        operationName: item.operationName ?? item.operation_name,
      })),
      relatedResources: (data.relatedResources ?? data.related_resources ?? []).map((item: any) => ({
        id: Number(item.id),
        resourceCode: item.resourceCode ?? item.resource_code,
        resourceName: item.resourceName ?? item.resource_name,
      })),
      relatedMaintenanceWindows: (data.relatedMaintenanceWindows ?? data.related_maintenance_windows ?? []).map((item: any) => ({
        id: Number(item.id),
        windowType: item.windowType ?? item.window_type,
        notes: item.notes ?? null,
      })),
      recommendedRoutes: (data.recommendedRoutes ?? data.recommended_routes ?? []).map((item: any) => ({
        key: item.key,
        path: item.path,
        label: item.label,
      })),
    };
  },
  getResourceTimeline: async (
    params?: Record<string, string | number | boolean>,
  ): Promise<PlatformResourceTimelineResponse> => {
    const response = await client.get('/platform/resources/timeline', { params });
    const data = response.data;
    return {
      resources: (data.resources ?? []).map(mapResource),
      lanes: (data.lanes ?? []).map(mapTimelineLane),
      items: (data.items ?? []).map(mapTimelineItem),
      conflicts: (data.conflicts ?? []).map(mapConflict),
      windowStart: data.windowStart ?? data.window_start,
      windowEnd: data.windowEnd ?? data.window_end,
    };
  },
  getMaintenanceImpact: async (params: { resource_id: number; from?: string; to?: string }): Promise<PlatformMaintenanceImpact> => {
    const response = await client.get('/platform/maintenance/impact', { params });
    const data = response.data;
    return {
      affectedProjects: (data.affectedProjects ?? data.affected_projects ?? []).map((item: any) => ({
        projectCode: item.projectCode ?? item.project_code,
      })),
      affectedBatches: (data.affectedBatches ?? data.affected_batches ?? []).map((item: any) => ({
        id: Number(item.id),
        batchCode: item.batchCode ?? item.batch_code,
      })),
      affectedOperations: (data.affectedOperations ?? data.affected_operations ?? []).map((item: any) => ({
        operationPlanId: Number(item.operationPlanId ?? item.operation_plan_id),
        operationCode: item.operationCode ?? item.operation_code,
        operationName: item.operationName ?? item.operation_name,
        batchCode: item.batchCode ?? item.batch_code,
        projectCode: item.projectCode ?? item.project_code,
        startDatetime: item.startDatetime ?? item.start_datetime,
        endDatetime: item.endDatetime ?? item.end_datetime,
      })),
      affectedResources: (data.affectedResources ?? data.affected_resources ?? []).map((item: any) => ({
        resourceId: Number(item.resourceId ?? item.resource_id),
        overlappingEvents: Number(item.overlappingEvents ?? item.overlapping_events ?? 0),
      })),
    };
  },
  getRuleCoverage: async (): Promise<PlatformBusinessRulesCoverage> => {
    const response = await client.get('/platform/business-rules/coverage');
    const data = response.data;
    return {
      coverageByDomain: (data.coverageByDomain ?? data.coverage_by_domain ?? []).map(mapReadiness),
      missingRuleOperations: (data.missingRuleOperations ?? data.missing_rule_operations ?? []).map((item: any) => ({
        operationPlanId: Number(item.operationPlanId ?? item.operation_plan_id),
        operationId: Number(item.operationId ?? item.operation_id),
        operationCode: item.operationCode ?? item.operation_code,
        operationName: item.operationName ?? item.operation_name,
        batchCode: item.batchCode ?? item.batch_code,
        projectCode: item.projectCode ?? item.project_code,
        domainCode: item.domainCode ?? item.domain_code,
      })),
      missingCandidateBindings: (data.missingCandidateBindings ?? data.missing_candidate_bindings ?? []).map((item: any) => ({
        requirementId: Number(item.requirementId ?? item.requirement_id),
        operationId: Number(item.operationId ?? item.operation_id),
        operationCode: item.operationCode ?? item.operation_code,
        operationName: item.operationName ?? item.operation_name,
        resourceType: item.resourceType ?? item.resource_type,
        requiredCount: Number(item.requiredCount ?? item.required_count ?? 0),
      })),
      mismatchedCandidates: (data.mismatchedCandidates ?? data.mismatched_candidates ?? []).map((item: any) => ({
        requirementId: Number(item.requirementId ?? item.requirement_id),
        operationId: Number(item.operationId ?? item.operation_id),
        operationCode: item.operationCode ?? item.operation_code,
        operationName: item.operationName ?? item.operation_name,
        resourceType: item.resourceType ?? item.resource_type,
        candidateResourceTypes: item.candidateResourceTypes ?? item.candidate_resource_types ?? [],
      })),
    };
  },
  getRuns: async (): Promise<PlatformRunSummary[]> => {
    const response = await client.get('/v4/scheduling/runs');
    return (response.data.data ?? []).map(mapRun);
  },
  getRunDetail: async (id: number): Promise<PlatformRunDetail> => {
    const response = await client.get(`/platform/runs/${id}`);
    const data = response.data;
    return {
      id: Number(data.id),
      runCode: data.runCode ?? data.run_code,
      status: data.status,
      stage: data.stage,
      createdAt: data.createdAt ?? data.created_at,
      completedAt: data.completedAt ?? data.completed_at ?? null,
      windowStart: data.windowStart ?? data.window_start ?? null,
      windowEnd: data.windowEnd ?? data.window_end ?? null,
      solverSummary: data.solverSummary ?? data.solver_summary ?? null,
      applySummary: data.applySummary ?? data.apply_summary ?? null,
      warnings: data.warnings ?? [],
      errorMessage: data.errorMessage ?? data.error_message ?? null,
      targetBatchIds: data.targetBatchIds ?? data.target_batch_ids ?? [],
      relatedProjects: (data.relatedProjects ?? data.related_projects ?? []).map((item: any) => ({
        projectCode: item.projectCode ?? item.project_code,
        batches: item.batches ?? [],
      })),
      relatedConflicts: (data.relatedConflicts ?? data.related_conflicts ?? []).map(mapConflict),
      events: (data.events ?? []).map((item: any) => ({
        id: Number(item.id),
        eventKey: item.eventKey ?? item.event_key,
        stage: item.stage,
        status: item.status,
        message: item.message,
        metadata: item.metadata ?? null,
        createdAt: item.createdAt ?? item.created_at,
      })),
    };
  },
};
