import axios from 'axios';

export type WorkbenchDataMode = 'LIVE_READONLY' | 'MIXED_DATA' | 'DATA_GAP';
export type WorkbenchSourceStatus = 'LIVE_READONLY' | 'MIXED_DATA' | 'DATA_GAP' | 'NOT_IMPLEMENTED';

export interface WorkbenchDataGap {
  code: string;
  message: string;
  affectsBusinessCredibility: boolean;
}

export interface WorkbenchDataSourceAuditItem {
  key: string;
  label: string;
  status: WorkbenchSourceStatus;
  currentSource: string;
  targetSource: string;
  gap: string | null;
  affectsBusinessCredibility: boolean;
}

export interface WorkbenchLiveBatch {
  id: number;
  batchCode: string;
  batchName: string;
  batchStatus: string;
  planningStatus: string | null;
  templateId: number;
  templateCode: string | null;
  templateName: string | null;
  templateDomain: 'USP' | 'DSP' | 'UNKNOWN';
  plannedStart: string | null;
  plannedEnd: string | null;
  templateDurationDays: number;
  operationCount: number;
  totalRequiredPeople: number;
  assignedPeopleCount: number;
  color: string | null;
}

export interface WorkbenchLiveTemplateOperation {
  templateOperationId: number;
  operationId: number;
  operationCode: string | null;
  operationName: string;
  stageId: number;
  stageName: string;
  stageOrder: number;
  sequence: number;
  offsetHours: number;
  durationHours: number;
  requiredPeople: number;
  qualificationRequirementCount: number;
}

export interface WorkbenchLiveTemplate {
  id: number;
  templateCode: string;
  templateName: string;
  domain: 'USP' | 'DSP' | 'UNKNOWN';
  teamCode: string | null;
  teamName: string | null;
  totalDays: number;
  stageCount: number;
  operationCount: number;
  sourceLabel: string;
  operations: WorkbenchLiveTemplateOperation[];
}

export interface WorkbenchLiveAssignment {
  id: number;
  positionNumber: number;
  employeeId: number;
  employeeCode: string | null;
  employeeName: string;
  role: string | null;
  status: string;
  isPrimary: boolean;
  isLocked: boolean;
  shiftPlanId: number | null;
  shiftCode: string | null;
  shiftName: string | null;
  planDate: string | null;
  planCategory: string | null;
  planState: string | null;
}

export interface WorkbenchLiveQualificationRequirement {
  positionNumber: number;
  qualificationId: number;
  qualificationName: string;
  requiredLevel: number;
  requiredCount: number;
  isMandatory: boolean;
}

export interface WorkbenchLiveOperation {
  id: string;
  operationPlanId: number;
  batchId: number;
  batchCode: string;
  templateId: number;
  templateCode: string | null;
  templateName: string | null;
  source: 'USP' | 'DSP' | 'UNKNOWN';
  templateScheduleId: number | null;
  operationId: number;
  operationCode: string | null;
  operationName: string;
  stageId: number | null;
  stageName: string;
  stageOrder: number;
  sequence: number;
  originalStart: string | null;
  originalEnd: string | null;
  previewStart: string | null;
  previewEnd: string | null;
  durationHours: number;
  requiredPeople: number;
  assignedPeople: number;
  currentAssignments: string[];
  assignments: WorkbenchLiveAssignment[];
  qualificationRequirements: WorkbenchLiveQualificationRequirement[];
  qualificationRequirementCount: number;
  locked: boolean;
  movedHours: number;
  dataGapWarnings: string[];
}

export interface WorkbenchWorkforceSummary {
  activeEmployeeCount: number;
  employeeQualificationCount: number;
  activeShiftDefinitionCount: number;
  shiftPlanCount: number;
  windowStart: string;
  windowEnd: string;
}

export interface WorkbenchLiveContextResponse {
  success: boolean;
  previewOnly: boolean;
  dataMode: WorkbenchDataMode;
  batches: WorkbenchLiveBatch[];
  selectedBatchId: number | null;
  defaultUpstreamTemplateId: number | null;
  defaultDownstreamTemplateId: number | null;
  templates: WorkbenchLiveTemplate[];
  batchOperations: WorkbenchLiveOperation[];
  workforceSummary: WorkbenchWorkforceSummary;
  dataGaps: WorkbenchDataGap[];
  dataSourceAudit: WorkbenchDataSourceAuditItem[];
  error?: string;
}

export interface WorkbenchTimeOverridePayload {
  operation_plan_id: number;
  planned_start: string;
  planned_end: string;
}

export interface WorkbenchSolverPreviewPayload {
  start_date: string;
  end_date: string;
  batch_ids: number[];
  time_overrides: WorkbenchTimeOverridePayload[];
  affected_operation_plan_ids: number[];
  solve_range?: {
    start_date: string;
    end_date: string;
  };
  config?: Record<string, unknown>;
}

export interface WorkbenchSolverPreviewResponse {
  success: boolean;
  preview_only: boolean;
  data?: {
    mode: string;
    request_id: string;
    applied_time_override_count: number;
    affected_operation_plan_ids: number[];
    solve_range?: {
      start_date: string;
      end_date: string;
    };
    proposal: {
      status: string;
      total_positions: number;
      assigned_positions: number;
      vacant_positions: number;
      affected_operation_count: number;
      affected_assignment_count: number;
      fill_rate: number | null;
      scheduled_shift_count: number | null;
      assignments: Array<{
        operation_plan_id: number;
        position_number: number;
        employee_id: number;
        planned_start: string;
        planned_end: string;
      }>;
      unassigned_jobs: unknown[];
    };
    solver_result: unknown;
  };
  capability_gap?: {
    code: string;
    message: string;
    detail?: string;
  };
  error?: string;
}

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const batchWorkbenchV2Api = {
  getLiveContext: async (batchId?: number): Promise<WorkbenchLiveContextResponse> => {
    const response = await client.get('/batch-workbench-v2/context', {
      params: batchId ? { batch_id: batchId } : undefined,
    });
    return response.data;
  },
  previewProposal: async (payload: WorkbenchSolverPreviewPayload): Promise<WorkbenchSolverPreviewResponse> => {
    const response = await client.post('/v4/scheduling/preview-proposal', payload);
    return response.data;
  },
};
