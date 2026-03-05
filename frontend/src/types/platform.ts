export type DepartmentCode = 'USP' | 'DSP' | 'SPI' | 'MAINT';
export type ResourceType = 'ROOM' | 'EQUIPMENT' | 'VESSEL_CONTAINER' | 'TOOLING' | 'STERILIZATION_RESOURCE';
export type ResourceStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';
export type ResourceCalendarEventType = 'OCCUPIED' | 'MAINTENANCE' | 'CHANGEOVER' | 'LOCKED' | 'UNAVAILABLE';
export type ResourceCalendarSourceType = 'SCHEDULING' | 'MANUAL' | 'MAINTENANCE';
export type MaintenanceWindowType = 'PM' | 'BREAKDOWN' | 'CALIBRATION' | 'CLEANING';
export type ConflictType =
  | 'RESOURCE_CONFLICT'
  | 'PERSONNEL_CONFLICT'
  | 'MAINTENANCE_BLOCK'
  | 'SHIFT_CONFLICT'
  | 'QUALIFICATION_GAP'
  | 'CROSS_DOMAIN_DEPENDENCY_RISK'
  | 'MISSING_MASTER_DATA';

export interface ResourceStats {
  calendarCount: number;
  maintenanceCount: number;
  assignmentCount: number;
}

export interface Resource {
  id: number;
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  departmentCode: DepartmentCode;
  ownerOrgUnitId: number | null;
  ownerUnitName?: string | null;
  ownerUnitCode?: string | null;
  status: ResourceStatus;
  capacity: number;
  location: string | null;
  cleanLevel: string | null;
  isShared: boolean;
  isSchedulable: boolean;
  metadata: Record<string, unknown> | null;
  stats?: ResourceStats;
}

export interface ResourceCalendarEntry {
  id: number;
  resourceId: number;
  startDatetime: string;
  endDatetime: string;
  eventType: ResourceCalendarEventType;
  sourceType: ResourceCalendarSourceType;
  sourceId: number | null;
  notes: string | null;
}

export interface OperationResourceRequirement {
  id: number;
  operationId: number;
  operationCode?: string;
  operationName?: string;
  resourceType: ResourceType;
  requiredCount: number;
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
  candidateResourceIds: number[];
  candidateResources: Array<Pick<Resource, 'id' | 'resourceCode' | 'resourceName' | 'resourceType'>>;
}

export interface MaintenanceWindow {
  id: number;
  resourceId: number;
  resourceName?: string;
  resourceCode?: string;
  departmentCode?: DepartmentCode;
  windowType: MaintenanceWindowType;
  startDatetime: string;
  endDatetime: string;
  isHardBlock: boolean;
  ownerDeptCode: 'MAINT';
  notes: string | null;
}

export interface PlatformDepartmentSummary {
  departmentCode: string;
  resourceCount: number;
}

export interface PlatformRunSummary {
  id: number;
  runCode: string;
  status: string;
  stage: string;
  createdAt: string;
  completedAt: string | null;
  solverStatus?: string | null;
  fillRate?: number | null;
  solveTime?: number | null;
}

export interface PlatformReadinessSummary {
  domainCode: DepartmentCode;
  projectCount: number;
  resourceCount: number;
  resourceRequirementCoverage: number;
  candidateBindingCoverage: number;
  conflictCount: number;
  maintenanceBlockCount: number;
  readinessStatus: 'READY' | 'AT_RISK' | 'MODELING_GAP' | 'NOT_READY';
}

export interface PlatformRiskItem {
  id: string;
  label: string;
  sublabel?: string;
  domainCode?: string | null;
  metric: number;
  metricLabel: string;
}

export interface PlatformOverview {
  projectCount: number;
  activeBatchCount: number;
  resourceCount: number;
  resourceConflictCount: number;
  personnelConflictCount: number;
  maintenanceBlockCount: number;
  missingMasterDataCount: number;
  ruleCoverageRate: number;
  departments: PlatformDepartmentSummary[];
  recentRuns: PlatformRunSummary[];
  readiness: PlatformReadinessSummary[];
  topResources: PlatformRiskItem[];
  topProjects: PlatformRiskItem[];
  warnings: string[];
}

export interface PlatformProject {
  id: string;
  projectCode: string;
  projectName: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  batchCount: number;
  activatedBatchCount: number;
  teamCount: number;
  departmentCodes: string[];
  missingResourceRequirementCount: number;
}

export interface PlatformProjectBatch {
  id: number;
  batchCode: string;
  batchName: string;
  planStatus: string;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  templateName?: string | null;
  teamCode?: string | null;
  teamName?: string | null;
}

export interface PlatformProjectDetail {
  project: PlatformProject;
  batches: PlatformProjectBatch[];
  operationsSummary: {
    totalOperations: number;
    missingResourceRequirementCount: number;
  };
}

export interface PlatformConflict {
  id: string;
  conflictType: ConflictType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  title: string;
  departmentCode?: string | null;
  projectCode?: string | null;
  resourceName?: string | null;
  resourceId?: number | null;
  employeeName?: string | null;
  windowStart: string;
  windowEnd: string;
  details: string;
}

export interface PlatformConflictRecommendedRoute {
  key: string;
  path: string;
  label: string;
}

export interface PlatformConflictDetail extends PlatformConflict {
  relatedProjects: Array<{ projectCode: string }>;
  relatedBatches: Array<{ id: number; batchCode: string; batchName: string }>;
  relatedOperations: Array<{ id: number; operationId: number; operationCode: string; operationName: string }>;
  relatedResources: Array<{ id: number; resourceCode: string; resourceName: string }>;
  relatedMaintenanceWindows: Array<{ id: number; windowType: string; notes?: string | null }>;
  recommendedRoutes: PlatformConflictRecommendedRoute[];
}

export interface PlatformTimelineLane {
  id: string;
  label: string;
  groupLabel?: string | null;
  domainCode?: string | null;
  laneType?: string | null;
}

export interface PlatformTimelineItem {
  id: string;
  laneId: string;
  itemType: string;
  title: string;
  subtitle?: string | null;
  startDatetime: string;
  endDatetime: string;
  color: string;
  status?: string | null;
  domainCode?: string | null;
  isConflicted?: boolean;
  maintenanceBlocked?: boolean;
  resourceConflicted?: boolean;
  metadata?: Record<string, unknown>;
}

export interface PlatformTimelineDependency {
  id: number;
  fromItemId: string;
  toItemId: string;
  type: string;
  label?: string | null;
}

export interface PlatformProjectTimelineResponse {
  project: {
    id: string;
    projectCode: string;
    projectName: string;
    plannedStartDate: string | null;
    plannedEndDate: string | null;
  };
  lanes: PlatformTimelineLane[];
  items: PlatformTimelineItem[];
  dependencies: PlatformTimelineDependency[];
  conflicts: PlatformConflict[];
  windowStart: string;
  windowEnd: string;
}

export interface PlatformResourceTimelineResponse {
  resources: Resource[];
  lanes: PlatformTimelineLane[];
  items: PlatformTimelineItem[];
  conflicts: PlatformConflict[];
  windowStart: string;
  windowEnd: string;
}

export interface PlatformMaintenanceImpact {
  affectedProjects: Array<{ projectCode: string }>;
  affectedBatches: Array<{ id: number; batchCode: string }>;
  affectedOperations: Array<{
    operationPlanId: number;
    operationCode: string;
    operationName: string;
    batchCode: string;
    projectCode: string;
    startDatetime: string;
    endDatetime: string;
  }>;
  affectedResources: Array<{ resourceId: number; overlappingEvents: number }>;
}

export interface PlatformBusinessRulesCoverage {
  coverageByDomain: PlatformReadinessSummary[];
  missingRuleOperations: Array<{
    operationPlanId: number;
    operationId: number;
    operationCode: string;
    operationName: string;
    batchCode: string;
    projectCode: string;
    domainCode: string;
  }>;
  missingCandidateBindings: Array<{
    requirementId: number;
    operationId: number;
    operationCode: string;
    operationName: string;
    resourceType: ResourceType;
    requiredCount: number;
  }>;
  mismatchedCandidates: Array<{
    requirementId: number;
    operationId: number;
    operationCode: string;
    operationName: string;
    resourceType: ResourceType;
    candidateResourceTypes: ResourceType[];
  }>;
}

export interface PlatformRunDetail {
  id: number;
  runCode: string;
  status: string;
  stage: string;
  createdAt: string;
  completedAt: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  solverSummary: Record<string, unknown> | null;
  applySummary: Record<string, unknown> | null;
  warnings: string[];
  errorMessage: string | null;
  targetBatchIds: number[];
  relatedProjects: Array<{ projectCode: string; batches?: string[] }>;
  relatedConflicts: PlatformConflict[];
  events: Array<{
    id: number;
    eventKey: string;
    stage: string;
    status: string;
    message: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
}

export interface ResourceInput {
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  departmentCode?: DepartmentCode;
  ownerOrgUnitId: number | null;
  status: ResourceStatus;
  capacity: number;
  location: string | null;
  cleanLevel: string | null;
  isShared: boolean;
  isSchedulable: boolean;
  metadata: Record<string, unknown> | null;
}

export interface ResourceCalendarEntryInput {
  startDatetime: string;
  endDatetime: string;
  eventType: ResourceCalendarEventType;
  sourceType: ResourceCalendarSourceType;
  sourceId?: number | null;
  notes?: string | null;
}

export interface OperationResourceRequirementInput {
  operationId: number;
  resourceType: ResourceType;
  requiredCount: number;
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
  candidateResourceIds?: number[];
}

export interface MaintenanceWindowInput {
  resourceId: number;
  windowType: MaintenanceWindowType;
  startDatetime: string;
  endDatetime: string;
  isHardBlock: boolean;
  ownerDeptCode: 'MAINT';
  notes?: string | null;
}

export interface PlatformOperationUpdateInput {
  plannedStartDatetime?: string;
  plannedEndDatetime?: string;
  notes?: string | null;
}

export interface PlatformOperationResourceBindingInput {
  resourceType: ResourceType;
  requiredCount: number;
  candidateResourceIds?: number[];
  prepMinutes: number;
  changeoverMinutes: number;
  cleanupMinutes: number;
  isMandatory: boolean;
  requiresExclusiveUse: boolean;
}
