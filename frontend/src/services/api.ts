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
  ComputeSchedulingMetricsPayload,
  SchedulingMetricsSnapshot,
  Department,
  Team,
  EmployeeRole,
  EmployeeTeamRole,
  EmployeeUnavailability,
  ShiftType,
  OrgHierarchyResponse,
  EmployeeOrgContext,
  ShiftDefinition
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

export const schedulingMetricsApi = {
  compute: (payload: ComputeSchedulingMetricsPayload) =>
    api.post<SchedulingMetricsSnapshot>('/scheduling/metrics/compute', payload).then((res) => res.data),
  getSnapshot: (snapshotId: number) =>
    api.get<SchedulingMetricsSnapshot>(`/scheduling/metrics/${snapshotId}`).then((res) => res.data),
  listHistory: (limit = 20) =>
    api.get<SchedulingMetricsSnapshot[]>(`/scheduling/metrics/history`, {
      params: { limit }
    })
      .then((res) => res.data)
};

export const schedulingRunApi = {
  list: (limit = 20) =>
    api.get(`/scheduling/runs`, { params: { limit } }).then((res) => res.data),
  get: (runId: number) =>
    api.get(`/scheduling/runs/${runId}`).then((res) => res.data),
  events: (runId: number, sinceId?: number, limit?: number) =>
    api.get(`/scheduling/runs/${runId}/events`, {
      params: {
        sinceId,
        limit,
      },
    }).then((res) => res.data),
  publish: (runId: number) =>
    api.post(`/scheduling/runs/${runId}/publish`).then((res) => res.data),
  rollback: (runId: number) =>
    api.post(`/scheduling/runs/${runId}/rollback`).then((res) => res.data),
  retryOperation: (operationPlanId: number) =>
    api.post(`/scheduling/auto-plan/retry/${operationPlanId}`).then((res) => res.data),
  exportGaps: (runId: number) =>
    api.get(`/scheduling/gaps/export`, {
      params: { runId },
      responseType: 'blob'
    })
      .then((res) => res.data)
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

// ML智能排班v3 API
export const mlSchedulingApi = {
  // 智能排班v3
  autoPlanV3: (payload: {
    batchIds: number[];
    startDate?: string;
    endDate?: string;
    options?: {
      dryRun?: boolean;
      allowedOrgRoles?: string[];
    };
  }) =>
    api.post('/scheduling/auto-plan/v3', payload).then((res) => res.data),

  // 智能排班v4
  autoPlanV4: (payload: {
    batchIds: number[];
    startDate?: string;
    endDate?: string;
    options?: {
      dryRun?: boolean;
      allowedOrgRoles?: string[];
      adaptiveParams?: boolean;
      earlyStop?: boolean;
      monthHourTolerance?: number;
    };
  }) =>
    api.post('/scheduling/auto-plan/v4', payload).then((res) => res.data),

  // 预测工作负载
  predictWorkload: (payload: {
    startDate: string;
    endDate: string;
  }) =>
    api.post('/scheduling/ml/predict-workload', payload).then((res) => res.data),

  // 评估排班质量
  evaluateSchedule: (payload: {
    schedules: Array<{
      employeeId: number;
      date: string;
      shiftCode?: string;
      planHours: number;
      overtimeHours: number;
      operationPlanId?: number;
      operationId?: number;
    }>;
    period: {
      startDate: string;
      endDate: string;
      quarter?: string;
    };
  }) =>
    api.post('/scheduling/ml/evaluate', payload).then((res) => res.data),

  // 检查综合工时制约束
  checkComprehensiveConstraints: (payload: {
    employeeId: number;
    schedules: Array<{
      date: string;
      planHours: number;
      overtimeHours: number;
    }>;
    period: 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
  }) =>
    api.post('/scheduling/comprehensive-work-time/check', payload).then((res) => res.data),
};
