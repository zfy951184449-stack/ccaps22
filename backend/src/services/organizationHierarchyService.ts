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

interface MembershipRow extends RowDataPacket {
  unit_id: number;
  employee_id: number;
  assignment_type: 'PRIMARY' | 'SECONDARY';
  role_at_unit: 'LEADER' | 'MEMBER' | 'SUPPORT';
  employee_code: string;
  employee_name: string;
  org_role: string;
  employment_status: string;
}

interface ReportingRow extends RowDataPacket {
  leader_id: number;
  subordinate_count: number;
  shift_leader_count: number;
}

interface UnassignedEmployeeRow extends RowDataPacket {
  employee_id: number;
  employee_code: string;
  employee_name: string;
  org_role: string;
  employment_status: string;
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

  // Membership data
  const [membershipRows] = await pool.execute<MembershipRow[]>(
    `SELECT eom.unit_id,
            eom.employee_id,
            eom.assignment_type,
            eom.role_at_unit,
            e.employee_code,
            e.employee_name,
            e.org_role,
            e.employment_status
       FROM employee_org_membership eom
       JOIN employees e ON e.id = eom.employee_id
      WHERE eom.is_active = 1`
  );

  const [reportingRows] = await pool.execute<ReportingRow[]>(
    `SELECT r.leader_id,
            COUNT(*) AS subordinate_count,
            SUM(CASE WHEN e.org_role = 'SHIFT_LEADER' THEN 1 ELSE 0 END) AS shift_leader_count
       FROM employee_reporting_relations r
       LEFT JOIN employees e ON e.id = r.subordinate_id
      GROUP BY r.leader_id`
  );

  const reportingMap = new Map<number, { subordinateCount: number; shiftLeaderCount: number }>();
  reportingRows.forEach((row) => {
    reportingMap.set(row.leader_id, {
      subordinateCount: Number(row.subordinate_count || 0),
      shiftLeaderCount: Number(row.shift_leader_count || 0),
    });
  });

  let leaderCounter = 0;
  let emptyLeadershipNodes = 0;

  membershipRows.forEach((row) => {
    const unit = unitMap.get(row.unit_id);
    if (!unit) {
      return;
    }

    if (row.role_at_unit === 'LEADER') {
      const stats = reportingMap.get(row.employee_id) || { subordinateCount: 0, shiftLeaderCount: 0 };
      const leaderInfo: OrganizationLeaderSummary = {
        employeeId: row.employee_id,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
        orgRole: row.org_role,
        employmentStatus: row.employment_status,
        directSubordinateCount: stats.subordinateCount,
        shiftLeaderCount: stats.shiftLeaderCount,
        hasShiftLeaderGap:
          row.org_role === 'GROUP_LEADER' && stats.subordinateCount > 0 && stats.shiftLeaderCount === 0,
      };
      if (leaderInfo.hasShiftLeaderGap) {
        emptyLeadershipNodes += 1;
      }
      unit.leaders.push(leaderInfo);
      leaderCounter += 1;
    } else if (row.role_at_unit === 'MEMBER') {
      unit.memberCount += 1;
    }
  });

  const [unassignedRows] = await pool.execute<UnassignedEmployeeRow[]>(
    `SELECT e.id AS employee_id,
            e.employee_code,
            e.employee_name,
            e.org_role,
            e.employment_status
       FROM employees e
       LEFT JOIN employee_org_membership eom
              ON e.id = eom.employee_id
             AND eom.assignment_type = 'PRIMARY'
             AND eom.is_active = 1
      WHERE eom.id IS NULL`
  );

  const unassignedEmployees: UnassignedEmployeeSummary[] = unassignedRows.map((row) => ({
    employeeId: row.employee_id,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
    orgRole: row.org_role,
    employmentStatus: row.employment_status,
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
