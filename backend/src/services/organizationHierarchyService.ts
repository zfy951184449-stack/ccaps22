import type { RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';
import type {
  OrganizationHierarchyResult,
  OrganizationLeaderSummary,
  OrganizationUnitNode,
  UnassignedEmployeeSummary,
  OrganizationUnitType,
} from '../models/organization';

interface OrganizationUnitRow extends RowDataPacket {
  id: number;
  parent_id: number | null;
  unit_type: OrganizationUnitType;
  unit_code: string | null;
  unit_name: string;
  default_shift_code: string | null;
  sort_order: number;
  is_active: number;
  metadata: string | null;
}

interface EmployeeRow extends RowDataPacket {
  id: number;
  employee_code: string;
  employee_name: string;
  department_id: number | null;
  primary_team_id: number | null;
  org_role: string;
  employment_status: string;
}

interface TeamRow extends RowDataPacket {
  id: number;
  team_name: string;
  team_code: string | null;
  department_id: number | null;
}

interface DepartmentRow extends RowDataPacket {
  id: number;
  parent_id: number | null;
  dept_name: string;
  dept_code: string | null;
}

interface ReportingPairRow extends RowDataPacket {
  leader_id: number;
  subordinate_id: number;
}

export async function fetchOrganizationHierarchy(): Promise<OrganizationHierarchyResult> {
  const [unitRows] = await pool.execute<OrganizationUnitRow[]>(
    `SELECT id,
            parent_id,
            unit_type,
            unit_code,
            unit_name,
            default_shift_code,
            sort_order,
            is_active,
            metadata
      FROM organization_units
     ORDER BY COALESCE(parent_id, 0), sort_order, unit_name`
  );

  const [employeeRows] = await pool.execute<EmployeeRow[]>(
    `SELECT id,
            employee_code,
            employee_name,
            department_id,
            primary_team_id,
            org_role,
            employment_status
       FROM employees`
  );

  const [teamRows] = await pool.execute<TeamRow[]>(
    `SELECT id,
            team_name,
            team_code,
            department_id
       FROM teams`
  );

  const [departmentRows] = await pool.execute<DepartmentRow[]>(
    `SELECT id,
            parent_id,
            dept_name,
            dept_code
       FROM departments`
  );

  const [reportingPairs] = await pool.execute<ReportingPairRow[]>(
    `SELECT leader_id,
            subordinate_id
       FROM employee_reporting_relations`
  );

  const unitMap = new Map<number, OrganizationUnitNode>();

  unitRows.forEach((row) => {
    let metadata: Record<string, unknown> | null = null;
    if (row.metadata) {
      try {
        metadata = JSON.parse(row.metadata);
      } catch (error) {
        metadata = null;
      }
    }

    unitMap.set(row.id, {
      id: row.id,
      parentId: row.parent_id,
      unitType: row.unit_type,
      unitCode: row.unit_code,
      unitName: row.unit_name,
      defaultShiftCode: row.default_shift_code,
      sortOrder: row.sort_order,
      isActive: Boolean(row.is_active),
      metadata,
      leaders: [],
      memberCount: 0,
      children: [],
    });
  });

  const roots: OrganizationUnitNode[] = [];

  unitMap.forEach((node) => {
    if (node.parentId && unitMap.has(node.parentId)) {
      unitMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const employeeMap = new Map<number, EmployeeRow>();
  employeeRows.forEach((row) => {
    employeeMap.set(row.id, row);
  });

  const teamMap = new Map<number, TeamRow>();
  teamRows.forEach((row) => teamMap.set(row.id, row));

  const teamDepartmentMap = new Map<number, number>();
  teamRows.forEach((row) => {
    if (row.department_id !== null && row.department_id !== undefined) {
      teamDepartmentMap.set(row.id, row.department_id);
    }
  });

  const departmentMap = new Map<number, DepartmentRow>();
  departmentRows.forEach((row) => departmentMap.set(row.id, row));

  const departmentByCode = new Map<string, DepartmentRow>();
  departmentRows.forEach((row) => {
    if (row.dept_code) {
      departmentByCode.set(row.dept_code, row);
    }
  });

  const departmentParents = new Map<number, number | null>();
  departmentRows.forEach((row) => departmentParents.set(row.id, row.parent_id));

  const leaderToSubordinates = new Map<number, number[]>();
  reportingPairs.forEach((pair) => {
    const leaderId = Number(pair.leader_id);
    const subordinateId = Number(pair.subordinate_id);
    if (!leaderToSubordinates.has(leaderId)) {
      leaderToSubordinates.set(leaderId, []);
    }
    leaderToSubordinates.get(leaderId)!.push(subordinateId);
  });

  const reportingStats = new Map<number, { subordinateCount: number; shiftLeaderCount: number }>();
  leaderToSubordinates.forEach((subordinates, leaderId) => {
    let shiftLeaderCount = 0;
    subordinates.forEach((subordinateId) => {
      const subordinate = employeeMap.get(subordinateId);
      if (subordinate && subordinate.org_role === 'SHIFT_LEADER') {
        shiftLeaderCount += 1;
      }
    });
    reportingStats.set(leaderId, {
      subordinateCount: subordinates.length,
      shiftLeaderCount,
    });
  });

  const employeesByTeam = new Map<number, EmployeeRow[]>();
  const departmentEmployeeSets = new Map<number, Set<number>>();

  const teamByCode = new Map<string, TeamRow>();
  teamRows.forEach((row) => {
    if (row.team_code) {
      teamByCode.set(row.team_code, row);
    }
  });

  const addEmployeeToDepartment = (departmentId: number | null | undefined, employeeId: number) => {
    let current = departmentId ?? null;
    while (current) {
      if (!departmentEmployeeSets.has(current)) {
        departmentEmployeeSets.set(current, new Set());
      }
      departmentEmployeeSets.get(current)!.add(employeeId);
      current = departmentParents.get(current) ?? null;
    }
  };

  employeeRows.forEach((employee) => {
    if (employee.primary_team_id !== null && employee.primary_team_id !== undefined) {
      if (!employeesByTeam.has(employee.primary_team_id)) {
        employeesByTeam.set(employee.primary_team_id, []);
      }
      employeesByTeam.get(employee.primary_team_id)!.push(employee);

      const deptId = teamDepartmentMap.get(employee.primary_team_id);
      if (deptId) {
        addEmployeeToDepartment(deptId, employee.id);
      }
    }

    if (employee.department_id) {
      addEmployeeToDepartment(employee.department_id, employee.id);
    }
  });

  unitMap.forEach((unit) => {
    const meta = unit.metadata as Record<string, any> | null;
    if (!meta) {
      return;
    }
  });

  let leaderCounter = 0;
  let emptyLeadershipNodes = 0;

  const buildLeaderSummary = (employee: EmployeeRow): OrganizationLeaderSummary => {
    const stats = reportingStats.get(employee.id) || { subordinateCount: 0, shiftLeaderCount: 0 };
    const summary: OrganizationLeaderSummary = {
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: employee.employee_name,
      orgRole: employee.org_role,
      employmentStatus: employee.employment_status,
      directSubordinateCount: stats.subordinateCount,
      shiftLeaderCount: stats.shiftLeaderCount,
      hasShiftLeaderGap:
        employee.org_role === 'GROUP_LEADER' && stats.subordinateCount > 0 && stats.shiftLeaderCount === 0,
    };

    if (summary.hasShiftLeaderGap) {
      emptyLeadershipNodes += 1;
    }

    leaderCounter += 1;
    return summary;
  };

  unitMap.forEach((unit) => {
    unit.leaders = [];
    unit.memberCount = 0;

    const meta = unit.metadata as Record<string, any> | null;

    if (unit.unitType === 'DEPARTMENT') {
      let deptId = meta?.departmentId ?? null;
      if (!deptId && unit.unitCode && departmentByCode.has(unit.unitCode)) {
        deptId = departmentByCode.get(unit.unitCode)!.id;
      }
      if (deptId && departmentEmployeeSets.has(deptId)) {
        unit.memberCount = departmentEmployeeSets.get(deptId)!.size;
      }

      if (deptId) {
        employeeRows
          .filter((emp) => emp.department_id === deptId && emp.org_role === 'DEPT_MANAGER')
          .forEach((emp) => unit.leaders.push(buildLeaderSummary(emp)));
      }
    } else if (unit.unitType === 'TEAM') {
      let teamId = meta?.teamId ?? null;
      if (!teamId && unit.unitCode && teamByCode.has(unit.unitCode)) {
        teamId = teamByCode.get(unit.unitCode)!.id;
      }
      if (teamId && employeesByTeam.has(teamId)) {
        unit.memberCount = employeesByTeam.get(teamId)!.length;
        employeesByTeam
          .get(teamId)!
          .filter((emp) => emp.org_role === 'TEAM_LEADER')
          .forEach((emp) => unit.leaders.push(buildLeaderSummary(emp)));
      }
    } else if (unit.unitType === 'GROUP') {
      const leaderId = meta?.leaderEmployeeId;
      if (leaderId && employeeMap.has(leaderId)) {
        const leader = employeeMap.get(leaderId)!;
        unit.leaders.push(buildLeaderSummary(leader));
        const stats = reportingStats.get(leaderId);
        unit.memberCount = stats ? stats.subordinateCount : 0;
      }
    } else if (unit.unitType === 'SHIFT') {
      const leaderId = meta?.leaderEmployeeId;
      if (leaderId && employeeMap.has(leaderId)) {
        const leader = employeeMap.get(leaderId)!;
        unit.leaders.push(buildLeaderSummary(leader));
        const stats = reportingStats.get(leaderId);
        unit.memberCount = stats ? stats.subordinateCount : 0;
      }
    }
  });

  const unassignedEmployees: UnassignedEmployeeSummary[] = employeeRows
    .filter((employee) => !employee.department_id && !employee.primary_team_id)
    .map((employee) => ({
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: employee.employee_name,
      orgRole: employee.org_role,
      employmentStatus: employee.employment_status,
    }));

  const stats = {
    totalUnits: unitMap.size,
    totalLeaders: leaderCounter,
    orphanUnits: roots.filter((node) => node.parentId === null).length,
    emptyLeadershipNodes,
  };

  const sortChildren = (node: OrganizationUnitNode) => {
    node.children.sort((a, b) => a.sortOrder - b.sortOrder || a.unitName.localeCompare(b.unitName));
    node.children.forEach(sortChildren);
  };

  roots.forEach(sortChildren);

  return {
    units: roots,
    unassignedEmployees,
    stats,
  };
}
