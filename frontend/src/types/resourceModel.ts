export type DepartmentCode = 'USP' | 'DSP' | 'SPI' | 'MAINT';
export type ResourceType = 'ROOM' | 'EQUIPMENT' | 'VESSEL_CONTAINER' | 'TOOLING' | 'STERILIZATION_RESOURCE';
export type ResourceStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'RETIRED';

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
