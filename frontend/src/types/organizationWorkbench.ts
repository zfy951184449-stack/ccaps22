export interface OrganizationUnitNode {
    id: number;
    parentId: number | null;
    unitType: 'DEPARTMENT' | 'TEAM' | 'GROUP' | 'SHIFT';
    unitCode: string | null;
    unitName: string;
    defaultShiftCode: string | null;
    sortOrder: number;
    isActive: boolean;
    memberCount: number;
    children: OrganizationUnitNode[];
}

export interface OrganizationHierarchyResult {
    units: OrganizationUnitNode[];
    unassignedEmployees: any[];
    stats: any;
}

export interface Employee {
    id: number;
    employee_code: string;
    employee_name: string;
    department_id: number | null;
    department_name: string | null;
    primary_team_id: number | null;
    primary_team_name: string | null;
    unit_id: number | null;
    unit_name: string | null;
    primary_role_id: number | null;
    primary_role_name: string | null;
    employment_status: string; // 'ACTIVE', 'VACATION', etc.
    shopfloor_baseline_pct?: number | null;
    shopfloor_upper_pct?: number | null;
    hire_date?: string | null;
    org_role: string; // 'FRONTLINE', 'SHIFT_LEADER', etc.
    qualifications: string[];
}
