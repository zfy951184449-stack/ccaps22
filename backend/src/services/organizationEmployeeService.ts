import type { RowDataPacket } from 'mysql2/promise';
import pool from '../config/database';
import type { EmployeeOrgContext, EmployeeOrgMembershipRow } from '../models/organization';

interface EmployeeRow extends RowDataPacket {
  id: number;
  employee_code: string;
  employee_name: string;
  org_role: string;
  employment_status: string;
}

interface MembershipRow extends RowDataPacket {
  unit_id: number;
  unit_type: string;
  unit_name: string;
  unit_code: string | null;
  assignment_type: 'PRIMARY' | 'SECONDARY';
  role_at_unit: 'LEADER' | 'MEMBER' | 'SUPPORT';
  start_date: string | null;
  end_date: string | null;
}

interface ReportingRelationRow extends RowDataPacket {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  org_role: string;
}

export async function fetchEmployeeOrgContext(employeeId: number): Promise<EmployeeOrgContext | null> {
  const [[employee]] = await pool.execute<EmployeeRow[]>(
    `SELECT id,
            employee_code,
            employee_name,
            org_role,
            employment_status
       FROM employees
      WHERE id = ?
      LIMIT 1`,
    [employeeId],
  );

  if (!employee) {
    return null;
  }

  const [membershipRows] = await pool.execute<MembershipRow[]>(
    `SELECT o.id AS unit_id,
            o.unit_type,
            o.unit_name,
            o.unit_code,
            m.assignment_type,
            m.role_at_unit,
            m.start_date,
            m.end_date
       FROM employee_org_membership m
       JOIN organization_units o ON o.id = m.unit_id
      WHERE m.employee_id = ?
        AND m.is_active = 1
      ORDER BY m.assignment_type = 'PRIMARY' DESC, o.unit_type`,
    [employeeId],
  );

  const memberships: EmployeeOrgMembershipRow[] = membershipRows.map((row) => ({
    unitId: row.unit_id,
    unitType: row.unit_type as EmployeeOrgMembershipRow['unitType'],
    unitName: row.unit_name,
    unitCode: row.unit_code,
    assignmentType: row.assignment_type,
    roleAtUnit: row.role_at_unit,
    startDate: row.start_date,
    endDate: row.end_date,
  }));

  const [leaderRows] = await pool.execute<ReportingRelationRow[]>(
    `SELECT e.id AS employee_id,
            e.employee_code,
            e.employee_name,
            e.org_role
       FROM employee_reporting_relations r
       JOIN employees e ON e.id = r.leader_id
      WHERE r.subordinate_id = ?`,
    [employeeId],
  );

  const [subRows] = await pool.execute<ReportingRelationRow[]>(
    `SELECT e.id AS employee_id,
            e.employee_code,
            e.employee_name,
            e.org_role
       FROM employee_reporting_relations r
       JOIN employees e ON e.id = r.subordinate_id
      WHERE r.leader_id = ?`,
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
              e.org_role
         FROM employees e
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
              e.org_role
         FROM employee_reporting_relations r
         JOIN employees e ON e.id = r.leader_id
        WHERE r.subordinate_id = ?
        LIMIT 1`,
      [row.employee_id],
    );
    currentId = nextLeader?.employee_id;
  }

  return {
    employeeId: employee.id,
    employeeCode: employee.employee_code,
    employeeName: employee.employee_name,
    orgRole: employee.org_role,
    employmentStatus: employee.employment_status,
    memberships,
    directLeaders: leaderRows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.org_role,
    })),
    directSubordinates: subRows.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.org_role,
    })),
    reportingChain: reportingChain.map((row) => ({
      employeeId: row.employee_id,
      employeeCode: row.employee_code,
      employeeName: row.employee_name,
      orgRole: row.org_role,
    })),
  };
}
