import type { RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';
import type { EmployeeOrgContext, EmployeeOrgMembershipRow } from '../models/organization';

interface EmployeeRow extends RowDataPacket {
  id: number;
  employee_code: string;
  employee_name: string;
  role_code: string;
  employment_status: string;
}

interface ReportingRelationRow extends RowDataPacket {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  role_code: string;
}

interface TeamRow extends RowDataPacket {
  id: number;
  team_name: string;
  team_code: string | null;
  department_id: number | null;
}

interface DepartmentRow extends RowDataPacket {
  id: number;
  dept_name: string;
  dept_code: string | null;
  parent_id: number | null;
}

interface OrgUnitRow extends RowDataPacket {
  id: number;
  unit_type: string;
  unit_name: string;
  unit_code: string | null;
  metadata: string | null;
}

interface ReportingPairRow extends RowDataPacket {
  leader_id: number;
  subordinate_id: number;
}

export async function fetchEmployeeOrgContext(employeeId: number): Promise<EmployeeOrgContext | null> {
  const [[employee]] = await pool.execute<EmployeeRow[]>(
    `SELECT e.id,
            e.employee_code,
            e.employee_name,
            COALESCE(r.role_code, 'FRONTLINE') AS role_code,
            e.employment_status
       FROM employees e
       LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      WHERE e.id = ?
      LIMIT 1`,
    [employeeId],
  );

  if (!employee) {
    return null;
  }

  const [teamRows] = await pool.execute<TeamRow[]>(
    `SELECT id,
            team_name,
            team_code,
            department_id
       FROM teams`
  );

  const [departmentRows] = await pool.execute<DepartmentRow[]>(
    `SELECT id,
            dept_name,
            dept_code,
            parent_id
       FROM departments`
  );

  const [unitRows] = await pool.execute<OrgUnitRow[]>(
    `SELECT id,
            unit_type,
            unit_name,
            unit_code,
            metadata
       FROM organization_units`
  );

  const [reportingPairs] = await pool.execute<ReportingPairRow[]>(
    `SELECT leader_id,
            subordinate_id
       FROM employee_reporting_relations`
  );

  const memberships: EmployeeOrgMembershipRow[] = [];

  const teamMap = new Map<number, TeamRow>();
  teamRows.forEach((team) => teamMap.set(team.id, team));

  const departmentMap = new Map<number, DepartmentRow>();
  departmentRows.forEach((dept) => departmentMap.set(dept.id, dept));

  const departmentUnitById = new Map<number, OrgUnitRow>();
  const teamUnitById = new Map<number, OrgUnitRow>();
  const groupUnitByLeader = new Map<number, OrgUnitRow>();
  const shiftUnitByLeader = new Map<number, OrgUnitRow>();

  unitRows.forEach((unit) => {
    let metadata: Record<string, any> | null = null;
    if (unit.metadata) {
      try {
        metadata = JSON.parse(unit.metadata);
      } catch (error) {
        metadata = null;
      }
    }

    if (unit.unit_type === 'DEPARTMENT' && typeof metadata?.departmentId === 'number') {
      departmentUnitById.set(metadata.departmentId, unit);
    }
    if (unit.unit_type === 'TEAM' && typeof metadata?.teamId === 'number') {
      teamUnitById.set(metadata.teamId, unit);
    }
    if (unit.unit_type === 'GROUP' && typeof metadata?.leaderEmployeeId === 'number') {
      groupUnitByLeader.set(metadata.leaderEmployeeId, unit);
    }
    if (unit.unit_type === 'SHIFT' && typeof metadata?.leaderEmployeeId === 'number') {
      shiftUnitByLeader.set(metadata.leaderEmployeeId, unit);
    }
  });

  if (employee.department_id && departmentMap.has(employee.department_id)) {
    const dept = departmentMap.get(employee.department_id)!;
    const unit = departmentUnitById.get(employee.department_id);
    const unitId = unit?.id ?? -100000 - dept.id;
    memberships.push({
      unitId,
      unitType: 'DEPARTMENT',
      unitName: unit?.unit_name ?? dept.dept_name,
      unitCode: unit?.unit_code ?? dept.dept_code,
      assignmentType: 'PRIMARY',
      roleAtUnit: employee.role_code === 'DEPT_MANAGER' ? 'LEADER' : 'MEMBER',
      startDate: null,
      endDate: null,
    });
  }

  if (employee.primary_team_id && teamMap.has(employee.primary_team_id)) {
    const team = teamMap.get(employee.primary_team_id)!;
    const unit = teamUnitById.get(employee.primary_team_id);
    const unitId = unit?.id ?? -200000 - team.id;
    memberships.push({
      unitId,
      unitType: 'TEAM',
      unitName: unit?.unit_name ?? team.team_name,
      unitCode: unit?.unit_code ?? team.team_code,
      assignmentType: 'PRIMARY',
      roleAtUnit: employee.role_code === 'TEAM_LEADER' ? 'LEADER' : 'MEMBER',
      startDate: null,
      endDate: null,
    });
  }

  if (groupUnitByLeader.has(employee.id)) {
    const unit = groupUnitByLeader.get(employee.id)!;
    memberships.push({
      unitId: unit.id,
      unitType: unit.unit_type as EmployeeOrgMembershipRow['unitType'],
      unitName: unit.unit_name,
      unitCode: unit.unit_code,
      assignmentType: 'PRIMARY',
      roleAtUnit: 'LEADER',
      startDate: null,
      endDate: null,
    });
  }

  if (shiftUnitByLeader.has(employee.id)) {
    const unit = shiftUnitByLeader.get(employee.id)!;
    memberships.push({
      unitId: unit.id,
      unitType: unit.unit_type as EmployeeOrgMembershipRow['unitType'],
      unitName: unit.unit_name,
      unitCode: unit.unit_code,
      assignmentType: 'PRIMARY',
      roleAtUnit: 'LEADER',
      startDate: null,
      endDate: null,
    });
  }

  const directLeaderIds = reportingPairs
    .filter((pair) => pair.subordinate_id === employeeId)
    .map((pair) => pair.leader_id);

  directLeaderIds.forEach((leaderId) => {
    if (groupUnitByLeader.has(leaderId)) {
      const unit = groupUnitByLeader.get(leaderId)!;
      memberships.push({
        unitId: unit.id,
        unitType: unit.unit_type as EmployeeOrgMembershipRow['unitType'],
        unitName: unit.unit_name,
        unitCode: unit.unit_code,
        assignmentType: 'SECONDARY',
        roleAtUnit: 'MEMBER',
        startDate: null,
        endDate: null,
      });
    }
    if (shiftUnitByLeader.has(leaderId)) {
      const unit = shiftUnitByLeader.get(leaderId)!;
      memberships.push({
        unitId: unit.id,
        unitType: unit.unit_type as EmployeeOrgMembershipRow['unitType'],
        unitName: unit.unit_name,
        unitCode: unit.unit_code,
        assignmentType: 'SECONDARY',
        roleAtUnit: 'MEMBER',
        startDate: null,
        endDate: null,
      });
    }
  });

  const membershipMap = new Map<string, EmployeeOrgMembershipRow>();
  memberships.forEach((membership) => {
    const key = `${membership.unitType}-${membership.unitId}-${membership.assignmentType}-${membership.roleAtUnit}`;
    if (!membershipMap.has(key)) {
      membershipMap.set(key, membership);
    }
  });

  const normalizedMemberships = Array.from(membershipMap.values());

  const [leaderRows] = await pool.execute<ReportingRelationRow[]>(
    `SELECT e.id AS employee_id,
            e.employee_code,
            e.employee_name,
            COALESCE(r.role_code, 'FRONTLINE') AS role_code
       FROM employee_reporting_relations rel
       JOIN employees e ON e.id = rel.leader_id
       LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      WHERE rel.subordinate_id = ?`,
    [employeeId],
  );

  const [subRows] = await pool.execute<ReportingRelationRow[]>(
    `SELECT e.id AS employee_id,
            e.employee_code,
            e.employee_name,
            COALESCE(r.role_code, 'FRONTLINE') AS role_code
       FROM employee_reporting_relations rel
       JOIN employees e ON e.id = rel.subordinate_id
       LEFT JOIN employee_roles r ON r.id = e.primary_role_id
      WHERE rel.leader_id = ?`,
    [employeeId],
  );

  const reportingChain: ReportingRelationRow[] = [];
  const visited = new Set<number>();
  let currentId = leaderRows[0]?.employee_id;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const [[row]] = await pool.execute<ReportingRelationRow[]>(
      `SELECT e.id AS employee_id,
              e.employee_code,
              e.employee_name,
              COALESCE(r.role_code, 'FRONTLINE') AS role_code
         FROM employees e
         LEFT JOIN employee_roles r ON r.id = e.primary_role_id
         WHERE e.id = ?
         LIMIT 1`,
      [currentId],
    );
    if (!row) {
      break;
    }
    reportingChain.push(row);

    const [[nextLeader]] = await pool.execute<ReportingRelationRow[]>(
      `SELECT e.id AS employee_id,
              e.employee_code,
              e.employee_name,
              COALESCE(r.role_code, 'FRONTLINE') AS role_code
         FROM employee_reporting_relations rel
         JOIN employees e ON e.id = rel.leader_id
         LEFT JOIN employee_roles r ON r.id = e.primary_role_id
        WHERE rel.subordinate_id = ?
        LIMIT 1`,
      [row.employee_id],
    );
    currentId = nextLeader?.employee_id;
  }

  return {
    employeeId: employee.id,
    employeeCode: employee.employee_code,
    employeeName: employee.employee_name,
    orgRole: employee.role_code,
    employmentStatus: employee.employment_status,
    memberships: normalizedMemberships,
    directLeaders: leaderRows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.role_code,
    })),
    directSubordinates: subRows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.role_code,
    })),
    reportingChain: reportingChain.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.role_code,
    })),
  };
}
