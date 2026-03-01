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

export interface PlatformOverview {
  projectCount: number;
  activeBatchCount: number;
  resourceCount: number;
  resourceConflictCount: number;
  personnelConflictCount: number;
  maintenanceBlockCount: number;
  missingMasterDataCount: number;
  departments: PlatformDepartmentSummary[];
  recentRuns: PlatformRunSummary[];
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
  employeeName?: string | null;
  windowStart: string;
  windowEnd: string;
  details: string;
}

export interface ResourceInput {
  resourceCode: string;
  resourceName: string;
  resourceType: ResourceType;
  departmentCode: DepartmentCode;
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
