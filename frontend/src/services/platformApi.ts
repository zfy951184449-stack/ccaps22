import axios from 'axios';
import {
  MaintenanceWindow,
  MaintenanceWindowInput,
  OperationResourceRequirement,
  OperationResourceRequirementInput,
  PlatformConflict,
  PlatformOverview,
  PlatformProject,
  PlatformProjectBatch,
  PlatformProjectDetail,
  PlatformRunSummary,
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
  employeeName: data.employeeName ?? data.employee_name ?? null,
  windowStart: data.windowStart ?? data.window_start,
  windowEnd: data.windowEnd ?? data.window_end,
  details: data.details,
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

const toRequirementPayload = (data: OperationResourceRequirementInput) => ({
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

const toMaintenancePayload = (data: MaintenanceWindowInput) => ({
  resource_id: data.resourceId,
  window_type: data.windowType,
  start_datetime: data.startDatetime,
  end_datetime: data.endDatetime,
  is_hard_block: data.isHardBlock,
  owner_dept_code: data.ownerDeptCode,
  notes: data.notes ?? null,
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
    const response = await client.patch(`/operation-resource-requirements/${id}`, toRequirementPayload(payload as OperationResourceRequirementInput));
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
    const response = await client.patch(`/maintenance-windows/${id}`, toMaintenancePayload(payload as MaintenanceWindowInput));
    return response.data;
  },
};

export const platformApi = {
  getOverview: async (): Promise<PlatformOverview> => {
    const response = await client.get('/platform/overview');
    const data = response.data;
    return {
      projectCount: Number(data.projectCount ?? data.project_count ?? 0),
      activeBatchCount: Number(data.activeBatchCount ?? data.active_batch_count ?? 0),
      resourceCount: Number(data.resourceCount ?? data.resource_count ?? 0),
      resourceConflictCount: Number(data.resourceConflictCount ?? data.resource_conflict_count ?? 0),
      personnelConflictCount: Number(data.personnelConflictCount ?? data.personnel_conflict_count ?? 0),
      maintenanceBlockCount: Number(data.maintenanceBlockCount ?? data.maintenance_block_count ?? 0),
      missingMasterDataCount: Number(data.missingMasterDataCount ?? data.missing_master_data_count ?? 0),
      departments: (data.departments ?? []).map((row: any) => ({
        departmentCode: row.departmentCode ?? row.department_code,
        resourceCount: Number(row.resourceCount ?? row.resource_count ?? 0),
      })),
      recentRuns: (data.recentRuns ?? data.recent_runs ?? []).map(mapRun),
    };
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
  getConflicts: async (params?: { project_key?: string; limit?: number }): Promise<PlatformConflict[]> => {
    const response = await client.get('/platform/conflicts', { params });
    return extractArrayPayload(response.data).map(mapConflict);
  },
  getRuns: async (): Promise<PlatformRunSummary[]> => {
    const response = await client.get('/v4/scheduling/runs');
    return (response.data.data ?? []).map(mapRun);
  },
};
