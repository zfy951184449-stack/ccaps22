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
  unit_id: number | null;
  role_code: string;
  employment_status: string;
}

interface ReportingPairRow extends RowDataPacket {
  leader_id: number;
  subordinate_id: number;
}

export async function fetchOrganizationHierarchy(): Promise<OrganizationHierarchyResult> {
  // 1. Fetch all Units
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
     WHERE is_active = 1
     ORDER BY COALESCE(parent_id, 0), sort_order, unit_name`
  );

  // 2. Fetch all Employees with Unit ID and Role Code
  const [employeeRows] = await pool.execute<EmployeeRow[]>(
    `SELECT e.id,
            e.employee_code,
            e.employee_name,
            e.unit_id,
            COALESCE(r.role_code, 'FRONTLINE') AS role_code,
            e.employment_status
       FROM employees e
       LEFT JOIN employee_roles r ON r.id = e.primary_role_id`
  );

  // 3. Fetch Reporting Relations
  const [reportingPairs] = await pool.execute<ReportingPairRow[]>(
    `SELECT leader_id,
            subordinate_id
       FROM employee_reporting_relations`
  );

  // --- Data Structure Building ---

  const unitMap = new Map<number, OrganizationUnitNode>();
  const parentMap = new Map<number, number | null>(); // Unit ID -> Parent ID

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

    parentMap.set(row.id, row.parent_id);
  });

  // Build Tree
  const roots: OrganizationUnitNode[] = [];
  unitMap.forEach((node) => {
    if (node.parentId) {
      if (unitMap.has(node.parentId)) {
        unitMap.get(node.parentId)!.children.push(node);
      }
      // 轻微隐患修复：当父节点失效未被装载时，该子节点（ Ghost Root ）被安静地过滤掉，不再强行升维到 roots 中。
    } else {
      roots.push(node);
    }
  });

  const employeeMap = new Map<number, EmployeeRow>();
  employeeRows.forEach((row) => {
    employeeMap.set(row.id, row);
  });

  // Reporting / Stats
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
      if (subordinate && subordinate.role_code === 'SHIFT_LEADER') {
        shiftLeaderCount += 1;
      }
    });
    reportingStats.set(leaderId, {
      subordinateCount: subordinates.length,
      shiftLeaderCount,
    });
  });

  // Employee Assignment & Recursive Member Counting
  const employeesByUnit = new Map<number, EmployeeRow[]>();
  const unitRecursiveMemberSets = new Map<number, Set<number>>();

  const addToRecursiveMembers = (unitId: number | null | undefined, employeeId: number) => {
    let current = unitId ?? null;
    while (current) {
      if (!unitRecursiveMemberSets.has(current)) {
        unitRecursiveMemberSets.set(current, new Set());
      }
      unitRecursiveMemberSets.get(current)!.add(employeeId);
      current = parentMap.get(current) ?? null;
    }
  };

  employeeRows.forEach((employee) => {
    if (employee.unit_id) {
      // Direct Assignment
      if (!employeesByUnit.has(employee.unit_id)) {
        employeesByUnit.set(employee.unit_id, []);
      }
      employeesByUnit.get(employee.unit_id)!.push(employee);

      // Recursive Counts (works for Dept <- Team <- Emp)
      addToRecursiveMembers(employee.unit_id, employee.id);
    }
  });

  // --- Leader & Stats Population ---

  let leaderCounter = 0;
  let emptyLeadershipNodes = 0;

  const buildLeaderSummary = (employee: EmployeeRow): OrganizationLeaderSummary => {
    const stats = reportingStats.get(employee.id) || { subordinateCount: 0, shiftLeaderCount: 0 };
    const summary: OrganizationLeaderSummary = {
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: employee.employee_name,
      orgRole: employee.role_code,
      employmentStatus: employee.employment_status,
      directSubordinateCount: stats.subordinateCount,
      shiftLeaderCount: stats.shiftLeaderCount,
      hasShiftLeaderGap:
        employee.role_code === 'GROUP_LEADER' && stats.subordinateCount > 0 && stats.shiftLeaderCount === 0,
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

    // Set Member Count
    if (unitRecursiveMemberSets.has(unit.id)) {
      unit.memberCount = unitRecursiveMemberSets.get(unit.id)!.size;
    }

    // Find Leaders based on Logic
    const directMembers = employeesByUnit.get(unit.id) || [];
    const meta = unit.metadata as Record<string, any> | null;

    if (unit.unitType === 'DEPARTMENT') {
      // Logic: Employees in this unit (presumably the manager) with DEPT_MANAGER role
      directMembers
        .filter((emp) => emp.role_code === 'DEPT_MANAGER')
        .forEach((emp) => unit.leaders.push(buildLeaderSummary(emp)));
    } else if (unit.unitType === 'TEAM') {
      // Logic: Employees in this unit with TEAM_LEADER role
      directMembers
        .filter((emp) => emp.role_code === 'TEAM_LEADER')
        .forEach((emp) => unit.leaders.push(buildLeaderSummary(emp)));
    } else if (unit.unitType === 'GROUP' || unit.unitType === 'SHIFT') {
      // Logic: Leader is explicitly linked via Metadata (AutoStructureService)
      const leaderId = meta?.leaderEmployeeId;
      if (leaderId && employeeMap.has(leaderId)) {
        const leader = employeeMap.get(leaderId)!;
        unit.leaders.push(buildLeaderSummary(leader));
      }
    }
  });

  const unassignedEmployees: UnassignedEmployeeSummary[] = employeeRows
    .filter((employee) => !employee.unit_id)
    .map((employee) => ({
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: employee.employee_name,
      orgRole: employee.role_code,
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
