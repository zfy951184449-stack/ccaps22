import { randomUUID } from 'crypto';
import dayjs, { Dayjs } from 'dayjs';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import { DataAssemblerV4, type V4SolverRequest } from '../schedulingV4/DataAssemblerV4';
import type {
  RosterExceptionAppliedChangeDto,
  RosterExceptionApplyRequest,
  RosterExceptionApplyResponse,
  ImpactedAssignmentDto,
  ImpactedShiftPlanDto,
  ReplacementCandidateDto,
  ReplacementRecommendationLevel,
  RosterRepairMode,
  RosterExceptionEmployeeDto,
  RosterExceptionPreviewRequest,
  RosterExceptionPreviewResponse,
  RosterVacancyDto,
  SolverCapabilityGapDto,
  SolverRepairAssignmentChangeDto,
  SolverRepairProposalDto,
  SolverRepairUncoveredVacancyDto,
} from '../../domain/rosterException/rosterExceptionTypes';

export class RosterExceptionPreviewError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
  }
}

type EmployeeRow = RowDataPacket & {
  id: number;
  employee_code: string;
  employee_name: string;
  unit_id: number | null;
  department_id: number | null;
  department_name: string | null;
};

type ShiftPlanRow = RowDataPacket & {
  id: number;
  employee_id: number;
  plan_date: string | Date;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  plan_state: string;
  is_locked: number;
};

type AssignmentRow = RowDataPacket & {
  assignment_id: number;
  batch_operation_plan_id: number;
  batch_plan_id: number;
  employee_id: number;
  employee_code: string;
  employee_name: string;
  employee_department_id: number | null;
  employee_department_name: string | null;
  batch_code: string;
  operation_id: number;
  operation_name: string;
  planned_start_datetime: string | Date;
  planned_end_datetime: string | Date;
  role: string | null;
  position_number: number | null;
  assignment_locked: number;
  operation_locked: number;
  shift_plan_locked: number | null;
  shift_plan_id: number | null;
  shift_id: number | null;
  shift_code: string | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  plan_category: string | null;
  plan_date: string | Date | null;
};

type QualificationRequirementRow = RowDataPacket & {
  operation_id: number;
  position_number: number;
  qualification_id: number;
  qualification_name: string;
  required_level: number;
  is_mandatory: number;
};

type EmployeeQualificationRow = RowDataPacket & {
  employee_id: number;
  qualification_id: number;
  qualification_name: string;
  qualification_level: number;
};

type CandidateShiftRow = RowDataPacket & {
  employee_id: number;
  shift_plan_id: number;
  shift_id: number | null;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  plan_category: string | null;
  plan_date: string | Date;
};

type UnavailabilityRow = RowDataPacket & {
  employee_id: number;
  start_datetime: string | Date;
  end_datetime: string | Date;
};

type ApplyAssignmentRow = RowDataPacket & {
  id: number;
  batch_operation_plan_id: number;
  employee_id: number | null;
  shift_plan_id: number | null;
  is_locked: number;
  assignment_status: string | null;
};

type SolverPreviewAssignment = {
  operationPlanId: number;
  positionNumber: number;
  employeeId: number;
  shiftId: number | null;
  plannedStart: string;
  plannedEnd: string;
};

const MYSQL_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const WARNING_SKILL_REQUIREMENT_MISSING = 'SKILL_REQUIREMENT_MISSING';
const WARNING_LOCKED_ASSIGNMENT_AFFECTED = 'LOCKED_ASSIGNMENT_AFFECTED';
const WARNING_ONLY_RISKY_REPLACEMENTS = 'ONLY_RISKY_REPLACEMENTS';
const WARNING_CANDIDATE_CONTENTION = 'CANDIDATE_CONTENTION';
const WARNING_SOLVER_CAPABILITY_GAP = 'SOLVER_CAPABILITY_GAP';
const WARNING_DEPARTMENT_SCOPE_MISSING = 'DEPARTMENT_SCOPE_MISSING';
const SOLVER_V4_URL = process.env.SOLVER_V4_URL || 'http://localhost:5005';
const SOLVER_REPAIR_STRATEGY =
  'Local assignment-only repair: release affected personnel assignments, keep replacements inside the original employee team scope, limit solver_v4 to affected operation dates, omit shift-level rescheduling inputs, add temporary employee unavailable period in-memory, filter candidates with existing assignment conflicts, and call solver_v4 preview-only.';

const employeeDepartmentSelectSql = `
  CASE
    WHEN u1.unit_type = 'TEAM' THEN u1.id
    WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u2.unit_type = 'TEAM' THEN u2.id
    ELSE NULL
  END AS department_id,
  CASE
    WHEN u1.unit_type = 'TEAM' THEN u1.unit_name
    WHEN u1.unit_type IN ('GROUP', 'SHIFT') AND u2.unit_type = 'TEAM' THEN u2.unit_name
    ELSE NULL
  END AS department_name
`;

const toMysqlDateTime = (value: Dayjs): string => value.format(MYSQL_DATETIME_FORMAT);

const toIso = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  return dayjs(value).toISOString();
};

const toDateString = (value: string | Date): string => dayjs(value).format('YYYY-MM-DD');

const overlaps = (startA: Dayjs, endA: Dayjs, startB: Dayjs, endB: Dayjs): boolean =>
  startA.isBefore(endB) && endA.isAfter(startB);

const uniq = <T>(items: T[]): T[] => Array.from(new Set(items));

const createVacancyId = (assignmentId: number, positionNumber: number): string =>
  `vacancy-${assignmentId}-${positionNumber}`;

const isViableCandidate = (candidate: ReplacementCandidateDto): boolean =>
  candidate.sameDepartment
  && candidate.recommendationLevel !== 'RISKY'
  && !candidate.hasTimeConflict
  && !candidate.hasUnavailabilityConflict;

export class RosterExceptionPreviewService {
  static async previewEmployeeUnavailable(
    request: RosterExceptionPreviewRequest,
  ): Promise<RosterExceptionPreviewResponse> {
    const normalized = this.validateRequest(request);
    const {
      employeeIds,
      windowStart,
      windowEnd,
      repairMode,
      previewMode,
      protectLockedAssignments,
      protectDepartmentBoundary,
      allowOvertimeSuggestions,
    } = normalized;

    const employees = await this.fetchEmployees(employeeIds);
    if (employees.length !== employeeIds.length) {
      throw new RosterExceptionPreviewError('EMPLOYEE_NOT_FOUND', 'Employee not found', 404);
    }
    const employeesById = new Map(employees.map((employee) => [Number(employee.id), employee]));
    const employee = employeesById.get(employeeIds[0]) ?? employees[0];

    const [impactedShiftPlanGroups, assignmentRowGroups] = await Promise.all([
      Promise.all(employeeIds.map((employeeId) => this.fetchImpactedShiftPlans(employeeId, windowStart, windowEnd))),
      Promise.all(employeeIds.map((employeeId) => this.fetchImpactedAssignments(employeeId, windowStart, windowEnd))),
    ]);
    const impactedShiftPlans = impactedShiftPlanGroups.flat();
    const assignmentRows = assignmentRowGroups.flat();

    const impactedAssignments = assignmentRows.map(this.mapAssignment);
    const operationIds = uniq(assignmentRows.map((row) => Number(row.operation_id)));
    const requirementRows = await this.fetchQualificationRequirements(operationIds);
    const requirementsByOperationPosition = this.groupRequirements(requirementRows);

    const vacancies = impactedAssignments.map((assignment) => {
      const source = assignmentRows.find((row) => Number(row.assignment_id) === assignment.assignmentId)!;
      const requirements = requirementsByOperationPosition.get(this.requirementKey(
        Number(source.operation_id),
        assignment.positionNumber,
      )) ?? [];
      const isProtectedLocked = Boolean(protectLockedAssignments && assignment.isLocked);

      return {
        vacancyId: createVacancyId(assignment.assignmentId, assignment.positionNumber),
        batchOperationPlanId: assignment.batchOperationPlanId,
        batchCode: assignment.batchCode,
        operationName: assignment.operationName,
        plannedStart: assignment.plannedStart,
        plannedEnd: assignment.plannedEnd,
        role: assignment.role,
        positionNumber: assignment.positionNumber,
        requiredQualificationIds: requirements.map((item) => Number(item.qualification_id)),
        requiredQualificationNames: requirements.map((item) => String(item.qualification_name)),
        ...(isProtectedLocked ? { hardToCoverReason: 'PROTECTED_LOCKED_ASSIGNMENT' } : {}),
      };
    });

    const warnings = this.buildVacancyWarnings(vacancies, assignmentRows);
    const replacementCandidates = await this.buildReplacementCandidates({
      exceptionEmployeeIds: employeeIds,
      employeesById,
      assignmentRows,
      vacancies,
      requirementsByOperationPosition,
      windowStart,
      windowEnd,
      protectLockedAssignments,
    });

    const uncoveredVacancies = vacancies.filter((vacancy) => {
      if (vacancy.hardToCoverReason === 'PROTECTED_LOCKED_ASSIGNMENT') return true;
      return !replacementCandidates.some((candidate) =>
        candidate.vacancyId === vacancy.vacancyId && isViableCandidate(candidate),
      );
    });

    const coveredByCandidateCount = vacancies.length - uncoveredVacancies.length;
    const lockedAssignmentAffected = impactedAssignments.some((assignment) => assignment.isLocked);
    const candidateContention = this.hasCandidateContention(replacementCandidates);
    const riskyOnly = this.hasOnlyRiskyReplacement(vacancies, replacementCandidates);
    const missingRequirement = warnings.includes(WARNING_SKILL_REQUIREMENT_MISSING);
    const missingDepartmentScope = warnings.includes(WARNING_DEPARTMENT_SCOPE_MISSING);
    const solverRepairProposal = previewMode === 'IMPACT_ONLY'
      ? this.buildImpactOnlyProposal({
        repairMode,
        impactedAssignmentCount: impactedAssignments.length,
        vacancyCount: vacancies.length,
      })
      : await this.buildSolverRepairProposal({
        employeeIds,
        windowStart,
        windowEnd,
        repairMode,
        protectLockedAssignments,
        protectDepartmentBoundary,
        allowOvertimeSuggestions,
        assignmentRows,
        vacancies,
        requirementsByOperationPosition,
      });

    if (lockedAssignmentAffected && !warnings.includes(WARNING_LOCKED_ASSIGNMENT_AFFECTED)) {
      warnings.push(WARNING_LOCKED_ASSIGNMENT_AFFECTED);
    }
    if (candidateContention) warnings.push(WARNING_CANDIDATE_CONTENTION);
    if (riskyOnly) warnings.push(WARNING_ONLY_RISKY_REPLACEMENTS);
    if (solverRepairProposal.capabilityGaps.length > 0) warnings.push(WARNING_SOLVER_CAPABILITY_GAP);

    return {
      exceptionId: `preview-${randomUUID()}`,
      previewOnly: true,
      employee: this.mapEmployee(employee),
      employees: employees.map(this.mapEmployee),
      windowStart: request.windowStart,
      windowEnd: request.windowEnd,
      repairMode,
      protectLockedAssignments,
      protectDepartmentBoundary,
      allowOvertimeSuggestions,
      impactedShiftPlans,
      impactedAssignments,
      vacancies,
      replacementCandidates,
      uncoveredVacancies,
      solverRepairProposal,
      summary: {
        impactedAssignmentCount: impactedAssignments.length,
        impactedShiftPlanCount: impactedShiftPlans.length,
        vacancyCount: vacancies.length,
        coveredByCandidateCount,
        uncoveredCount: uncoveredVacancies.length,
        solverChangedAssignmentCount: solverRepairProposal.changedAssignmentCount,
        solverUncoveredCount: solverRepairProposal.uncoveredVacancyCount,
        overtimeRiskCount: solverRepairProposal.overtimeRiskCount,
        timeConflictCount: solverRepairProposal.timeConflictCount,
        requiresSolverRerun: uncoveredVacancies.length > 0
          || candidateContention
          || riskyOnly
          || lockedAssignmentAffected
          || solverRepairProposal.solverInvocation.called,
        requiresSupervisorAction: uncoveredVacancies.length > 0
          || lockedAssignmentAffected
          || missingRequirement
          || missingDepartmentScope
          || solverRepairProposal.supervisorAttentionItems.length > 0,
      },
      warnings: uniq(warnings),
    };
  }

  private static validateRequest(request: RosterExceptionPreviewRequest) {
    if (!request || request.exceptionType !== 'EMPLOYEE_UNAVAILABLE') {
      throw new RosterExceptionPreviewError(
        'INVALID_EXCEPTION_TYPE',
        'exceptionType must be EMPLOYEE_UNAVAILABLE',
      );
    }
    const rawEmployeeIds = Array.isArray(request.employeeIds) && request.employeeIds.length > 0
      ? request.employeeIds
      : [request.employeeId];
    const employeeIds = uniq(rawEmployeeIds.map((employeeId) => Number(employeeId)));
    if (!employeeIds.length || employeeIds.some((employeeId) => !Number.isFinite(employeeId) || employeeId <= 0)) {
      throw new RosterExceptionPreviewError('INVALID_EMPLOYEE_ID', 'employeeIds is required');
    }
    if (request.previewOnly !== true) {
      throw new RosterExceptionPreviewError('PREVIEW_ONLY_REQUIRED', 'previewOnly must be true');
    }

    const windowStart = dayjs(request.windowStart);
    const windowEnd = dayjs(request.windowEnd);
    if (!windowStart.isValid() || !windowEnd.isValid()) {
      throw new RosterExceptionPreviewError('INVALID_WINDOW', 'windowStart and windowEnd must be valid datetimes');
    }
    if (!windowStart.isBefore(windowEnd)) {
      throw new RosterExceptionPreviewError('INVALID_WINDOW', 'windowStart must be before windowEnd');
    }

    return {
      employeeIds,
      windowStart,
      windowEnd,
      repairMode: request.repairMode === 'MAX_COVERAGE' ? 'MAX_COVERAGE' as const : 'MINIMAL_CHANGE' as const,
      protectLockedAssignments: request.protectLockedAssignments !== false,
      protectDepartmentBoundary: true,
      allowOvertimeSuggestions: request.allowOvertimeSuggestions === true,
      previewMode: request.previewMode === 'IMPACT_ONLY' ? 'IMPACT_ONLY' as const : 'SOLVER_REPAIR' as const,
    };
  }

  private static buildImpactOnlyProposal(input: {
    repairMode: RosterRepairMode;
    impactedAssignmentCount: number;
    vacancyCount: number;
  }): SolverRepairProposalDto {
    const hasImpact = input.impactedAssignmentCount > 0 || input.vacancyCount > 0;

    return {
      proposalId: `impact-${randomUUID()}`,
      previewOnly: true,
      status: hasImpact ? 'IMPACT_ONLY' : 'NO_IMPACT',
      repairMode: input.repairMode,
      coverageRate: hasImpact ? 0 : 100,
      originalAssignmentStillValidCount: 0,
      changedAssignmentCount: 0,
      uncoveredVacancyCount: 0,
      overtimeRiskCount: 0,
      timeConflictCount: 0,
      solverRequestId: null,
      solverStatus: null,
      solverInvocation: {
        called: false,
        endpoint: `${SOLVER_V4_URL}/api/v4/solve`,
        mode: 'solver_v4_preview_adapter',
      },
      localRepairStrategy: 'Impact analysis only: identify affected shift plans, affected personnel assignments, and released role demand before supervisor requests solver_v4 repair.',
      assignmentChanges: [],
      uncoveredVacancies: [],
      supervisorAttentionItems: hasImpact
        ? ['已完成影响分析。请主管确认影响范围后再生成 solver_v4 修复方案。']
        : [],
      capabilityGaps: [],
      applyAllowed: false,
      applyDisabledReason: hasImpact
        ? '先生成 Solver 修复方案'
        : '当前时间窗没有受影响 assignment，无需应用。',
    };
  }

  private static async fetchEmployees(employeeIds: number[]): Promise<EmployeeRow[]> {
    const ids = uniq(employeeIds.map(Number).filter((id) => Number.isFinite(id) && id > 0));
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute<EmployeeRow[]>(
      `SELECT e.id,
              e.employee_code,
              e.employee_name,
              e.unit_id,
              ${employeeDepartmentSelectSql}
       FROM employees e
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       WHERE e.id IN (${placeholders})
       ORDER BY FIELD(e.id, ${placeholders})`,
      [...ids, ...ids],
    );
    return rows;
  }

  private static async fetchImpactedShiftPlans(
    employeeId: number,
    windowStart: Dayjs,
    windowEnd: Dayjs,
  ): Promise<ImpactedShiftPlanDto[]> {
    const [rows] = await pool.execute<ShiftPlanRow[]>(
      `SELECT esp.id,
              esp.employee_id,
              esp.plan_date,
              sd.shift_code,
              sd.start_time,
              sd.end_time,
              esp.plan_state,
              IFNULL(esp.is_locked, 0) AS is_locked
       FROM employee_shift_plans esp
       LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE esp.employee_id = ?
         AND esp.plan_state <> 'VOID'
         AND esp.plan_date BETWEEN ? AND ?
       ORDER BY esp.plan_date ASC, esp.id ASC`,
      [
        employeeId,
        windowStart.subtract(1, 'day').format('YYYY-MM-DD'),
        windowEnd.add(1, 'day').format('YYYY-MM-DD'),
      ],
    );

    return rows
      .map((row) => {
        const bounds = this.resolveShiftBounds(row.plan_date, row.start_time, row.end_time);
        return { row, bounds };
      })
      .filter(({ bounds }) => Boolean(bounds && overlaps(bounds.start, bounds.end, windowStart, windowEnd)))
      .map(({ row, bounds }) => ({
        shiftPlanId: Number(row.id),
        employeeId: Number(row.employee_id),
        planDate: toDateString(row.plan_date),
        shiftCode: row.shift_code ?? null,
        shiftStart: bounds ? bounds.start.toISOString() : null,
        shiftEnd: bounds ? bounds.end.toISOString() : null,
        planState: String(row.plan_state),
        isLocked: Boolean(row.is_locked),
      }));
  }

  private static async fetchImpactedAssignments(
    employeeId: number,
    windowStart: Dayjs,
    windowEnd: Dayjs,
  ): Promise<AssignmentRow[]> {
    const [rows] = await pool.execute<AssignmentRow[]>(
      `SELECT bpa.id AS assignment_id,
              bpa.batch_operation_plan_id,
              bop.batch_plan_id,
              bpa.employee_id,
              e.employee_code,
              e.employee_name,
              ${employeeDepartmentSelectSql.replace(/ AS department_/g, ' AS employee_department_')},
              IFNULL(bpa.position_number, 1) AS position_number,
              bpa.role,
              IFNULL(bpa.is_locked, 0) AS assignment_locked,
              bop.operation_id,
              IFNULL(bop.is_locked, 0) AS operation_locked,
              bop.planned_start_datetime,
              bop.planned_end_datetime,
              pbp.batch_code,
              o.operation_name,
              bpa.shift_plan_id,
              esp.shift_id,
              sd.shift_code,
              sd.start_time AS shift_start_time,
              sd.end_time AS shift_end_time,
              esp.plan_category,
              esp.plan_date,
              IFNULL(esp.is_locked, 0) AS shift_plan_locked
       FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bop.id = bpa.batch_operation_plan_id
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       JOIN operations o ON o.id = bop.operation_id
       JOIN employees e ON e.id = bpa.employee_id
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       LEFT JOIN employee_shift_plans esp ON esp.id = bpa.shift_plan_id
       LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE bpa.employee_id = ?
         AND IFNULL(bpa.assignment_status, 'PLANNED') <> 'CANCELLED'
         AND bop.planned_start_datetime < ?
         AND bop.planned_end_datetime > ?
       ORDER BY bop.planned_start_datetime ASC, bpa.id ASC`,
      [employeeId, toMysqlDateTime(windowEnd), toMysqlDateTime(windowStart)],
    );

    return rows;
  }

  private static async fetchQualificationRequirements(
    operationIds: number[],
  ): Promise<QualificationRequirementRow[]> {
    if (!operationIds.length) return [];
    const placeholders = operationIds.map(() => '?').join(',');
    const [rows] = await pool.execute<QualificationRequirementRow[]>(
      `SELECT oqr.operation_id,
              oqr.position_number,
              oqr.qualification_id,
              q.qualification_name,
              COALESCE(oqr.required_level, oqr.min_level, 1) AS required_level,
              IFNULL(oqr.is_mandatory, 1) AS is_mandatory
       FROM operation_qualification_requirements oqr
       JOIN qualifications q ON q.id = oqr.qualification_id
       WHERE oqr.operation_id IN (${placeholders})
       ORDER BY oqr.operation_id, oqr.position_number, oqr.qualification_id`,
      operationIds,
    );
    return rows;
  }

  private static async buildReplacementCandidates(input: {
    exceptionEmployeeIds: number[];
    employeesById: Map<number, EmployeeRow>;
    assignmentRows: AssignmentRow[];
    vacancies: RosterVacancyDto[];
    requirementsByOperationPosition: Map<string, QualificationRequirementRow[]>;
    windowStart: Dayjs;
    windowEnd: Dayjs;
    protectLockedAssignments: boolean;
  }): Promise<ReplacementCandidateDto[]> {
    if (!input.vacancies.length) return [];

    const [employees, qualifications, unavailabilityRows, assignmentRows, shiftRows] = await Promise.all([
      this.fetchCandidateEmployees(input.exceptionEmployeeIds),
      this.fetchCandidateQualifications(),
      this.fetchCandidateUnavailability(input.windowStart, input.windowEnd),
      this.fetchCandidateAssignments(input.windowStart, input.windowEnd),
      this.fetchCandidateShifts(input.windowStart, input.windowEnd),
    ]);

    const qualificationMap = this.groupEmployeeQualifications(qualifications);
    const unavailabilityMap = this.groupByEmployee(unavailabilityRows);
    const assignmentMap = this.groupByEmployee(assignmentRows);
    const shiftMap = this.groupByEmployee(shiftRows);
    const operationByVacancyId = new Map(
      input.assignmentRows.map((row) => [
        createVacancyId(Number(row.assignment_id), Number(row.position_number ?? 1)),
        row,
      ]),
    );

    const candidates: ReplacementCandidateDto[] = [];
    for (const vacancy of input.vacancies) {
      const sourceAssignment = operationByVacancyId.get(vacancy.vacancyId);
      if (!sourceAssignment) continue;
      if (input.protectLockedAssignments && vacancy.hardToCoverReason === 'PROTECTED_LOCKED_ASSIGNMENT') {
        continue;
      }

      const requirements = input.requirementsByOperationPosition.get(this.requirementKey(
        Number(sourceAssignment.operation_id),
        vacancy.positionNumber,
      )) ?? [];
      const missingRequirements = requirements.length === 0;
      const opStart = dayjs(sourceAssignment.planned_start_datetime);
      const opEnd = dayjs(sourceAssignment.planned_end_datetime);
      const sourceEmployee = input.employeesById.get(Number(sourceAssignment.employee_id));
      const sourceDepartmentId = sourceAssignment.employee_department_id
        ? Number(sourceAssignment.employee_department_id)
        : sourceEmployee?.department_id
          ? Number(sourceEmployee.department_id)
          : null;

      for (const employee of employees) {
        const candidateDepartmentId = employee.department_id ? Number(employee.department_id) : null;
        const sameDepartment = Boolean(
          sourceDepartmentId
          && candidateDepartmentId
          && sourceDepartmentId === candidateDepartmentId,
        );
        if (!sameDepartment) continue;

        const employeeQualifications = qualificationMap.get(Number(employee.id)) ?? [];
        const qualificationResult = this.evaluateQualification(employeeQualifications, requirements);
        const unavailabilityConflict = (unavailabilityMap.get(Number(employee.id)) ?? []).some((row) =>
          overlaps(opStart, opEnd, dayjs(row.start_datetime), dayjs(row.end_datetime)),
        );
        const timeConflictAssignments = assignmentMap.get(Number(employee.id)) ?? [];
        const hasTimeConflict = timeConflictAssignments.some((row) =>
          overlaps(opStart, opEnd, dayjs(row.planned_start_datetime), dayjs(row.planned_end_datetime)),
        );
        const currentAssignmentCountInWindow = timeConflictAssignments.length;
        const sameShift = this.hasSameShift(
          shiftMap.get(Number(employee.id)) ?? [],
          sourceAssignment,
        );
        const sameOrg = Boolean(
          employee.unit_id
          && sourceEmployee?.unit_id
          && Number(employee.unit_id) === Number(sourceEmployee.unit_id),
        );

        const warnings = this.buildCandidateWarnings({
          missingRequirements,
          qualificationMatch: qualificationResult.matches,
          hasTimeConflict,
          hasUnavailabilityConflict: unavailabilityConflict,
        });
        const score = this.scoreCandidate({
          qualificationMatch: qualificationResult.matches,
          sameShift,
          sameOrg,
          hasTimeConflict,
          hasUnavailabilityConflict: unavailabilityConflict,
          currentAssignmentCountInWindow,
          insufficientQualification: requirements.length > 0 && !qualificationResult.matches,
        });
        const recommendationLevel = this.recommendationLevel({
          missingRequirements,
          qualificationMatch: qualificationResult.matches,
          hasTimeConflict,
          hasUnavailabilityConflict: unavailabilityConflict,
        });

        candidates.push({
          vacancyId: vacancy.vacancyId,
          employeeId: Number(employee.id),
          employeeCode: String(employee.employee_code),
          employeeName: String(employee.employee_name),
          departmentId: candidateDepartmentId,
          departmentName: employee.department_name ? String(employee.department_name) : null,
          sameDepartment,
          qualificationMatch: qualificationResult.matches,
          qualificationLevelSummary: qualificationResult.summary,
          sameShift,
          hasTimeConflict,
          hasUnavailabilityConflict: unavailabilityConflict,
          currentAssignmentCountInWindow,
          score,
          recommendationLevel,
          warnings,
        });
      }
    }

    return candidates.sort((a, b) => {
      if (a.vacancyId !== b.vacancyId) return a.vacancyId.localeCompare(b.vacancyId);
      return b.score - a.score || a.employeeName.localeCompare(b.employeeName);
    });
  }

  private static async fetchCandidateEmployees(exceptionEmployeeIds: number[]): Promise<EmployeeRow[]> {
    const ids = uniq(exceptionEmployeeIds.map(Number).filter((id) => Number.isFinite(id) && id > 0));
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute<EmployeeRow[]>(
      `SELECT e.id,
              e.employee_code,
              e.employee_name,
              e.unit_id,
              ${employeeDepartmentSelectSql}
       FROM employees e
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       WHERE e.employment_status = 'ACTIVE'
         ${ids.length ? `AND e.id NOT IN (${placeholders})` : ''}
       ORDER BY e.employee_code ASC, e.id ASC`,
      ids,
    );
    return rows;
  }

  private static async fetchCandidateQualifications(): Promise<EmployeeQualificationRow[]> {
    const [rows] = await pool.execute<EmployeeQualificationRow[]>(
      `SELECT eq.employee_id,
              eq.qualification_id,
              q.qualification_name,
              eq.qualification_level
       FROM employee_qualifications eq
       JOIN employees e ON e.id = eq.employee_id
       JOIN qualifications q ON q.id = eq.qualification_id
       WHERE e.employment_status = 'ACTIVE'`,
    );
    return rows;
  }

  private static async fetchCandidateUnavailability(
    windowStart: Dayjs,
    windowEnd: Dayjs,
  ): Promise<UnavailabilityRow[]> {
    const [rows] = await pool.execute<UnavailabilityRow[]>(
      `SELECT employee_id, start_datetime, end_datetime
       FROM employee_unavailability
       WHERE start_datetime < ?
         AND end_datetime > ?`,
      [toMysqlDateTime(windowEnd), toMysqlDateTime(windowStart)],
    );
    return rows;
  }

  private static async fetchCandidateAssignments(
    windowStart: Dayjs,
    windowEnd: Dayjs,
  ): Promise<AssignmentRow[]> {
    const [rows] = await pool.execute<AssignmentRow[]>(
      `SELECT bpa.id AS assignment_id,
              bpa.batch_operation_plan_id,
              bop.batch_plan_id,
              bpa.employee_id,
              e.employee_code,
              e.employee_name,
              ${employeeDepartmentSelectSql.replace(/ AS department_/g, ' AS employee_department_')},
              IFNULL(bpa.position_number, 1) AS position_number,
              bpa.role,
              IFNULL(bpa.is_locked, 0) AS assignment_locked,
              bop.operation_id,
              IFNULL(bop.is_locked, 0) AS operation_locked,
              bop.planned_start_datetime,
              bop.planned_end_datetime,
              pbp.batch_code,
              o.operation_name,
              bpa.shift_plan_id,
              esp.shift_id,
              sd.shift_code,
              sd.start_time AS shift_start_time,
              sd.end_time AS shift_end_time,
              esp.plan_category,
              esp.plan_date,
              IFNULL(esp.is_locked, 0) AS shift_plan_locked
       FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bop.id = bpa.batch_operation_plan_id
       JOIN production_batch_plans pbp ON pbp.id = bop.batch_plan_id
       JOIN operations o ON o.id = bop.operation_id
       JOIN employees e ON e.id = bpa.employee_id
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       LEFT JOIN employee_shift_plans esp ON esp.id = bpa.shift_plan_id
       LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE IFNULL(bpa.assignment_status, 'PLANNED') <> 'CANCELLED'
         AND bop.planned_start_datetime < ?
         AND bop.planned_end_datetime > ?`,
      [toMysqlDateTime(windowEnd), toMysqlDateTime(windowStart)],
    );
    return rows;
  }

  private static async fetchCandidateShifts(
    windowStart: Dayjs,
    windowEnd: Dayjs,
  ): Promise<CandidateShiftRow[]> {
    const [rows] = await pool.execute<CandidateShiftRow[]>(
      `SELECT esp.id AS shift_plan_id,
              esp.employee_id,
              esp.shift_id,
              esp.plan_date,
              esp.plan_category,
              sd.shift_code,
              sd.start_time,
              sd.end_time
       FROM employee_shift_plans esp
       LEFT JOIN shift_definitions sd ON sd.id = esp.shift_id
       WHERE esp.plan_state <> 'VOID'
         AND esp.plan_date BETWEEN ? AND ?`,
      [
        windowStart.subtract(1, 'day').format('YYYY-MM-DD'),
        windowEnd.add(1, 'day').format('YYYY-MM-DD'),
      ],
    );
    return rows;
  }

  private static async fetchActiveEmployeeDepartmentScopes(): Promise<Map<number, Pick<EmployeeRow, 'department_id' | 'department_name'>>> {
    const [rows] = await pool.execute<EmployeeRow[]>(
      `SELECT e.id,
              e.employee_code,
              e.employee_name,
              e.unit_id,
              ${employeeDepartmentSelectSql}
       FROM employees e
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       WHERE e.employment_status = 'ACTIVE'`,
    );
    return new Map(rows.map((row) => [
      Number(row.id),
      {
        department_id: row.department_id ? Number(row.department_id) : null,
        department_name: row.department_name ? String(row.department_name) : null,
      },
    ]));
  }

  private static groupRequirements(rows: QualificationRequirementRow[]) {
    const map = new Map<string, QualificationRequirementRow[]>();
    rows.forEach((row) => {
      const key = this.requirementKey(Number(row.operation_id), Number(row.position_number));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return map;
  }

  private static groupEmployeeQualifications(rows: EmployeeQualificationRow[]) {
    const map = new Map<number, EmployeeQualificationRow[]>();
    rows.forEach((row) => {
      const employeeId = Number(row.employee_id);
      if (!map.has(employeeId)) map.set(employeeId, []);
      map.get(employeeId)!.push(row);
    });
    return map;
  }

  private static groupByEmployee<T extends { employee_id: number }>(rows: T[]) {
    const map = new Map<number, T[]>();
    rows.forEach((row) => {
      const employeeId = Number(row.employee_id);
      if (!map.has(employeeId)) map.set(employeeId, []);
      map.get(employeeId)!.push(row);
    });
    return map;
  }

  private static evaluateQualification(
    employeeQualifications: EmployeeQualificationRow[],
    requirements: QualificationRequirementRow[],
  ): { matches: boolean; summary: string } {
    if (!requirements.length) {
      return { matches: false, summary: '未配置岗位资质要求' };
    }

    const parts = requirements.map((requirement) => {
      const employeeQualification = employeeQualifications.find((item) =>
        Number(item.qualification_id) === Number(requirement.qualification_id),
      );
      const actualLevel = employeeQualification ? Number(employeeQualification.qualification_level) : 0;
      const requiredLevel = Number(requirement.required_level ?? 1);
      return {
        text: `${requirement.qualification_name}: ${actualLevel}/${requiredLevel}`,
        ok: actualLevel >= requiredLevel || !Boolean(requirement.is_mandatory),
      };
    });

    return {
      matches: parts.every((part) => part.ok),
      summary: parts.map((part) => part.text).join('; '),
    };
  }

  private static scoreCandidate(input: {
    qualificationMatch: boolean;
    sameShift: boolean;
    sameOrg: boolean;
    hasTimeConflict: boolean;
    hasUnavailabilityConflict: boolean;
    currentAssignmentCountInWindow: number;
    insufficientQualification: boolean;
  }): number {
    let score = 0;
    if (input.qualificationMatch) score += 50;
    if (input.sameShift) score += 20;
    if (input.sameOrg) score += 10;
    if (input.hasTimeConflict) score -= 50;
    if (input.hasUnavailabilityConflict) score -= 50;
    if (input.insufficientQualification) score -= 20;
    score -= Math.min(input.currentAssignmentCountInWindow, 5) * 10;
    return score;
  }

  private static recommendationLevel(input: {
    missingRequirements: boolean;
    qualificationMatch: boolean;
    hasTimeConflict: boolean;
    hasUnavailabilityConflict: boolean;
  }): ReplacementRecommendationLevel {
    if (input.hasTimeConflict || input.hasUnavailabilityConflict || (!input.missingRequirements && !input.qualificationMatch)) {
      return 'RISKY';
    }
    if (input.missingRequirements) return 'POSSIBLE';
    return 'RECOMMENDED';
  }

  private static buildCandidateWarnings(input: {
    missingRequirements: boolean;
    qualificationMatch: boolean;
    hasTimeConflict: boolean;
    hasUnavailabilityConflict: boolean;
  }): string[] {
    const warnings: string[] = [];
    if (input.missingRequirements) warnings.push(WARNING_SKILL_REQUIREMENT_MISSING);
    if (!input.missingRequirements && !input.qualificationMatch) warnings.push('QUALIFICATION_INSUFFICIENT');
    if (input.hasTimeConflict) warnings.push('TIME_CONFLICT');
    if (input.hasUnavailabilityConflict) warnings.push('UNAVAILABILITY_CONFLICT');
    return warnings;
  }

  private static buildVacancyWarnings(
    vacancies: RosterVacancyDto[],
    assignmentRows: AssignmentRow[],
  ): string[] {
    const warnings: string[] = [];
    if (vacancies.some((vacancy) => vacancy.requiredQualificationIds.length === 0)) {
      warnings.push(WARNING_SKILL_REQUIREMENT_MISSING);
    }
    if (assignmentRows.some((row) =>
      Boolean(row.assignment_locked) || Boolean(row.operation_locked) || Boolean(row.shift_plan_locked),
    )) {
      warnings.push(WARNING_LOCKED_ASSIGNMENT_AFFECTED);
    }
    if (assignmentRows.some((row) => !row.employee_department_id)) {
      warnings.push(WARNING_DEPARTMENT_SCOPE_MISSING);
    }
    return warnings;
  }

  private static hasCandidateContention(candidates: ReplacementCandidateDto[]): boolean {
    const viableByEmployee = new Map<number, Set<string>>();
    candidates.filter(isViableCandidate).forEach((candidate) => {
      if (!viableByEmployee.has(candidate.employeeId)) {
        viableByEmployee.set(candidate.employeeId, new Set());
      }
      viableByEmployee.get(candidate.employeeId)!.add(candidate.vacancyId);
    });
    return Array.from(viableByEmployee.values()).some((vacancies) => vacancies.size > 1);
  }

  private static hasOnlyRiskyReplacement(
    vacancies: RosterVacancyDto[],
    candidates: ReplacementCandidateDto[],
  ): boolean {
    return vacancies.some((vacancy) => {
      const vacancyCandidates = candidates.filter((candidate) => candidate.vacancyId === vacancy.vacancyId);
      if (!vacancyCandidates.length) return false;
      return vacancyCandidates.every((candidate) => candidate.recommendationLevel === 'RISKY');
    });
  }

  private static hasSameShift(candidateShifts: CandidateShiftRow[], sourceAssignment: AssignmentRow): boolean {
    if (!sourceAssignment.shift_id || !sourceAssignment.plan_date) return false;
    const sourcePlanDate = toDateString(sourceAssignment.plan_date);
    return candidateShifts.some((shift) =>
      Number(shift.shift_id) === Number(sourceAssignment.shift_id)
      && toDateString(shift.plan_date) === sourcePlanDate,
    );
  }

  private static async buildSolverRepairProposal(input: {
    employeeIds: number[];
    windowStart: Dayjs;
    windowEnd: Dayjs;
    repairMode: RosterRepairMode;
    protectLockedAssignments: boolean;
    protectDepartmentBoundary: boolean;
    allowOvertimeSuggestions: boolean;
    assignmentRows: AssignmentRow[];
    vacancies: RosterVacancyDto[];
    requirementsByOperationPosition: Map<string, QualificationRequirementRow[]>;
  }): Promise<SolverRepairProposalDto> {
    const endpoint = `${SOLVER_V4_URL}/api/v4/solve`;
    const proposalId = `repair-${randomUUID()}`;
    const exceptionEmployeeIds = new Set(input.employeeIds.map(Number));
    const base = (patch: Partial<SolverRepairProposalDto>): SolverRepairProposalDto => {
      const assignmentChanges = patch.assignmentChanges ?? [];
      const uncoveredVacancies = patch.uncoveredVacancies ?? [];
      const overtimeRiskCount = assignmentChanges.filter((item) => item.hasOvertimeRisk).length;
      const timeConflictCount = assignmentChanges.filter((item) => item.hasTimeConflict).length;
      const totalDemand = assignmentChanges.length + uncoveredVacancies.length;
      const coverageRate = totalDemand > 0 ? Math.round((assignmentChanges.length / totalDemand) * 1000) / 10 : 100;
      const applyAllowed = assignmentChanges.some((item) => item.canApply);

      return {
        proposalId,
        previewOnly: true,
        status: patch.status ?? 'DATA_GAP',
        repairMode: input.repairMode,
        coverageRate: patch.coverageRate ?? coverageRate,
        originalAssignmentStillValidCount: patch.originalAssignmentStillValidCount ?? 0,
        changedAssignmentCount: patch.changedAssignmentCount ?? assignmentChanges.length,
        uncoveredVacancyCount: patch.uncoveredVacancyCount ?? uncoveredVacancies.length,
        overtimeRiskCount: patch.overtimeRiskCount ?? overtimeRiskCount,
        timeConflictCount: patch.timeConflictCount ?? timeConflictCount,
        solverRequestId: patch.solverRequestId ?? null,
        solverStatus: patch.solverStatus ?? null,
        solverInvocation: patch.solverInvocation ?? {
          called: false,
          endpoint,
          mode: 'solver_v4_preview_adapter',
        },
        localRepairStrategy: SOLVER_REPAIR_STRATEGY,
        assignmentChanges,
        uncoveredVacancies,
        supervisorAttentionItems: patch.supervisorAttentionItems ?? [],
        capabilityGaps: patch.capabilityGaps ?? [],
        applyAllowed,
        ...(patch.applyDisabledReason || !applyAllowed
          ? { applyDisabledReason: patch.applyDisabledReason ?? 'No applyable assignment-only personnel changes in this proposal.' }
          : {}),
      };
    };

    if (!input.assignmentRows.length) {
      return base({
        status: 'NO_IMPACT',
        supervisorAttentionItems: ['DATA GAP: 当前时间窗没有受影响 batch_personnel_assignments，未生成 solver repair demand。'],
        applyDisabledReason: 'No impacted personnel assignments.',
      });
    }

    const releasableRows = input.assignmentRows.filter((row) =>
      !(input.protectLockedAssignments && this.isAssignmentLocked(row)),
    );
    const protectedRows = input.assignmentRows.filter((row) =>
      input.protectLockedAssignments && this.isAssignmentLocked(row),
    );
    const protectedUncovered = protectedRows.map((row) =>
      this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'PROTECTED_LOCKED_ASSIGNMENT'),
    );

    if (!releasableRows.length) {
      return base({
        status: 'UNCOVERED',
        uncoveredVacancies: protectedUncovered,
        supervisorAttentionItems: ['受影响 assignment 均为 locked assignment；已按保护设置冻结，未释放给 solver_v4。'],
        applyDisabledReason: 'All impacted assignments are locked and protected.',
      });
    }

    const rowsMissingDepartment = input.protectDepartmentBoundary
      ? releasableRows.filter((row) => !row.employee_department_id)
      : [];
    if (rowsMissingDepartment.length > 0) {
      return base({
        status: 'DATA_GAP',
        uncoveredVacancies: [
          ...protectedUncovered,
          ...releasableRows.map((row) => this.mapUncoveredFromAssignment(
            row,
            input.requirementsByOperationPosition,
            row.employee_department_id ? 'DEPARTMENT_BOUNDARY_PROTECTED' : 'DATA GAP: source employee department missing',
          )),
        ],
        supervisorAttentionItems: [
          'DATA GAP: 受影响员工缺少 Team 级部门归属，已按部门边界保护阻止生成跨部门替换 proposal。',
        ],
        applyDisabledReason: 'Source employee team scope is required for same-department repair.',
      });
    }

    const batchIds = uniq(releasableRows.map((row) => Number(row.batch_plan_id)).filter((id) => Number.isFinite(id) && id > 0));
    if (!batchIds.length) {
      return base({
        status: 'DATA_GAP',
        uncoveredVacancies: [
          ...protectedUncovered,
          ...releasableRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'DATA_GAP: batch_plan_id missing')),
        ],
        supervisorAttentionItems: ['DATA GAP: 受影响 assignment 缺少 batch_plan_id，无法组装 solver_v4 输入。'],
        applyDisabledReason: 'Missing batch ids for affected assignments.',
      });
    }

    const opStarts = releasableRows.map((row) => dayjs(row.planned_start_datetime)).filter((value) => value.isValid());
    const opEnds = releasableRows.map((row) => dayjs(row.planned_end_datetime)).filter((value) => value.isValid());
    const localWindowStart = (opStarts.length > 0 ? opStarts : [input.windowStart])
      .reduce((min, current) => (current.isBefore(min) ? current : min), opStarts[0] ?? input.windowStart);
    const localWindowEnd = (opEnds.length > 0 ? opEnds : [input.windowEnd])
      .reduce((max, current) => (current.isAfter(max) ? current : max), opEnds[0] ?? input.windowEnd);
    const assembleStart = localWindowStart.subtract(1, 'day').format('YYYY-MM-DD');
    const assembleEnd = localWindowEnd.add(1, 'day').format('YYYY-MM-DD');
    const solveRange = {
      start_date: localWindowStart.format('YYYY-MM-DD'),
      end_date: localWindowEnd.format('YYYY-MM-DD'),
    };

    let assembled: V4SolverRequest;
    try {
      assembled = await DataAssemblerV4.assemble(
        assembleStart,
        assembleEnd,
        batchIds,
        [],
        solveRange,
        {
          enable_standalone_tasks: false,
          allow_position_vacancy: true,
        },
      );
    } catch (error: any) {
      return base({
        status: 'DATA_GAP',
        uncoveredVacancies: [
          ...protectedUncovered,
          ...releasableRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'DATA_GAP: solver input assembly failed')),
        ],
        capabilityGaps: [{
          code: 'PREVIEW_DATA_ASSEMBLY_GAP',
          message: 'Preview adapter could not assemble solver_v4 input from current database state.',
          detail: error?.message ?? String(error),
        }],
        applyDisabledReason: 'Solver input assembly failed.',
      });
    }

    const releasedAssignmentIds = new Set(releasableRows.map((row) => Number(row.assignment_id)));
    const releasedPositionsByOperation = new Map<number, Set<number>>();
    releasableRows.forEach((row) => {
      const operationPlanId = Number(row.batch_operation_plan_id);
      if (!releasedPositionsByOperation.has(operationPlanId)) {
        releasedPositionsByOperation.set(operationPlanId, new Set<number>());
      }
      releasedPositionsByOperation.get(operationPlanId)!.add(Number(row.position_number ?? 1));
    });

    const [existingAssignments, candidateShifts, employeeDepartmentById] = await Promise.all([
      this.fetchCandidateAssignments(localWindowStart, localWindowEnd),
      this.fetchCandidateShifts(localWindowStart, localWindowEnd),
      this.fetchActiveEmployeeDepartmentScopes(),
    ]);
    const existingAssignmentsByEmployee = this.groupByEmployee(existingAssignments);
    const candidateShiftsByEmployee = this.groupByEmployee(candidateShifts);

    const capabilityGaps: SolverCapabilityGapDto[] = [{
      code: 'IN_WINDOW_FREEZE_ADAPTER_SCOPE',
      message: 'solver_v4 当前没有任意 in-window frozen assignment override；adapter 通过只释放受影响岗位、过滤既有冲突来冻结未受影响 assignment。',
    }];
    if (input.repairMode === 'MINIMAL_CHANGE') {
      capabilityGaps.push({
        code: 'MINIMIZE_CHANGE_OBJECTIVE_ADAPTER_SCOPE',
        message: 'solver_v4 当前没有显式人员变更最小化目标；最小变更模式通过局部 demand scope 实现，只允许受影响 assignment 进入求解。',
      });
    }

    const localDemandRows = new Map(releasableRows.map((row) => [
      this.requirementKey(Number(row.batch_operation_plan_id), Number(row.position_number ?? 1)),
      row,
    ]));
    const localOperationDemands = (assembled.operation_demands ?? [])
      .filter((demand) => releasedPositionsByOperation.has(Number(demand.operation_plan_id)))
      .map((demand) => {
        const releasedPositions = releasedPositionsByOperation.get(Number(demand.operation_plan_id)) ?? new Set<number>();
        const positionQualifications = (demand.position_qualifications ?? [])
          .filter((position) => releasedPositions.has(Number(position.position_number)))
          .map((position) => {
            const sourceRow = localDemandRows.get(this.requirementKey(
              Number(demand.operation_plan_id),
              Number(position.position_number),
            ));
            const opStart = dayjs(sourceRow?.planned_start_datetime ?? demand.planned_start);
            const opEnd = dayjs(sourceRow?.planned_end_datetime ?? demand.planned_end);
            return {
              ...position,
              candidate_employee_ids: this.filterSolverCandidates({
                candidateEmployeeIds: position.candidate_employee_ids ?? [],
                exceptionEmployeeIds,
                sourceDepartmentId: sourceRow?.employee_department_id ? Number(sourceRow.employee_department_id) : null,
                opStart,
                opEnd,
                releasedAssignmentIds,
                existingAssignmentsByEmployee,
                candidateShiftsByEmployee,
                employeeDepartmentById,
                protectDepartmentBoundary: input.protectDepartmentBoundary,
                allowOvertimeSuggestions: input.allowOvertimeSuggestions,
              }),
            };
          });

        return {
          ...demand,
          required_people: positionQualifications.length,
          position_qualifications: positionQualifications,
        };
      })
      .filter((demand) => demand.position_qualifications.length > 0);

    const localDemandKeys = new Set(localOperationDemands.flatMap((demand) =>
      (demand.position_qualifications ?? []).map((position) =>
        this.requirementKey(Number(demand.operation_plan_id), Number(position.position_number)),
      ),
    ));
    const missingDemandRows = releasableRows.filter((row) =>
      !localDemandKeys.has(this.requirementKey(Number(row.batch_operation_plan_id), Number(row.position_number ?? 1))),
    );

    if (!localOperationDemands.length) {
      return base({
        status: 'DATA_GAP',
        uncoveredVacancies: [
          ...protectedUncovered,
          ...releasableRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'DATA GAP: DataAssemblerV4 returned no matching operation demand')),
        ],
        capabilityGaps,
        supervisorAttentionItems: ['DATA GAP: 真实 batch_operation_plans 未进入 solver_v4 operation_demands，未生成假 proposal。'],
        applyDisabledReason: 'No matching solver operation demands.',
      });
    }

    const requestId = `roster-repair-${Date.now()}`;
    const solverRequest: V4SolverRequest = {
      ...assembled,
      request_id: requestId,
      window: {
        start_date: solveRange.start_date,
        end_date: solveRange.end_date,
      },
      solve_range: undefined,
      operation_demands: localOperationDemands,
      special_shift_requirements: [],
      shift_definitions: [],
      shared_preferences: [],
      locked_operations: [],
      locked_shifts: [],
      frozen_assignments: [],
      frozen_shifts: [],
      operation_resource_requirements: (assembled.operation_resource_requirements ?? [])
        .filter((requirement) => releasedPositionsByOperation.has(Number(requirement.operation_plan_id))),
      employee_profiles: (assembled.employee_profiles ?? []).map((employee) => {
        if (!exceptionEmployeeIds.has(Number(employee.employee_id))) return employee;
        return {
          ...employee,
          unavailable_periods: [
            ...(employee.unavailable_periods ?? []),
            {
              start_datetime: input.windowStart.toISOString(),
              end_datetime: input.windowEnd.toISOString(),
            },
          ],
        };
      }),
      config: {
        ...(assembled.config ?? {}),
        allow_position_vacancy: true,
        max_time_seconds: input.repairMode === 'MAX_COVERAGE' ? 30 : 15,
        enable_locked_operations: false,
        enable_locked_shifts: false,
        enable_standalone_tasks: false,
        metadata: {
          preview_only: true,
          source: 'Roster Exception Repair',
          repair_mode: input.repairMode,
        },
      },
    };

    let solverResult: any;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45 * 1000);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(solverRequest),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const detail = await response.text();
        return base({
          status: 'SOLVER_FAILED',
          solverRequestId: requestId,
          solverInvocation: { called: true, endpoint, mode: 'solver_v4_preview_adapter' },
          uncoveredVacancies: [
            ...protectedUncovered,
            ...releasableRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'SOLVER_V4_PREVIEW_FAILED')),
          ],
          capabilityGaps: [
            ...capabilityGaps,
            {
              code: 'SOLVER_V4_PREVIEW_FAILED',
              message: `Solver V4 preview failed: ${response.status} ${response.statusText}`,
              detail,
            },
          ],
          applyDisabledReason: 'Solver preview failed.',
        });
      }
      solverResult = await response.json();
    } catch (error: any) {
      const unavailable = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(error?.message ?? String(error));
      return base({
        status: unavailable ? 'SOLVER_UNAVAILABLE' : 'SOLVER_FAILED',
        solverRequestId: requestId,
        solverInvocation: { called: true, endpoint, mode: 'solver_v4_preview_adapter' },
        uncoveredVacancies: [
          ...protectedUncovered,
          ...releasableRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, unavailable ? 'SOLVER_V4_PREVIEW_UNAVAILABLE' : 'SOLVER_V4_PREVIEW_FAILED')),
        ],
        capabilityGaps: [
          ...capabilityGaps,
          {
            code: unavailable ? 'SOLVER_V4_PREVIEW_UNAVAILABLE' : 'SOLVER_V4_PREVIEW_FAILED',
            message: unavailable
              ? 'Solver V4 preview service is unavailable for this preview request.'
              : 'Solver V4 preview request failed before returning a proposal.',
            detail: error?.message ?? String(error),
          },
        ],
        applyDisabledReason: unavailable ? 'Solver service unavailable.' : 'Solver preview failed.',
      });
    }

    const solverAssignments = this.extractSolverAssignments(solverResult, releasableRows);
    const solverAssignmentByOperationPosition = new Map(
      solverAssignments.map((assignment) => [
        this.requirementKey(assignment.operationPlanId, assignment.positionNumber),
        assignment,
      ]),
    );
    const employeeById = new Map((assembled.employee_profiles ?? []).map((employee) => [Number(employee.employee_id), employee]));

    const assignmentChanges: SolverRepairAssignmentChangeDto[] = [];
    const uncoveredFromSolver: SolverRepairUncoveredVacancyDto[] = [];

    for (const row of releasableRows) {
      const key = this.requirementKey(Number(row.batch_operation_plan_id), Number(row.position_number ?? 1));
      const solverAssignment = solverAssignmentByOperationPosition.get(key);
      if (!solverAssignment) {
        uncoveredFromSolver.push(this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'SOLVER_UNCOVERED'));
        continue;
      }

      const employee = employeeById.get(Number(solverAssignment.employeeId));
      if (!employee) {
        uncoveredFromSolver.push(this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'DATA_GAP: solver returned unknown employee'));
        continue;
      }

      const opStart = dayjs(row.planned_start_datetime);
      const opEnd = dayjs(row.planned_end_datetime);
      const coveringShift = this.findCoveringShiftPlan(
        candidateShiftsByEmployee.get(Number(solverAssignment.employeeId)) ?? [],
        opStart,
        opEnd,
        solverAssignment.shiftId,
      );
      const conflicts = (existingAssignmentsByEmployee.get(Number(solverAssignment.employeeId)) ?? [])
        .filter((assignment) => !releasedAssignmentIds.has(Number(assignment.assignment_id)))
        .some((assignment) => overlaps(opStart, opEnd, dayjs(assignment.planned_start_datetime), dayjs(assignment.planned_end_datetime)));
      const requirements = input.requirementsByOperationPosition.get(this.requirementKey(
        Number(row.operation_id),
        Number(row.position_number ?? 1),
      )) ?? [];
      const qualificationResult = this.evaluateSolverQualification(employee.qualifications ?? [], requirements);
      const hasOvertimeRisk = !coveringShift || String(coveringShift.plan_category || '').toUpperCase() === 'OVERTIME';
      const originalDepartmentId = row.employee_department_id ? Number(row.employee_department_id) : null;
      const proposedDepartment = employeeDepartmentById.get(Number(solverAssignment.employeeId));
      const proposedDepartmentId = proposedDepartment?.department_id ? Number(proposedDepartment.department_id) : null;
      const sameDepartment = Boolean(
        originalDepartmentId
        && proposedDepartmentId
        && originalDepartmentId === proposedDepartmentId,
      );
      const departmentBlockReason = !sameDepartment
        ? (!originalDepartmentId || !proposedDepartmentId ? 'DEPARTMENT_SCOPE_MISSING' : 'CROSS_DEPARTMENT_BLOCKED')
        : null;
      const canApply = !departmentBlockReason && !conflicts && Boolean(coveringShift || input.allowOvertimeSuggestions);

      assignmentChanges.push({
        changeId: `change-${row.assignment_id}-${solverAssignment.employeeId}`,
        assignmentId: Number(row.assignment_id),
        batchOperationPlanId: Number(row.batch_operation_plan_id),
        batchCode: String(row.batch_code),
        operationName: String(row.operation_name),
        plannedStart: toIso(row.planned_start_datetime),
        plannedEnd: toIso(row.planned_end_datetime),
        role: String(row.role || 'OPERATOR'),
        positionNumber: Number(row.position_number ?? 1),
        originalEmployeeId: Number(row.employee_id),
        originalEmployeeCode: String(row.employee_code || ''),
        originalEmployeeName: String(row.employee_name || ''),
        originalDepartmentId,
        originalDepartmentName: row.employee_department_name ? String(row.employee_department_name) : null,
        proposedEmployeeId: Number(employee.employee_id),
        proposedEmployeeCode: String(employee.employee_code || ''),
        proposedEmployeeName: String(employee.employee_name || ''),
        proposedDepartmentId,
        proposedDepartmentName: proposedDepartment?.department_name ? String(proposedDepartment.department_name) : null,
        sameDepartment,
        requiredQualificationNames: requirements.map((requirement) => String(requirement.qualification_name)),
        proposedEmployeeHasQualification: qualificationResult.matches,
        proposedEmployeeOnShift: Boolean(coveringShift),
        proposedShiftPlanId: coveringShift?.shift_plan_id ? Number(coveringShift.shift_plan_id) : null,
        proposedShiftCode: coveringShift?.shift_code ?? null,
        hasTimeConflict: conflicts,
        hasOvertimeRisk,
        changeReason: input.repairMode === 'MAX_COVERAGE'
          ? 'solver_v4 maximum coverage local repair under temporary unavailable constraint'
          : 'solver_v4 minimal-change local repair under temporary unavailable constraint',
        canApply,
        ...(canApply
          ? {}
          : { applyBlockReason: departmentBlockReason ?? (conflicts ? 'TIME_CONFLICT' : 'NO_EXISTING_SHIFT_PLAN_FOR_ASSIGNMENT_ONLY_APPLY') }),
      });
    }

    const uncoveredVacancies = [
      ...protectedUncovered,
      ...missingDemandRows.map((row) => this.mapUncoveredFromAssignment(row, input.requirementsByOperationPosition, 'DATA GAP: missing solver demand')),
      ...uncoveredFromSolver,
    ];
    const solverStatus = String(solverResult?.status ?? 'UNKNOWN');
    const feasible = ['OPTIMAL', 'FEASIBLE', 'FEASIBLE (Forced)'].includes(solverStatus);
    const status = !feasible
      ? 'INFEASIBLE'
      : uncoveredVacancies.length > 0
        ? (assignmentChanges.length > 0 ? 'PARTIAL' : 'UNCOVERED')
        : 'READY';
    const supervisorAttentionItems = [
      ...(protectedRows.length > 0 ? [`${protectedRows.length} locked assignment(s) are protected and not released to solver_v4.`] : []),
      ...(uncoveredVacancies.length > 0 ? [`${uncoveredVacancies.length} released role(s) remain uncovered.`] : []),
      ...(assignmentChanges.some((change) => change.hasOvertimeRisk) ? ['Proposal includes overtime or no-existing-shift-plan risk.'] : []),
      ...(assignmentChanges.some((change) => change.hasTimeConflict) ? ['Proposal includes time conflict risk and those changes are blocked from apply.'] : []),
      ...(assignmentChanges.some((change) => !change.sameDepartment)
        ? ['Proposal contains cross-department or unresolved-department replacement; those changes are blocked from apply.']
        : []),
    ];

    return base({
      status,
      solverRequestId: requestId,
      solverStatus,
      solverInvocation: { called: true, endpoint, mode: 'solver_v4_preview_adapter' },
      assignmentChanges,
      uncoveredVacancies,
      supervisorAttentionItems,
      capabilityGaps,
      applyDisabledReason: assignmentChanges.some((change) => change.canApply)
        ? undefined
        : 'No solver change can be applied as assignment-only replacement.',
    });
  }

  static async applySelectedProposal(
    request: RosterExceptionApplyRequest,
  ): Promise<RosterExceptionApplyResponse> {
    if (!request?.supervisorConfirmation) {
      throw new RosterExceptionPreviewError(
        'SUPERVISOR_CONFIRMATION_REQUIRED',
        'supervisorConfirmation must be true before applying selected proposal',
      );
    }
    const selectedChangeIds = uniq((request.selectedChangeIds ?? []).map(String).filter(Boolean));
    if (!selectedChangeIds.length) {
      throw new RosterExceptionPreviewError('NO_SELECTED_CHANGES', 'selectedChangeIds is required');
    }
    const proposal = request.proposal?.solverRepairProposal;
    if (!proposal || request.proposal.previewOnly !== true || proposal.previewOnly !== true) {
      throw new RosterExceptionPreviewError('INVALID_PROPOSAL', 'A preview-only repair proposal is required');
    }

    const changeById = new Map(proposal.assignmentChanges.map((change) => [change.changeId, change]));
    const connection = await pool.getConnection();
    const appliedChanges: RosterExceptionAppliedChangeDto[] = [];
    const skippedChanges: Array<{ changeId: string; reason: string }> = [];

    try {
      await connection.beginTransaction();

      for (const changeId of selectedChangeIds) {
        const change = changeById.get(changeId);
        if (!change) {
          skippedChanges.push({ changeId, reason: 'CHANGE_NOT_IN_PROPOSAL' });
          continue;
        }
        if (!change.canApply) {
          skippedChanges.push({ changeId, reason: change.applyBlockReason ?? 'CHANGE_NOT_APPLYABLE' });
          continue;
        }

        const [rows] = await connection.execute<ApplyAssignmentRow[]>(
          `SELECT id,
                  batch_operation_plan_id,
                  employee_id,
                  shift_plan_id,
                  IFNULL(is_locked, 0) AS is_locked,
                  assignment_status
           FROM batch_personnel_assignments
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [change.assignmentId],
        );
        const current = rows[0];
        if (!current) {
          skippedChanges.push({ changeId, reason: 'ASSIGNMENT_NOT_FOUND' });
          continue;
        }
        if (Boolean(current.is_locked)) {
          skippedChanges.push({ changeId, reason: 'LOCKED_ASSIGNMENT' });
          continue;
        }
        if (String(current.assignment_status || 'PLANNED') === 'CANCELLED') {
          skippedChanges.push({ changeId, reason: 'ASSIGNMENT_CANCELLED' });
          continue;
        }
        if (Number(current.batch_operation_plan_id) !== Number(change.batchOperationPlanId)) {
          skippedChanges.push({ changeId, reason: 'ASSIGNMENT_OPERATION_MISMATCH' });
          continue;
        }
        if (Number(current.employee_id) !== Number(change.originalEmployeeId)) {
          skippedChanges.push({ changeId, reason: 'STALE_ASSIGNMENT_EMPLOYEE' });
          continue;
        }

        const departmentScopes = await this.fetchEmployeeDepartmentScopes(
          connection,
          [Number(change.originalEmployeeId), Number(change.proposedEmployeeId)],
        );
        const originalDepartment = departmentScopes.get(Number(change.originalEmployeeId));
        const proposedDepartment = departmentScopes.get(Number(change.proposedEmployeeId));
        if (!originalDepartment?.department_id || !proposedDepartment?.department_id) {
          skippedChanges.push({ changeId, reason: 'DEPARTMENT_SCOPE_MISSING' });
          continue;
        }
        if (Number(originalDepartment.department_id) !== Number(proposedDepartment.department_id)) {
          skippedChanges.push({ changeId, reason: 'CROSS_DEPARTMENT_BLOCKED' });
          continue;
        }

        await connection.execute<ResultSetHeader>(
          `UPDATE batch_personnel_assignments
           SET employee_id = ?,
               shift_plan_id = ?
           WHERE id = ?
             AND batch_operation_plan_id = ?
             AND IFNULL(is_locked, 0) = 0`,
          [
            change.proposedEmployeeId,
            change.proposedShiftPlanId,
            change.assignmentId,
            change.batchOperationPlanId,
          ],
        );

        appliedChanges.push({
          changeId,
          assignmentId: change.assignmentId,
          before: {
            employeeId: current.employee_id === null ? null : Number(current.employee_id),
            shiftPlanId: current.shift_plan_id === null ? null : Number(current.shift_plan_id),
          },
          after: {
            employeeId: change.proposedEmployeeId,
            shiftPlanId: change.proposedShiftPlanId,
          },
        });
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return {
      applied: appliedChanges.length > 0,
      appliedCount: appliedChanges.length,
      skippedCount: skippedChanges.length,
      selectedChangeIds,
      appliedChanges,
      skippedChanges,
      writeBoundary: {
        wrote: ['batch_personnel_assignments.employee_id', 'batch_personnel_assignments.shift_plan_id'],
        didNotWrite: [
          'employee_shift_plans',
          'batch_operation_plans',
          'scheduling_results',
          'solver_v4 core',
          'database schema',
        ],
      },
      loggingCapabilityGap: 'No assignment-level before/after change log table is available in the current schema; response returns complete before/after changes.',
    };
  }

  private static async fetchEmployeeDepartmentScopes(
    connection: PoolConnection,
    employeeIds: number[],
  ): Promise<Map<number, Pick<EmployeeRow, 'department_id' | 'department_name'>>> {
    const ids = uniq(employeeIds.map(Number).filter((id) => Number.isFinite(id) && id > 0));
    if (!ids.length) return new Map();

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await connection.execute<EmployeeRow[]>(
      `SELECT e.id,
              e.employee_code,
              e.employee_name,
              e.unit_id,
              ${employeeDepartmentSelectSql}
       FROM employees e
       LEFT JOIN organization_units u1 ON u1.id = e.unit_id
       LEFT JOIN organization_units u2 ON u2.id = u1.parent_id
       LEFT JOIN organization_units u3 ON u3.id = u2.parent_id
       WHERE e.id IN (${placeholders})`,
      ids,
    );

    return new Map(rows.map((row) => [
      Number(row.id),
      {
        department_id: row.department_id ? Number(row.department_id) : null,
        department_name: row.department_name ? String(row.department_name) : null,
      },
    ]));
  }

  private static isAssignmentLocked(row: AssignmentRow): boolean {
    return Boolean(row.assignment_locked) || Boolean(row.operation_locked) || Boolean(row.shift_plan_locked);
  }

  private static filterSolverCandidates(input: {
    candidateEmployeeIds: number[];
    exceptionEmployeeIds: Set<number>;
    sourceDepartmentId: number | null;
    opStart: Dayjs;
    opEnd: Dayjs;
    releasedAssignmentIds: Set<number>;
    existingAssignmentsByEmployee: Map<number, AssignmentRow[]>;
    candidateShiftsByEmployee: Map<number, CandidateShiftRow[]>;
    employeeDepartmentById: Map<number, Pick<EmployeeRow, 'department_id' | 'department_name'>>;
    protectDepartmentBoundary: boolean;
    allowOvertimeSuggestions: boolean;
  }): number[] {
    return uniq(input.candidateEmployeeIds.map(Number).filter((employeeId) => {
      if (!Number.isFinite(employeeId) || employeeId <= 0) return false;
      if (input.exceptionEmployeeIds.has(employeeId)) return false;

      if (input.protectDepartmentBoundary) {
        const candidateDepartmentId = input.employeeDepartmentById.get(employeeId)?.department_id;
        if (!input.sourceDepartmentId || !candidateDepartmentId) return false;
        if (Number(candidateDepartmentId) !== Number(input.sourceDepartmentId)) return false;
      }

      const hasExistingAssignmentConflict = (input.existingAssignmentsByEmployee.get(employeeId) ?? [])
        .filter((assignment) => !input.releasedAssignmentIds.has(Number(assignment.assignment_id)))
        .some((assignment) => overlaps(
          input.opStart,
          input.opEnd,
          dayjs(assignment.planned_start_datetime),
          dayjs(assignment.planned_end_datetime),
        ));
      if (hasExistingAssignmentConflict) return false;

      if (!input.allowOvertimeSuggestions) {
        const coveringShift = this.findCoveringShiftPlan(
          input.candidateShiftsByEmployee.get(employeeId) ?? [],
          input.opStart,
          input.opEnd,
        );
        if (!coveringShift) return false;
      }

      return true;
    }));
  }

  private static findCoveringShiftPlan(
    shifts: CandidateShiftRow[],
    opStart: Dayjs,
    opEnd: Dayjs,
    preferredShiftId?: number | null,
  ): CandidateShiftRow | null {
    const covering = shifts.filter((shift) => {
      const bounds = this.resolveShiftBounds(shift.plan_date, shift.start_time, shift.end_time);
      if (!bounds) return false;
      return !bounds.start.isAfter(opStart) && !bounds.end.isBefore(opEnd);
    });
    if (!covering.length) return null;
    if (preferredShiftId) {
      return covering.find((shift) => Number(shift.shift_id) === Number(preferredShiftId)) ?? covering[0];
    }
    return covering[0];
  }

  private static extractSolverAssignments(
    solverResult: any,
    releasableRows: AssignmentRow[] = [],
  ): SolverPreviewAssignment[] {
    const assignments: SolverPreviewAssignment[] = [];
    const assignmentKeys = new Set<string>();
    const releasedPositionsByOperation = new Map<number, Set<number>>();
    releasableRows.forEach((row) => {
      const operationPlanId = Number(row.batch_operation_plan_id);
      const positionNumber = Number(row.position_number ?? 1);
      if (!Number.isFinite(operationPlanId) || !Number.isFinite(positionNumber)) return;
      if (!releasedPositionsByOperation.has(operationPlanId)) {
        releasedPositionsByOperation.set(operationPlanId, new Set<number>());
      }
      releasedPositionsByOperation.get(operationPlanId)!.add(positionNumber);
    });
    const inferPositionNumber = (operationPlanId: number): number | null => {
      const positions = releasedPositionsByOperation.get(operationPlanId);
      if (!positions || positions.size !== 1) return null;
      return Array.from(positions)[0];
    };
    const pushAssignment = (assignment: SolverPreviewAssignment) => {
      const key = this.requirementKey(assignment.operationPlanId, assignment.positionNumber);
      const dedupeKey = `${key}-${assignment.employeeId}`;
      if (assignmentKeys.has(dedupeKey)) return;
      assignmentKeys.add(dedupeKey);
      assignments.push(assignment);
    };

    if (Array.isArray(solverResult?.schedules)) {
      solverResult.schedules.forEach((schedule: any) => {
        const employeeId = Number(schedule?.employee_id);
        const shiftId = schedule?.shift?.shift_id === undefined || schedule?.shift?.shift_id === null
          ? null
          : Number(schedule.shift.shift_id);
        if (!Number.isFinite(employeeId) || employeeId <= 0) return;
        if (!Array.isArray(schedule?.tasks)) return;
        schedule.tasks.forEach((task: any) => {
          const operationPlanId = Number(task?.operation_id);
          const positionNumber = Number(task?.position_number ?? 1);
          if (!Number.isFinite(operationPlanId) || !Number.isFinite(positionNumber)) return;
          pushAssignment({
            operationPlanId,
            positionNumber,
            employeeId,
            shiftId,
            plannedStart: String(task?.start ?? ''),
            plannedEnd: String(task?.end ?? ''),
          });
        });
      });
    }

    if (Array.isArray(solverResult?.unassigned_jobs)) {
      solverResult.unassigned_jobs.forEach((job: any) => {
        const operationPlanId = Number(job?.operation_plan_id ?? job?.operation_id);
        const employeeId = Number(job?.employee_id);
        const rawPositionNumber = Number(job?.position_number);
        const positionNumber = Number.isFinite(rawPositionNumber)
          ? rawPositionNumber
          : inferPositionNumber(operationPlanId);
        if (
          !Number.isFinite(operationPlanId)
          || !Number.isFinite(employeeId)
          || employeeId <= 0
          || !positionNumber
        ) {
          return;
        }
        pushAssignment({
          operationPlanId,
          positionNumber,
          employeeId,
          shiftId: job?.shift_id === undefined || job?.shift_id === null ? null : Number(job.shift_id),
          plannedStart: String(job?.start ?? ''),
          plannedEnd: String(job?.end ?? ''),
        });
      });
    }

    return assignments;
  }

  private static evaluateSolverQualification(
    employeeQualifications: Array<{ qualification_id: number; level: number }>,
    requirements: QualificationRequirementRow[],
  ): { matches: boolean } {
    if (!requirements.length) return { matches: false };
    return {
      matches: requirements.every((requirement) => {
        if (!Boolean(requirement.is_mandatory)) return true;
        const employeeQualification = employeeQualifications.find((item) =>
          Number(item.qualification_id) === Number(requirement.qualification_id),
        );
        return Number(employeeQualification?.level ?? 0) >= Number(requirement.required_level ?? 1);
      }),
    };
  }

  private static mapUncoveredFromAssignment(
    row: AssignmentRow,
    requirementsByOperationPosition: Map<string, QualificationRequirementRow[]>,
    reason: string,
  ): SolverRepairUncoveredVacancyDto {
    const requirements = requirementsByOperationPosition.get(this.requirementKey(
      Number(row.operation_id),
      Number(row.position_number ?? 1),
    )) ?? [];
    return {
      vacancyId: createVacancyId(Number(row.assignment_id), Number(row.position_number ?? 1)),
      assignmentId: Number(row.assignment_id),
      batchOperationPlanId: Number(row.batch_operation_plan_id),
      batchCode: String(row.batch_code),
      operationName: String(row.operation_name),
      plannedStart: toIso(row.planned_start_datetime),
      plannedEnd: toIso(row.planned_end_datetime),
      role: String(row.role || 'OPERATOR'),
      positionNumber: Number(row.position_number ?? 1),
      requiredQualificationNames: requirements.map((item) => String(item.qualification_name)),
      reason,
    };
  }

  private static resolveShiftBounds(
    planDate: string | Date,
    startTime: string | null,
    endTime: string | null,
  ): { start: Dayjs; end: Dayjs } | null {
    if (!startTime || !endTime) return null;
    const date = toDateString(planDate);
    const start = dayjs(`${date} ${startTime}`);
    let end = dayjs(`${date} ${endTime}`);
    if (!start.isValid() || !end.isValid()) return null;
    if (!end.isAfter(start)) end = end.add(1, 'day');
    return { start, end };
  }

  private static mapAssignment(row: AssignmentRow): ImpactedAssignmentDto {
    return {
      assignmentId: Number(row.assignment_id),
      batchOperationPlanId: Number(row.batch_operation_plan_id),
      batchCode: String(row.batch_code),
      operationName: String(row.operation_name),
      plannedStart: toIso(row.planned_start_datetime),
      plannedEnd: toIso(row.planned_end_datetime),
      role: String(row.role || 'OPERATOR'),
      positionNumber: Number(row.position_number ?? 1),
      isLocked: Boolean(row.assignment_locked) || Boolean(row.operation_locked) || Boolean(row.shift_plan_locked),
      employeeId: Number(row.employee_id),
      employeeCode: String(row.employee_code || ''),
      employeeName: String(row.employee_name || ''),
      departmentId: row.employee_department_id ? Number(row.employee_department_id) : null,
      departmentName: row.employee_department_name ? String(row.employee_department_name) : null,
      shiftPlanId: row.shift_plan_id ? Number(row.shift_plan_id) : null,
    };
  }

  private static mapEmployee(row: EmployeeRow): RosterExceptionEmployeeDto {
    return {
      employeeId: Number(row.id),
      employeeCode: String(row.employee_code),
      employeeName: String(row.employee_name),
      departmentId: row.department_id ? Number(row.department_id) : null,
      departmentName: row.department_name ? String(row.department_name) : null,
    };
  }

  private static requirementKey(operationId: number, positionNumber: number): string {
    return `${operationId}:${positionNumber}`;
  }
}
