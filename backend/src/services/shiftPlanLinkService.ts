import { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface BackfillOptions {
  runId?: number;
  assignmentIds?: number[];
  dryRun?: boolean;
}

interface AssignmentRow {
  assignmentId: number;
  employeeId: number;
  schedulingRunId: number | null;
  batchOperationPlanId: number;
  planDate: string;
  operationStart: Date;
  operationEnd: Date;
}

interface ShiftPlanRow {
  shiftPlanId: number;
  employeeId: number;
  schedulingRunId: number | null;
  planDate: string;
  shiftId: number | null;
  planCategory: string;
  planHours: number;
  batchOperationPlanId: number | null;
}

interface ShiftDefinitionRow {
  shiftId: number;
  startTime: string;
  endTime: string;
  isCrossDay: boolean;
}

export interface ShiftPlanLinkBackfillResult {
  scannedAssignments: number;
  matchedAssignments: number;
  updatedAssignments: number;
  ambiguousAssignments: number;
  missingAssignments: number;
  warnings: string[];
}

export class ShiftPlanLinkService {
  static async backfillMissingShiftPlanLinks(
    connection: PoolConnection,
    options: BackfillOptions = {},
  ): Promise<ShiftPlanLinkBackfillResult> {
    const assignments = await this.loadAssignments(connection, options);
    const warnings: string[] = [];

    if (!assignments.length) {
      return {
        scannedAssignments: 0,
        matchedAssignments: 0,
        updatedAssignments: 0,
        ambiguousAssignments: 0,
        missingAssignments: 0,
        warnings,
      };
    }

    const shiftPlans = await this.loadShiftPlans(connection, assignments, options);
    const shiftDefinitions = await this.loadShiftDefinitions(connection, shiftPlans);

    const byRunEmployeeDate = new Map<string, ShiftPlanRow[]>();
    const byEmployeeDate = new Map<string, ShiftPlanRow[]>();

    shiftPlans.forEach((plan) => {
      const employeeDateKey = this.buildEmployeeDateKey(plan.employeeId, plan.planDate);
      if (!byEmployeeDate.has(employeeDateKey)) {
        byEmployeeDate.set(employeeDateKey, []);
      }
      byEmployeeDate.get(employeeDateKey)!.push(plan);

      if (plan.schedulingRunId !== null) {
        const exactKey = this.buildRunEmployeeDateKey(
          plan.schedulingRunId,
          plan.employeeId,
          plan.planDate,
        );
        if (!byRunEmployeeDate.has(exactKey)) {
          byRunEmployeeDate.set(exactKey, []);
        }
        byRunEmployeeDate.get(exactKey)!.push(plan);
      }
    });

    const assignmentIdsByShiftPlanId = new Map<number, number[]>();
    let matchedAssignments = 0;
    let ambiguousAssignments = 0;
    let missingAssignments = 0;

    assignments.forEach((assignment) => {
      const sameDayCandidates =
        assignment.schedulingRunId !== null
          ? byRunEmployeeDate.get(
              this.buildRunEmployeeDateKey(
                assignment.schedulingRunId,
                assignment.employeeId,
                assignment.planDate,
              ),
            ) || []
          : byEmployeeDate.get(this.buildEmployeeDateKey(assignment.employeeId, assignment.planDate)) || [];

      const match = this.resolveShiftPlanMatch(assignment, sameDayCandidates, shiftDefinitions);
      if (match === null) {
        if (!sameDayCandidates.length) {
          missingAssignments++;
          if (warnings.length < 10) {
            warnings.push(
              `No shift plan found for assignment ${assignment.assignmentId} (emp ${assignment.employeeId}, ${assignment.planDate})`,
            );
          }
        } else {
          ambiguousAssignments++;
          if (warnings.length < 10) {
            warnings.push(
              `Ambiguous shift plan for assignment ${assignment.assignmentId} (emp ${assignment.employeeId}, ${assignment.planDate})`,
            );
          }
        }
        return;
      }

      matchedAssignments++;
      if (!assignmentIdsByShiftPlanId.has(match.shiftPlanId)) {
        assignmentIdsByShiftPlanId.set(match.shiftPlanId, []);
      }
      assignmentIdsByShiftPlanId.get(match.shiftPlanId)!.push(assignment.assignmentId);
    });

    let updatedAssignments = 0;
    if (!options.dryRun) {
      for (const [shiftPlanId, assignmentIds] of assignmentIdsByShiftPlanId.entries()) {
        const placeholders = assignmentIds.map(() => '?').join(',');
        const [result] = await connection.execute<ResultSetHeader>(
          `UPDATE batch_personnel_assignments
           SET shift_plan_id = ?
           WHERE id IN (${placeholders})
             AND shift_plan_id IS NULL`,
          [shiftPlanId, ...assignmentIds],
        );
        updatedAssignments += Number(result.affectedRows || 0);
      }
    }

    return {
      scannedAssignments: assignments.length,
      matchedAssignments,
      updatedAssignments: options.dryRun ? matchedAssignments : updatedAssignments,
      ambiguousAssignments,
      missingAssignments,
      warnings,
    };
  }

  private static async loadAssignments(
    connection: PoolConnection,
    options: BackfillOptions,
  ): Promise<AssignmentRow[]> {
    const conditions = [
      'bpa.shift_plan_id IS NULL',
      "bpa.assignment_status IN ('PLANNED', 'CONFIRMED')",
    ];
    const params: Array<number> = [];

    if (options.runId !== undefined) {
      conditions.push('bpa.scheduling_run_id = ?');
      params.push(options.runId);
    }

    if (options.assignmentIds && options.assignmentIds.length > 0) {
      const placeholders = options.assignmentIds.map(() => '?').join(',');
      conditions.push(`bpa.id IN (${placeholders})`);
      params.push(...options.assignmentIds);
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         bpa.id AS assignmentId,
         bpa.employee_id AS employeeId,
         bpa.scheduling_run_id AS schedulingRunId,
         bpa.batch_operation_plan_id AS batchOperationPlanId,
         DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d') AS planDate,
         bop.planned_start_datetime AS operationStart,
         bop.planned_end_datetime AS operationEnd
       FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bop.id = bpa.batch_operation_plan_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY bpa.scheduling_run_id, bpa.employee_id, bop.planned_start_datetime, bpa.id`,
      params,
    );

    return rows.map((row) => ({
      assignmentId: Number(row.assignmentId),
      employeeId: Number(row.employeeId),
      schedulingRunId:
        row.schedulingRunId !== null && row.schedulingRunId !== undefined
          ? Number(row.schedulingRunId)
          : null,
      batchOperationPlanId: Number(row.batchOperationPlanId),
      planDate: String(row.planDate),
      operationStart: new Date(row.operationStart),
      operationEnd: new Date(row.operationEnd),
    }));
  }

  private static async loadShiftPlans(
    connection: PoolConnection,
    assignments: AssignmentRow[],
    options: BackfillOptions,
  ): Promise<ShiftPlanRow[]> {
    const employeeIds = Array.from(new Set(assignments.map((row) => row.employeeId)));
    const planDates = Array.from(new Set(assignments.map((row) => row.planDate))).sort();
    const runIds = Array.from(
      new Set(
        assignments
          .map((row) => row.schedulingRunId)
          .filter((runId): runId is number => runId !== null),
      ),
    );

    const conditions = [
      `esp.employee_id IN (${employeeIds.map(() => '?').join(',')})`,
      'esp.plan_date BETWEEN ? AND ?',
    ];
    const params: Array<number | string> = [...employeeIds, planDates[0], planDates[planDates.length - 1]];

    if (options.runId !== undefined) {
      conditions.push('esp.scheduling_run_id = ?');
      params.push(options.runId);
    } else if (runIds.length > 0) {
      conditions.push(
        `(esp.scheduling_run_id IN (${runIds.map(() => '?').join(',')}) OR esp.scheduling_run_id IS NULL)`,
      );
      params.push(...runIds);
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         esp.id AS shiftPlanId,
         esp.employee_id AS employeeId,
         esp.scheduling_run_id AS schedulingRunId,
         DATE_FORMAT(esp.plan_date, '%Y-%m-%d') AS planDate,
         esp.shift_id AS shiftId,
         esp.plan_category AS planCategory,
         COALESCE(esp.plan_hours, 0) AS planHours,
         esp.batch_operation_plan_id AS batchOperationPlanId
       FROM employee_shift_plans esp
       WHERE ${conditions.join(' AND ')}
       ORDER BY esp.employee_id, esp.plan_date, esp.id`,
      params,
    );

    return rows.map((row) => ({
      shiftPlanId: Number(row.shiftPlanId),
      employeeId: Number(row.employeeId),
      schedulingRunId:
        row.schedulingRunId !== null && row.schedulingRunId !== undefined
          ? Number(row.schedulingRunId)
          : null,
      planDate: String(row.planDate),
      shiftId: row.shiftId !== null && row.shiftId !== undefined ? Number(row.shiftId) : null,
      planCategory: String(row.planCategory || 'BASE').toUpperCase(),
      planHours: Number(row.planHours || 0),
      batchOperationPlanId:
        row.batchOperationPlanId !== null && row.batchOperationPlanId !== undefined
          ? Number(row.batchOperationPlanId)
          : null,
    }));
  }

  private static async loadShiftDefinitions(
    connection: PoolConnection,
    shiftPlans: ShiftPlanRow[],
  ): Promise<Map<number, ShiftDefinitionRow>> {
    const shiftIds = Array.from(
      new Set(
        shiftPlans
          .map((plan) => plan.shiftId)
          .filter((shiftId): shiftId is number => shiftId !== null),
      ),
    );

    if (!shiftIds.length) {
      return new Map();
    }

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id AS shiftId, start_time AS startTime, end_time AS endTime, is_cross_day AS isCrossDay
       FROM shift_definitions
       WHERE id IN (${shiftIds.map(() => '?').join(',')})`,
      shiftIds,
    );

    return new Map(
      rows.map((row) => [
        Number(row.shiftId),
        {
          shiftId: Number(row.shiftId),
          startTime: String(row.startTime),
          endTime: String(row.endTime),
          isCrossDay: Boolean(row.isCrossDay),
        },
      ]),
    );
  }

  private static resolveShiftPlanMatch(
    assignment: AssignmentRow,
    candidates: ShiftPlanRow[],
    shiftDefinitions: Map<number, ShiftDefinitionRow>,
  ): ShiftPlanRow | null {
    if (!candidates.length) {
      return null;
    }

    const workCandidates = candidates.filter((candidate) => this.isWorkPlan(candidate));
    const relevantCandidates = workCandidates.length > 0 ? workCandidates : candidates;

    if (relevantCandidates.length === 1) {
      return relevantCandidates[0];
    }

    const sameOperationCandidates = relevantCandidates.filter(
      (candidate) => candidate.batchOperationPlanId === assignment.batchOperationPlanId,
    );
    if (sameOperationCandidates.length === 1) {
      return sameOperationCandidates[0];
    }

    const coveringCandidates = relevantCandidates.filter((candidate) =>
      this.shiftCoversOperation(candidate, assignment, shiftDefinitions),
    );
    if (coveringCandidates.length === 1) {
      return coveringCandidates[0];
    }

    return null;
  }

  private static isWorkPlan(plan: ShiftPlanRow): boolean {
    return plan.planCategory !== 'REST' && plan.planHours > 0;
  }

  private static shiftCoversOperation(
    plan: ShiftPlanRow,
    assignment: AssignmentRow,
    shiftDefinitions: Map<number, ShiftDefinitionRow>,
  ): boolean {
    if (plan.shiftId === null) {
      return false;
    }

    const shift = shiftDefinitions.get(plan.shiftId);
    if (!shift) {
      return false;
    }

    const shiftStart = new Date(`${plan.planDate}T${shift.startTime}`);
    const shiftEnd = new Date(`${plan.planDate}T${shift.endTime}`);

    if (shift.isCrossDay || shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    return assignment.operationStart >= shiftStart && assignment.operationEnd <= shiftEnd;
  }

  private static buildRunEmployeeDateKey(runId: number, employeeId: number, planDate: string): string {
    return `${runId}:${employeeId}:${planDate}`;
  }

  private static buildEmployeeDateKey(employeeId: number, planDate: string): string {
    return `${employeeId}:${planDate}`;
  }
}

export default ShiftPlanLinkService;
