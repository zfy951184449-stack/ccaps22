import axios from 'axios';
import {
  Employee,
  Qualification,
  EmployeeQualification,
  Operation,
  OperationQualificationRequirement,
  ProcessTemplate,
  ProcessStage,
  StageOperationSchedule,
  OperationConstraint,
  ConstraintValidationResult,
  Department,
  Team,
  EmployeeRole,
  EmployeeTeamRole,
  EmployeeUnavailability,
  ShiftType,
  OrgHierarchyResponse,
  EmployeeOrgContext,
  ShiftDefinition,
  BatchPlan,
  BatchTemplateSummary,
  BatchStatistics,
  HolidayServiceStatus,
  SchedulingSettings,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

const mapEmployeePayload = (data: any) => ({
  employeeCode: data.employeeCode ?? data.employee_code,
  employeeName: data.employeeName ?? data.employee_name,
  departmentId: data.departmentId ?? data.department_id ?? null,
  primaryTeamId: data.primaryTeamId ?? data.primary_team_id ?? null,
  primaryRoleId: data.primaryRoleId ?? data.primary_role_id ?? null,
  employmentStatus: data.employmentStatus ?? data.employment_status ?? 'ACTIVE',
  hireDate: data.hireDate ?? data.hire_date ?? null,
  shopfloorBaselinePct: data.shopfloorBaselinePct ?? data.shopfloor_baseline_pct ?? null,
  shopfloorUpperPct: data.shopfloorUpperPct ?? data.shopfloor_upper_pct ?? null,
  orgRole: data.orgRole ?? data.org_role ?? 'FRONTLINE',
  employee_code: data.employeeCode ?? data.employee_code,
  employee_name: data.employeeName ?? data.employee_name,
  department_id: data.departmentId ?? data.department_id ?? null,
  primary_team_id: data.primaryTeamId ?? data.primary_team_id ?? null,
  primary_role_id: data.primaryRoleId ?? data.primary_role_id ?? null,
  employment_status: data.employmentStatus ?? data.employment_status ?? 'ACTIVE',
  hire_date: data.hireDate ?? data.hire_date ?? null,
  shopfloor_baseline_pct: data.shopfloorBaselinePct ?? data.shopfloor_baseline_pct ?? null,
  shopfloor_upper_pct: data.shopfloorUpperPct ?? data.shopfloor_upper_pct ?? null,
  org_role: data.orgRole ?? data.org_role ?? 'FRONTLINE',
});

export const employeeApi = {
  getAll: () => api.get<Employee[]>('/employees'),
  create: (data: Partial<Employee> & { employee_code?: string; employee_name?: string }) =>
    api.post('/employees', mapEmployeePayload(data)).then((res) => res.data),
  update: (id: number, data: Partial<Employee>) =>
    api.put(`/employees/${id}`, mapEmployeePayload(data)).then((res) => res.data),
  delete: (id: number) => api.delete(`/employees/${id}`),
  getAssignments: (employeeId: number) =>
    api.get<EmployeeTeamRole[]>(`/employees/${employeeId}/assignments`).then((res) => res.data),
  getReporting: (employeeId: number) =>
    api.get<{ leaderIds: number[]; directReportIds: number[] }>(`/employees/${employeeId}/reporting`).then((res) => res.data),
  updateReporting: (employeeId: number, data: { directReportIds: number[] }) =>
    api.put(`/employees/${employeeId}/reporting`, data).then((res) => res.data),
};

export const qualificationApi = {
  getAll: () => api.get<Qualification[]>('/qualifications'),
  create: (data: Qualification) => api.post<Qualification>('/qualifications', data),
  update: (id: number, data: Qualification) => api.put<Qualification>(`/qualifications/${id}`, data),
  delete: (id: number) => api.delete(`/qualifications/${id}`)
};

export const employeeQualificationApi = {
  getAll: () => api.get<EmployeeQualification[]>('/employee-qualifications'),
  getByEmployeeId: (employeeId: number) => api.get<EmployeeQualification[]>(`/employee-qualifications/employee/${employeeId}`),
  create: (data: EmployeeQualification) => api.post<EmployeeQualification>('/employee-qualifications', data),
  update: (id: number, data: EmployeeQualification) => api.put<EmployeeQualification>(`/employee-qualifications/${id}`, data),
  delete: (id: number) => api.delete(`/employee-qualifications/${id}`)
};

export const operationApi = {
  getAll: () => api.get<Operation[]>('/operations'),
  create: (data: Operation) => api.post<Operation>('/operations', data),
  update: (id: number, data: Operation) => api.put<Operation>(`/operations/${id}`, data),
  delete: (id: number) => api.delete(`/operations/${id}`)
};

export const operationQualificationRequirementApi = {
  getAll: () => api.get<OperationQualificationRequirement[]>('/operation-qualification-requirements'),
  create: (data: OperationQualificationRequirement) => api.post<OperationQualificationRequirement>('/operation-qualification-requirements', data),
  update: (id: number, data: OperationQualificationRequirement) => api.put<OperationQualificationRequirement>(`/operation-qualification-requirements/${id}`, data),
  delete: (id: number) => api.delete(`/operation-qualification-requirements/${id}`)
};

export const processTemplateApi = {
  getAll: () => api.get<ProcessTemplate[]>('/process-templates'),
  create: (data: ProcessTemplate) => api.post<ProcessTemplate>('/process-templates', data),
  update: (id: number, data: ProcessTemplate) => api.put<ProcessTemplate>(`/process-templates/${id}`, data),
  delete: (id: number) => api.delete(`/process-templates/${id}`)
};

export const processStageApi = {
  getAll: () => api.get<ProcessStage[]>('/process-stages'),
  create: (data: ProcessStage) => api.post<ProcessStage>('/process-stages', data),
  update: (id: number, data: ProcessStage) => api.put<ProcessStage>(`/process-stages/${id}`, data),
  delete: (id: number) => api.delete(`/process-stages/${id}`)
};

export const stageOperationScheduleApi = {
  getAll: () => api.get<StageOperationSchedule[]>('/stage-operation-schedules'),
  create: (data: StageOperationSchedule) => api.post<StageOperationSchedule>('/stage-operation-schedules', data),
  update: (id: number, data: StageOperationSchedule) => api.put<StageOperationSchedule>(`/stage-operation-schedules/${id}`, data),
  delete: (id: number) => api.delete(`/stage-operation-schedules/${id}`)
};

export const operationConstraintApi = {
  getAll: () => api.get<OperationConstraint[]>('/operation-constraints'),
  create: (data: OperationConstraint) => api.post<OperationConstraint>('/operation-constraints', data),
  update: (id: number, data: OperationConstraint) => api.put<OperationConstraint>(`/operation-constraints/${id}`, data),
  delete: (id: number) => api.delete(`/operation-constraints/${id}`),
  validateTemplate: (templateId: number) => api.get<ConstraintValidationResult>(`/constraints/template/${templateId}/validate`)
};

type BatchPlanPayload = {
  batch_code: string;
  batch_name: string;
  template_id: number;
  project_code?: string | null;
  planned_start_date: string;
  plan_status?: BatchPlan['plan_status'];
  description?: string | null;
  notes?: string | null;
};

export const batchPlanApi = {
  list: () => api.get<any>('/batch-plans').then((res) => (res.data.data ? res.data.data : res.data)),
  getTemplates: () => api.get<BatchTemplateSummary[]>('/batch-plans/templates').then((res) => res.data),
  getStatistics: () => api.get<BatchStatistics>('/batch-plans/statistics').then((res) => res.data),
  create: (payload: BatchPlanPayload) => api.post<BatchPlan>('/batch-plans', payload).then((res) => res.data),
  update: (id: number, payload: BatchPlanPayload) =>
    api.put<BatchPlan>(`/batch-plans/${id}`, payload).then((res) => res.data),
  remove: (id: number, options?: { force?: boolean }) =>
    api
      .delete(`/batch-plans/${id}`, {
        params: options?.force ? { force: true } : undefined,
      })
      .then((res) => res.data),
  activate: (id: number, options?: { color?: string }) =>
    api.post(`/batch-plans/${id}/activate`, options).then((res) => res.data),
  deactivate: (id: number) =>
    api.post(`/batch-plans/${id}/deactivate`).then((res) => res.data),
  // 新增：获取模版的day0偏移量
  getTemplateDay0Offset: (templateId: number) =>
    api.get<{ offset: number; min_day: number; has_pre_day0: boolean; pre_day0_count: number }>(
      `/batch-plans/templates/${templateId}/day0-offset`
    ).then((res) => res.data),
  // 新增：批量创建批次
  createBulk: (payload: {
    template_id: number;
    day0_start_date: string;
    day0_end_date: string;
    interval_days: number;
    batch_prefix: string;
    start_number: number;
    description?: string | null;
    notes?: string | null;
  }) => api.post<{ message: string; batches: any[] }>('/batch-plans/bulk', payload).then((res) => res.data),
};

export const shiftTypeApi = {
  getAll: () => api.get<ShiftType[]>('/shift-types').then((res) => res.data)
};

export const shiftDefinitionApi = {
  getAll: (options?: { includeInactive?: boolean }) =>
    api
      .get<ShiftDefinition[]>('/shift-definitions', {
        params: options?.includeInactive ? { includeInactive: true } : undefined,
      })
      .then((res) => res.data),
  create: (data: Omit<ShiftDefinition, 'id' | 'created_at' | 'updated_at'>) =>
    api.post<ShiftDefinition>('/shift-definitions', data).then((res) => res.data),
  update: (id: number, data: Partial<ShiftDefinition>) =>
    api.put(`/shift-definitions/${id}`, data).then((res) => res.data),
  remove: (id: number) => api.delete(`/shift-definitions/${id}`).then((res) => res.data),
};

export const organizationApi = {
  getDepartments: () => api.get<Department[]>('/organization/departments').then((res) => res.data),
  createDepartment: (data: Partial<Department>) => api.post('/organization/departments', data).then((res) => res.data),
  updateDepartment: (id: number, data: Partial<Department>) => api.put(`/organization/departments/${id}`, data).then((res) => res.data),
  deleteDepartment: (id: number) => api.delete(`/organization/departments/${id}`).then((res) => res.data),

  getTeams: () => api.get<Team[]>('/organization/teams').then((res) => res.data),
  createTeam: (data: Partial<Team>) => api.post('/organization/teams', data).then((res) => res.data),
  updateTeam: (id: number, data: Partial<Team>) => api.put(`/organization/teams/${id}`, data).then((res) => res.data),
  deleteTeam: (id: number) => api.delete(`/organization/teams/${id}`).then((res) => res.data),

  getRoles: () => api.get<EmployeeRole[]>('/organization/roles').then((res) => res.data),
  createRole: (data: Partial<EmployeeRole>) => api.post('/organization/roles', data).then((res) => res.data),
  updateRole: (id: number, data: Partial<EmployeeRole>) => api.put(`/organization/roles/${id}`, data).then((res) => res.data),
  deleteRole: (id: number) => api.delete(`/organization/roles/${id}`).then((res) => res.data),

  getAssignments: (params?: { employeeId?: number; teamId?: number }) =>
    api.get<EmployeeTeamRole[]>('/organization/assignments', { params }).then((res) => res.data),
  createAssignment: (data: {
    employeeId: number;
    teamId: number;
    roleId: number;
    isPrimary?: boolean;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  }) => api.post('/organization/assignments', data).then((res) => res.data),
  updateAssignment: (id: number, data: Partial<EmployeeTeamRole>) =>
    api.put(`/organization/assignments/${id}`, data).then((res) => res.data),
  deleteAssignment: (id: number) => api.delete(`/organization/assignments/${id}`).then((res) => res.data),

  getUnavailability: (params?: { employeeId?: number; from?: string; to?: string }) =>
    api.get<EmployeeUnavailability[]>('/organization/unavailability', { params }).then((res) => res.data),
  createUnavailability: (data: {
    employeeId: number;
    startDatetime: string;
    endDatetime: string;
    reasonCode: string;
    reasonLabel: string;
    category?: string;
    notes?: string;
  }) => api.post('/organization/unavailability', data).then((res) => res.data),
  updateUnavailability: (id: number, data: Partial<EmployeeUnavailability>) =>
    api.put(`/organization/unavailability/${id}`, data).then((res) => res.data),
  deleteUnavailability: (id: number) => api.delete(`/organization/unavailability/${id}`).then((res) => res.data)
};

export const organizationStructureApi = {
  getTree: () => api.get<OrgHierarchyResponse>('/org-structure/tree').then((res) => res.data)
};

export const organizationEmployeeApi = {
  getContext: (employeeId: number) =>
    api.get<EmployeeOrgContext>(`/employees/${employeeId}/organization-context`).then((res) => res.data)
};

export const systemMonitorApi = {
  getHolidayStatus: () => api.get<HolidayServiceStatus>('/system/holiday/status').then((res) => res.data),
  updateHolidayKey: (payload: { apiKey: string }) =>
    api.patch<{ keyConfigured: boolean; maskedKey: string | null }>('/system/holiday/key', payload).then((res) => res.data),
  importHolidayYear: (payload: { year: number }) =>
    api.post('/system/holiday/import', payload).then((res) => res.data),
};

export const systemSettingsApi = {
  getHolidayStatus: () => api.get<HolidayServiceStatus>('/system/holiday/status').then((res) => res.data),
  updateHolidayKey: (payload: { apiKey: string }) =>
    api.patch<{ keyConfigured: boolean; maskedKey: string | null }>('/system/holiday/key', payload).then((res) => res.data),
  importHolidayYear: (payload: { year: number }) =>
    api.post('/system/holiday/import', payload).then((res) => res.data),
  getSchedulingSettings: () => api.get<SchedulingSettings>('/system/scheduling/settings').then((res) => res.data),
  updateSchedulingSettings: (data: SchedulingSettings) =>
    api.put<SchedulingSettings>('/system/scheduling/settings', data).then((res) => res.data),

  // DB Config
  getDbConfig: () => api.get<{ mode: 'cloud' | 'local'; host: string }>('/system/db-config').then((res) => res.data),
  updateDbConfig: (mode: 'cloud' | 'local') => api.post('/system/db-config', { mode }).then((res) => res.data),
  syncDb: (payload: { direction: 'up' | 'down'; force?: boolean }) =>
    api.post<{ message: string; error?: string; sourceTime?: string; targetTime?: string }>('/system/sync-db', payload).then((res) => res.data),
};

// Database Backup API
export interface BackupInfo {
  filename: string;
  filepath: string;
  size: number;
  sizeFormatted: string;
  createdAt: string;
}

export interface BackupStatusResponse {
  hasBackup: boolean;
  latestBackup: BackupInfo | null;
  backupDir: string;
  totalBackups?: number;
}

export interface BackupListResponse {
  backups: BackupInfo[];
  total: number;
  backupDir: string;
}

export interface BackupExportResponse {
  success: boolean;
  message: string;
  backup: BackupInfo;
}

export const databaseApi = {
  exportDatabase: () => api.post<BackupExportResponse>('/database/export').then((res) => res.data),
  getBackupStatus: () => api.get<BackupStatusResponse>('/database/status').then((res) => res.data),
  listBackups: () => api.get<BackupListResponse>('/database/list').then((res) => res.data),
  deleteBackup: (filename: string) => api.delete(`/database/backup/${filename}`).then((res) => res.data),
};

export const calendarApi = {
  getActiveOperations: () => api.get('/calendar/operations/active').then((res) => res.data),
  getOperationDetail: (operationPlanId: number) =>
    api.get(`/calendar/operations/${operationPlanId}`).then((res) => res.data),
  getWorkdayRange: (startDate: string, endDate: string) =>
    api
      .get('/calendar/workdays', {
        params: {
          start_date: startDate,
          end_date: endDate,
        },
      })
      .then((res) => res.data),
};

const solverClient = axios.create({
  baseURL: '/solver-api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const solverApi = {
  solve: (payload: any) => solverClient.post('/solve', payload).then((res) => res.data),
};

// Scheduling Run API - 排班任务管理
export interface CreateSchedulingRunPayload {
  periodStart: string;
  periodEnd: string;
  batchIds: number[];
  options?: Record<string, any>;
  triggerType?: 'AUTO_PLAN' | 'RETRY' | 'MANUAL';
}

export interface SchedulingRunCreateResponse {
  runId: number;
  runKey: string;
  message: string;
}

export interface SchedulingRunSolveResponse {
  runId: number;
  status: string;
  summary: string;
  assignmentsCount: number;
  shiftPlansCount: number;
  skippedCount: number;
}

export interface SchedulingRunApplyResponse {
  runId: number;
  message: string;
  assignmentsInserted: number;
  shiftPlansInserted: number;
  warnings: string[];
}

export const schedulingRunApi = {
  // 创建排班任务
  create: (payload: CreateSchedulingRunPayload): Promise<SchedulingRunCreateResponse> =>
    api.post('/scheduling-runs', payload).then((res) => res.data),

  // 获取排班任务详情
  getById: (runId: number) =>
    api.get(`/scheduling-runs/${runId}`).then((res) => res.data),

  // 触发求解
  solve: (runId: number, solverPayload: any): Promise<SchedulingRunSolveResponse> =>
    api.post(`/scheduling-runs/${runId}/solve`, solverPayload).then((res) => res.data),

  // 获取排班结果
  getResult: (runId: number) =>
    api.get(`/scheduling-runs/${runId}/result`).then((res) => res.data),

  // 应用排班结果到生产表
  apply: (runId: number): Promise<SchedulingRunApplyResponse> =>
    api.post(`/scheduling-runs/${runId}/apply`).then((res) => res.data),

  // 获取排班任务列表
  list: (limit?: number) =>
    api.get('/scheduling-runs', { params: limit ? { limit } : undefined }).then((res) => res.data),

  // 获取排班任务事件
  getEvents: (runId: number) =>
    api.get(`/scheduling-runs/${runId}/events`).then((res) => res.data),
};
