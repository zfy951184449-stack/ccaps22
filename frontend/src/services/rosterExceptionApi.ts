import axios from 'axios';

export type RosterExceptionType = 'EMPLOYEE_UNAVAILABLE';
export type ReplacementRecommendationLevel = 'RECOMMENDED' | 'POSSIBLE' | 'RISKY';
export type RosterRepairMode = 'MINIMAL_CHANGE' | 'MAX_COVERAGE';
export type RosterExceptionPreviewMode = 'IMPACT_ONLY' | 'SOLVER_REPAIR';
export type SolverRepairProposalStatus =
  | 'IMPACT_ONLY'
  | 'NO_IMPACT'
  | 'READY'
  | 'PARTIAL'
  | 'UNCOVERED'
  | 'DATA_GAP'
  | 'SOLVER_UNAVAILABLE'
  | 'SOLVER_FAILED'
  | 'INFEASIBLE';

export interface RosterExceptionPreviewRequest {
  exceptionType: RosterExceptionType;
  employeeId?: number;
  employeeIds?: number[];
  windowStart: string;
  windowEnd: string;
  reasonCode?: string;
  repairMode: RosterRepairMode;
  previewMode?: RosterExceptionPreviewMode;
  protectLockedAssignments: boolean;
  protectDepartmentBoundary: boolean;
  allowOvertimeSuggestions: boolean;
  previewOnly: true;
}

export interface RosterExceptionEmployeeDto {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentId: number | null;
  departmentName: string | null;
}

export interface ImpactedShiftPlanDto {
  shiftPlanId: number;
  employeeId: number;
  planDate: string;
  shiftCode: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  planState: string;
  isLocked: boolean;
}

export interface ImpactedAssignmentDto {
  assignmentId: number;
  batchOperationPlanId: number;
  batchCode: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  role: string;
  positionNumber: number;
  isLocked: boolean;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentId: number | null;
  departmentName: string | null;
  shiftPlanId: number | null;
}

export interface RosterVacancyDto {
  vacancyId: string;
  batchOperationPlanId: number;
  batchCode: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  role: string;
  positionNumber: number;
  requiredQualificationIds: number[];
  requiredQualificationNames: string[];
  hardToCoverReason?: string;
}

export interface ReplacementCandidateDto {
  vacancyId: string;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  departmentId: number | null;
  departmentName: string | null;
  sameDepartment: boolean;
  qualificationMatch: boolean;
  qualificationLevelSummary: string;
  sameShift: boolean;
  hasTimeConflict: boolean;
  hasUnavailabilityConflict: boolean;
  currentAssignmentCountInWindow: number;
  score: number;
  recommendationLevel: ReplacementRecommendationLevel;
  warnings: string[];
}

export interface RosterExceptionPreviewResponse {
  exceptionId: string;
  previewOnly: true;
  employee: RosterExceptionEmployeeDto;
  employees: RosterExceptionEmployeeDto[];
  windowStart: string;
  windowEnd: string;
  repairMode: RosterRepairMode;
  protectLockedAssignments: boolean;
  protectDepartmentBoundary: boolean;
  allowOvertimeSuggestions: boolean;
  impactedShiftPlans: ImpactedShiftPlanDto[];
  impactedAssignments: ImpactedAssignmentDto[];
  vacancies: RosterVacancyDto[];
  replacementCandidates: ReplacementCandidateDto[];
  uncoveredVacancies: RosterVacancyDto[];
  solverRepairProposal: SolverRepairProposalDto;
  summary: {
    impactedAssignmentCount: number;
    impactedShiftPlanCount: number;
    vacancyCount: number;
    coveredByCandidateCount: number;
    uncoveredCount: number;
    solverChangedAssignmentCount: number;
    solverUncoveredCount: number;
    overtimeRiskCount: number;
    timeConflictCount: number;
    requiresSolverRerun: boolean;
    requiresSupervisorAction: boolean;
  };
  warnings: string[];
}

export interface SolverRepairAssignmentChangeDto {
  changeId: string;
  assignmentId: number;
  batchOperationPlanId: number;
  batchCode: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  role: string;
  positionNumber: number;
  originalEmployeeId: number;
  originalEmployeeCode: string;
  originalEmployeeName: string;
  originalDepartmentId: number | null;
  originalDepartmentName: string | null;
  proposedEmployeeId: number;
  proposedEmployeeCode: string;
  proposedEmployeeName: string;
  proposedDepartmentId: number | null;
  proposedDepartmentName: string | null;
  sameDepartment: boolean;
  requiredQualificationNames: string[];
  proposedEmployeeHasQualification: boolean;
  proposedEmployeeOnShift: boolean;
  proposedShiftPlanId: number | null;
  proposedShiftCode: string | null;
  hasTimeConflict: boolean;
  hasOvertimeRisk: boolean;
  changeReason: string;
  canApply: boolean;
  applyBlockReason?: string;
}

export interface SolverRepairUncoveredVacancyDto {
  vacancyId: string;
  assignmentId?: number;
  batchOperationPlanId: number;
  batchCode: string;
  operationName: string;
  plannedStart: string;
  plannedEnd: string;
  role: string;
  positionNumber: number;
  requiredQualificationNames: string[];
  reason: string;
}

export interface SolverCapabilityGapDto {
  code: string;
  message: string;
  detail?: string;
}

export interface SolverRepairProposalDto {
  proposalId: string;
  previewOnly: true;
  status: SolverRepairProposalStatus;
  repairMode: RosterRepairMode;
  coverageRate: number;
  originalAssignmentStillValidCount: number;
  changedAssignmentCount: number;
  uncoveredVacancyCount: number;
  overtimeRiskCount: number;
  timeConflictCount: number;
  solverRequestId: string | null;
  solverStatus: string | null;
  solverInvocation: {
    called: boolean;
    endpoint: string;
    mode: 'solver_v4_preview_adapter';
  };
  localRepairStrategy: string;
  assignmentChanges: SolverRepairAssignmentChangeDto[];
  uncoveredVacancies: SolverRepairUncoveredVacancyDto[];
  supervisorAttentionItems: string[];
  capabilityGaps: SolverCapabilityGapDto[];
  applyAllowed: boolean;
  applyDisabledReason?: string;
}

export interface RosterExceptionApplyResponse {
  applied: boolean;
  appliedCount: number;
  skippedCount: number;
  selectedChangeIds: string[];
  appliedChanges: Array<{
    changeId: string;
    assignmentId: number;
    before: { employeeId: number | null; shiftPlanId: number | null };
    after: { employeeId: number | null; shiftPlanId: number | null };
  }>;
  skippedChanges: Array<{ changeId: string; reason: string }>;
  writeBoundary: {
    wrote: string[];
    didNotWrite: string[];
  };
  loggingCapabilityGap: string;
}

const client = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

const PREVIEW_TIMEOUT_MS: Record<RosterExceptionPreviewMode, number> = {
  IMPACT_ONLY: 15_000,
  SOLVER_REPAIR: 90_000,
};

interface RosterExceptionPreviewOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const rosterExceptionApi = {
  previewEmployeeUnavailable: (
    request: RosterExceptionPreviewRequest,
    options?: RosterExceptionPreviewOptions,
  ) =>
    client
      .post<RosterExceptionPreviewResponse>('/roster-exceptions/preview', request, {
        signal: options?.signal,
        timeout: options?.timeoutMs ?? PREVIEW_TIMEOUT_MS[request.previewMode ?? 'SOLVER_REPAIR'],
      })
      .then((res) => res.data),
  applySelectedProposal: (
    proposal: RosterExceptionPreviewResponse,
    selectedChangeIds: string[],
    reasonCode?: string,
  ) =>
    client
      .post<RosterExceptionApplyResponse>('/roster-exceptions/apply-proposal', {
        proposal,
        selectedChangeIds,
        supervisorConfirmation: true,
        reasonCode,
      })
      .then((res) => res.data),
};
