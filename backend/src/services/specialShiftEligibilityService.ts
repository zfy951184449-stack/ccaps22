import { RowDataPacket } from 'mysql2/promise';
import pool, { DbExecutor } from '../config/database';

export interface SpecialShiftEligibilityRule {
  qualificationId?: number | null;
  minLevel?: number | null;
  allowEmployeeIds?: number[];
  denyEmployeeIds?: number[];
}

export interface SpecialShiftOrgEmployeeContext {
  employeeIds: number[];
  qualificationMapByEmployee: Map<number, Map<number, number>>;
}

const normalizeNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export class SpecialShiftEligibilityService {
  static async buildOrgEmployeeContext(
    orgUnitId: number,
    executor: DbExecutor = pool,
  ): Promise<SpecialShiftOrgEmployeeContext> {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `
        WITH RECURSIVE unit_hierarchy AS (
          SELECT id
            FROM organization_units
           WHERE id = ?
          UNION ALL
          SELECT child.id
            FROM organization_units child
            JOIN unit_hierarchy parent ON child.parent_id = parent.id
        )
        SELECT
          e.id AS employee_id,
          eq.qualification_id,
          eq.qualification_level
        FROM employees e
        LEFT JOIN employee_qualifications eq
          ON eq.employee_id = e.id
        WHERE e.employment_status = 'ACTIVE'
          AND e.unit_id IN (SELECT id FROM unit_hierarchy)
        ORDER BY e.id
      `,
      [orgUnitId],
    );

    const employeeIds: number[] = [];
    const seenEmployees = new Set<number>();
    const qualificationMapByEmployee = new Map<number, Map<number, number>>();

    rows.forEach((row) => {
      const employeeId = normalizeNumber(row.employee_id);
      if (!employeeId) {
        return;
      }

      if (!seenEmployees.has(employeeId)) {
        seenEmployees.add(employeeId);
        employeeIds.push(employeeId);
      }

      const qualificationId = normalizeNumber(row.qualification_id);
      const qualificationLevel = normalizeNumber(row.qualification_level);
      if (!qualificationId || qualificationLevel === null) {
        return;
      }

      if (!qualificationMapByEmployee.has(employeeId)) {
        qualificationMapByEmployee.set(employeeId, new Map<number, number>());
      }
      qualificationMapByEmployee.get(employeeId)!.set(qualificationId, qualificationLevel);
    });

    return {
      employeeIds,
      qualificationMapByEmployee,
    };
  }

  static computeEligibleEmployeeIds(
    context: SpecialShiftOrgEmployeeContext,
    rule: SpecialShiftEligibilityRule,
  ): number[] {
    const allowSet = new Set((rule.allowEmployeeIds || []).filter((id) => Number.isFinite(id) && id > 0));
    const denySet = new Set((rule.denyEmployeeIds || []).filter((id) => Number.isFinite(id) && id > 0));

    let candidates = context.employeeIds.filter((employeeId) => {
      if (allowSet.size > 0 && !allowSet.has(employeeId)) {
        return false;
      }
      if (denySet.has(employeeId)) {
        return false;
      }
      return true;
    });

    if (rule.qualificationId) {
      const minLevel = rule.minLevel ?? 1;
      candidates = candidates.filter((employeeId) => {
        const qualificationMap = context.qualificationMapByEmployee.get(employeeId);
        return (qualificationMap?.get(rule.qualificationId!) ?? 0) >= minLevel;
      });
    }

    return candidates.sort((a, b) => a - b);
  }

  static buildBlockingIssues(requiredPeople: number, eligibleEmployeeIds: number[]): string[] {
    if (eligibleEmployeeIds.length < requiredPeople) {
      return [
        `静态候选人数不足: 需要 ${requiredPeople} 人, 当前仅 ${eligibleEmployeeIds.length} 人`,
      ];
    }
    return [];
  }
}

export default SpecialShiftEligibilityService;
