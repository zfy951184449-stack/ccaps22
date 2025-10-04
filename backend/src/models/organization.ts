export type OrganizationUnitType = 'DEPARTMENT' | 'TEAM' | 'GROUP' | 'SHIFT';

export interface OrganizationUnitNode {
  id: number;
  parentId: number | null;
  unitType: OrganizationUnitType;
  unitCode: string | null;
  unitName: string;
  defaultShiftCode: string | null;
  sortOrder: number;
  isActive: boolean;
  metadata: Record<string, unknown> | null;
  leaders: OrganizationLeaderSummary[];
  memberCount: number;
  children: OrganizationUnitNode[];
}

export interface OrganizationLeaderSummary {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
  directSubordinateCount: number;
  shiftLeaderCount: number;
  hasShiftLeaderGap: boolean;
}

export interface UnassignedEmployeeSummary {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
}

export interface OrganizationHierarchyResult {
  units: OrganizationUnitNode[];
  unassignedEmployees: UnassignedEmployeeSummary[];
  stats: {
    totalUnits: number;
    totalLeaders: number;
    orphanUnits: number;
    emptyLeadershipNodes: number;
  };
}

export interface EmployeeOrgMembershipRow {
  unitId: number;
  unitType: OrganizationUnitType;
  unitName: string;
  unitCode: string | null;
  assignmentType: 'PRIMARY' | 'SECONDARY';
  roleAtUnit: 'LEADER' | 'MEMBER' | 'SUPPORT';
  startDate: string | null;
  endDate: string | null;
}

export interface EmployeeOrgContext {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  orgRole: string;
  employmentStatus: string;
  memberships: EmployeeOrgMembershipRow[];
  directLeaders: Array<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    orgRole: string;
  }>;
  directSubordinates: Array<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    orgRole: string;
  }>;
  reportingChain: Array<{
    employeeId: number;
    employeeCode: string;
    employeeName: string;
    orgRole: string;
  }>;
}
