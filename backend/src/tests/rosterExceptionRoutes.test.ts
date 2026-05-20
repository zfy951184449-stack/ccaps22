import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../config/database', () => ({
  default: {
    execute: vi.fn(),
    getConnection: vi.fn(),
  },
}));

import app from '../server';
import pool from '../config/database';
import { DataAssemblerV4 } from '../services/schedulingV4/DataAssemblerV4';

const mockPool = pool as unknown as {
  execute: ReturnType<typeof vi.fn>;
  getConnection: ReturnType<typeof vi.fn>;
};

const previewPayload = {
  exceptionType: 'EMPLOYEE_UNAVAILABLE',
  employeeId: 123,
  windowStart: '2026-06-12T08:00:00+08:00',
  windowEnd: '2026-06-12T20:00:00+08:00',
  reasonCode: 'SICK_LEAVE',
  protectLockedAssignments: true,
  previewOnly: true,
};

const employee = {
  id: 123,
  employee_code: 'E123',
  employee_name: '张三',
  unit_id: 10,
  department_id: 1,
  department_name: 'USP',
  primary_team_id: 2,
};

const candidate = {
  id: 456,
  employee_code: 'E456',
  employee_name: '李四',
  unit_id: 10,
  department_id: 1,
  department_name: 'USP',
  primary_team_id: 2,
};

const secondEmployee = {
  id: 789,
  employee_code: 'E789',
  employee_name: '王五',
  unit_id: 10,
  department_id: 1,
  department_name: 'USP',
  primary_team_id: 2,
};

const impactedAssignment = {
  assignment_id: 9001,
  batch_operation_plan_id: 7001,
  batch_plan_id: 5001,
  employee_id: 123,
  employee_code: 'E123',
  employee_name: '张三',
  employee_department_id: 1,
  employee_department_name: 'USP',
  position_number: 1,
  role: 'OPERATOR',
  assignment_locked: 0,
  operation_id: 3001,
  operation_locked: 0,
  planned_start_datetime: '2026-06-12 09:00:00',
  planned_end_datetime: '2026-06-12 11:00:00',
  batch_code: 'B-001',
  operation_name: '培养观察',
  shift_plan_id: 8001,
  shift_id: 1,
  shift_code: 'DAY',
  shift_start_time: '08:00:00',
  shift_end_time: '20:00:00',
  plan_category: 'PRODUCTION',
  plan_date: '2026-06-12',
  shift_plan_locked: 0,
};

const qualificationRequirement = {
  operation_id: 3001,
  position_number: 1,
  qualification_id: 77,
  qualification_name: 'USP操作',
  required_level: 3,
  is_mandatory: 1,
};

type MockSetup = {
  employeeRows?: any[];
  shiftRows?: any[];
  impactedAssignments?: any[];
  requirements?: any[];
  candidates?: any[];
  candidateQualifications?: any[];
  candidateUnavailability?: any[];
  candidateAssignments?: any[];
  candidateShifts?: any[];
};

const setupMock = (setup: MockSetup = {}) => {
  mockPool.execute.mockImplementation(async (query: string, params: any[] = []) => {
    if (query.includes('FROM employees') && query.includes('WHERE e.id IN')) {
      const employeeIds = new Set(params.map(Number));
      return [(setup.employeeRows ?? [employee]).filter((row) => employeeIds.has(Number(row.id))), []];
    }

    if (query.includes('FROM employees') && query.includes('WHERE e.id = ?')) {
      const employeeId = Number(params[0]);
      return [(setup.employeeRows ?? [employee]).filter((row) => Number(row.id) === employeeId), []];
    }

    if (query.includes('FROM employee_shift_plans esp') && query.includes('WHERE esp.employee_id = ?')) {
      const employeeId = Number(params[0]);
      return [(setup.shiftRows ?? []).filter((row) => Number(row.employee_id) === employeeId), []];
    }

    if (query.includes('FROM batch_personnel_assignments bpa') && query.includes('WHERE bpa.employee_id = ?')) {
      const employeeId = Number(params[0]);
      return [(setup.impactedAssignments ?? []).filter((row) => Number(row.employee_id) === employeeId), []];
    }

    if (query.includes('FROM operation_qualification_requirements oqr')) {
      return [setup.requirements ?? [], []];
    }

    if (query.includes('FROM employees') && query.includes("employment_status = 'ACTIVE'") && query.includes('id <> ?')) {
      return [setup.candidates ?? [], []];
    }

    if (query.includes('FROM employees') && query.includes("employment_status = 'ACTIVE'")) {
      return [setup.candidates ?? [], []];
    }

    if (query.includes('FROM employee_qualifications eq')) {
      return [setup.candidateQualifications ?? [], []];
    }

    if (query.includes('FROM employee_unavailability')) {
      return [setup.candidateUnavailability ?? [], []];
    }

    if (query.includes('FROM batch_personnel_assignments bpa')) {
      return [setup.candidateAssignments ?? [], []];
    }

    if (query.includes('FROM employee_shift_plans esp')) {
      return [setup.candidateShifts ?? [], []];
    }

    return [[], []];
  });
};

describe('Roster Exception Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when windowStart is not before windowEnd', async () => {
    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send({
        ...previewPayload,
        windowStart: '2026-06-12T20:00:00+08:00',
        windowEnd: '2026-06-12T08:00:00+08:00',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('INVALID_WINDOW');
  });

  it('returns error when employee does not exist', async () => {
    setupMock({ employeeRows: [] });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('returns an empty preview when employee has no impacted assignment', async () => {
    setupMock();

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.previewOnly).toBe(true);
    expect(response.body.impactedAssignments).toEqual([]);
    expect(response.body.vacancies).toEqual([]);
    expect(response.body.summary).toMatchObject({
      impactedAssignmentCount: 0,
      vacancyCount: 0,
      uncoveredCount: 0,
      requiresSolverRerun: false,
    });
  });

  it('generates a vacancy when employee has an impacted assignment', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.impactedAssignments).toHaveLength(1);
    expect(response.body.vacancies[0]).toMatchObject({
      batchOperationPlanId: 7001,
      batchCode: 'B-001',
      operationName: '培养观察',
      positionNumber: 1,
      requiredQualificationIds: [77],
    });
  });

  it('can return impact analysis without invoking solver repair', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send({
        ...previewPayload,
        previewMode: 'IMPACT_ONLY',
      });

    expect(response.status).toBe(200);
    expect(response.body.impactedAssignments).toHaveLength(1);
    expect(response.body.solverRepairProposal).toMatchObject({
      status: 'IMPACT_ONLY',
      applyAllowed: false,
      solverInvocation: {
        called: false,
      },
    });
    expect(response.body.solverRepairProposal.assignmentChanges).toEqual([]);
  });

  it('can preview impact for multiple unavailable employees in one request', async () => {
    setupMock({
      employeeRows: [employee, secondEmployee],
      impactedAssignments: [
        impactedAssignment,
        {
          ...impactedAssignment,
          assignment_id: 9002,
          employee_id: 789,
          employee_code: 'E789',
          employee_name: '王五',
          position_number: 2,
          shift_plan_id: 8002,
        },
      ],
      requirements: [qualificationRequirement],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send({
        ...previewPayload,
        employeeIds: [123, 789],
        previewMode: 'IMPACT_ONLY',
      });

    expect(response.status).toBe(200);
    expect(response.body.employees).toEqual([
      expect.objectContaining({ employeeId: 123 }),
      expect.objectContaining({ employeeId: 789 }),
    ]);
    expect(response.body.impactedAssignments).toHaveLength(2);
    expect(response.body.impactedAssignments.map((item: any) => item.employeeId).sort()).toEqual([123, 789]);
    expect(response.body.summary).toMatchObject({
      impactedAssignmentCount: 2,
      vacancyCount: 2,
    });
  });

  it('includes qualified employees without conflicts as replacement candidates', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
      candidates: [candidate],
      candidateQualifications: [{
        employee_id: 456,
        qualification_id: 77,
        qualification_name: 'USP操作',
        qualification_level: 4,
      }],
      candidateShifts: [{
        shift_plan_id: 8002,
        employee_id: 456,
        shift_id: 1,
        shift_code: 'DAY',
        start_time: '08:00:00',
        end_time: '20:00:00',
        plan_category: 'PRODUCTION',
        plan_date: '2026-06-12',
      }],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.replacementCandidates[0]).toMatchObject({
      employeeId: 456,
      departmentId: 1,
      departmentName: 'USP',
      sameDepartment: true,
      qualificationMatch: true,
      sameShift: true,
      hasTimeConflict: false,
      hasUnavailabilityConflict: false,
      recommendationLevel: 'RECOMMENDED',
    });
    expect(response.body.summary.coveredByCandidateCount).toBe(1);
  });

  it('excludes cross-department candidates from replacement scope', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
      candidates: [{
        ...candidate,
        id: 789,
        employee_code: 'E789',
        employee_name: '王五',
        department_id: 2,
        department_name: 'DSP',
      }],
      candidateQualifications: [{
        employee_id: 789,
        qualification_id: 77,
        qualification_name: 'USP操作',
        qualification_level: 4,
      }],
      candidateShifts: [{
        shift_plan_id: 8003,
        employee_id: 789,
        shift_id: 1,
        shift_code: 'DAY',
        start_time: '08:00:00',
        end_time: '20:00:00',
        plan_category: 'PRODUCTION',
        plan_date: '2026-06-12',
      }],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send({
        ...previewPayload,
        previewMode: 'IMPACT_ONLY',
      });

    expect(response.status).toBe(200);
    expect(response.body.replacementCandidates).toEqual([]);
    expect(response.body.summary.coveredByCandidateCount).toBe(0);
    expect(response.body.uncoveredVacancies).toHaveLength(1);
  });

  it('marks candidates that have unavailability conflict', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
      candidates: [candidate],
      candidateQualifications: [{
        employee_id: 456,
        qualification_id: 77,
        qualification_name: 'USP操作',
        qualification_level: 4,
      }],
      candidateUnavailability: [{
        employee_id: 456,
        start_datetime: '2026-06-12 08:30:00',
        end_datetime: '2026-06-12 10:30:00',
      }],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.replacementCandidates[0]).toMatchObject({
      hasUnavailabilityConflict: true,
      recommendationLevel: 'RISKY',
    });
  });

  it('marks candidates that have overlapping assignment time conflict', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
      candidates: [candidate],
      candidateQualifications: [{
        employee_id: 456,
        qualification_id: 77,
        qualification_name: 'USP操作',
        qualification_level: 4,
      }],
      candidateAssignments: [{
        ...impactedAssignment,
        assignment_id: 9002,
        employee_id: 456,
      }],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.replacementCandidates[0]).toMatchObject({
      hasTimeConflict: true,
      recommendationLevel: 'RISKY',
    });
  });

  it('requires solver rerun when a locked assignment is affected', async () => {
    setupMock({
      impactedAssignments: [{
        ...impactedAssignment,
        assignment_locked: 1,
      }],
      requirements: [qualificationRequirement],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.vacancies[0].hardToCoverReason).toBe('PROTECTED_LOCKED_ASSIGNMENT');
    expect(response.body.summary.requiresSolverRerun).toBe(true);
    expect(response.body.summary.requiresSupervisorAction).toBe(true);
    expect(response.body.warnings).toContain('LOCKED_ASSIGNMENT_AFFECTED');
  });

  it('returns SKILL_REQUIREMENT_MISSING warning when operation qualification rule is missing', async () => {
    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [],
      candidates: [candidate],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send(previewPayload);

    expect(response.status).toBe(200);
    expect(response.body.warnings).toContain('SKILL_REQUIREMENT_MISSING');
    expect(response.body.replacementCandidates[0]).toMatchObject({
      recommendationLevel: 'POSSIBLE',
      warnings: ['SKILL_REQUIREMENT_MISSING'],
    });
    expect(response.body.summary.requiresSupervisorAction).toBe(true);
  });

  it('keeps solver repair preview scoped to affected operation dates and assignment-only inputs', async () => {
    const assembleSpy = vi.spyOn(DataAssemblerV4, 'assemble').mockResolvedValueOnce({
      request_id: 'assembled-request',
      window: { start_date: '2026-06-12', end_date: '2026-06-12' },
      operation_demands: [{
        operation_plan_id: 7001,
        batch_id: 5001,
        batch_code: 'B-001',
        operation_id: 3001,
        operation_name: '培养观察',
        planned_start: '2026-06-12T09:00:00+08:00',
        planned_end: '2026-06-12T11:00:00+08:00',
        planned_duration_minutes: 120,
        required_people: 1,
        position_qualifications: [{
          position_number: 1,
          qualifications: [{ qualification_id: 77, min_level: 3, is_mandatory: true }],
          candidate_employee_ids: [456],
        }],
      }],
      special_shift_requirements: [],
      employee_profiles: [
        {
          employee_id: 123,
          employee_code: 'E123',
          employee_name: '张三',
          org_role: 'OPERATOR',
          qualifications: [{ qualification_id: 77, level: 4 }],
          unavailable_periods: [],
        },
        {
          employee_id: 456,
          employee_code: 'E456',
          employee_name: '李四',
          org_role: 'OPERATOR',
          qualifications: [{ qualification_id: 77, level: 4 }],
          unavailable_periods: [],
        },
      ],
      calendar: [],
      shift_definitions: [{
        shift_id: 1,
        shift_code: 'DAY',
        shift_name: 'Day',
        category: 'DAY',
        start_time: '08:00:00',
        end_time: '20:00:00',
        nominal_hours: 12,
        is_night_shift: false,
      }],
      shared_preferences: [],
      locked_operations: [],
      locked_shifts: [{ employee_id: 456, date: '2026-06-12', shift_id: 1 }],
      historical_shifts: [],
      resources: [],
      resource_calendars: [],
      operation_resource_requirements: [],
      maintenance_windows: [],
      frozen_assignments: [],
      frozen_shifts: [],
      config: {},
    } as any);
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'OPTIMAL',
        schedules: [],
        unassigned_jobs: [{
          operation_id: 7001,
          employee_id: 456,
          reason: 'No covering shift assigned',
        }],
      }),
    } as any);

    setupMock({
      impactedAssignments: [impactedAssignment],
      requirements: [qualificationRequirement],
      candidates: [candidate],
      candidateQualifications: [{
        employee_id: 456,
        qualification_id: 77,
        qualification_name: 'USP操作',
        qualification_level: 4,
      }],
      candidateShifts: [{
        shift_plan_id: 8002,
        employee_id: 456,
        shift_id: 1,
        shift_code: 'DAY',
        start_time: '08:00:00',
        end_time: '20:00:00',
        plan_category: 'PRODUCTION',
        plan_date: '2026-06-12',
      }],
    });

    const response = await request(app)
      .post('/api/roster-exceptions/preview')
      .send({
        ...previewPayload,
        windowStart: '2025-12-02T00:00:00+08:00',
        windowEnd: '2027-12-05T00:00:00+08:00',
        previewMode: 'SOLVER_REPAIR',
      });

    expect(response.status).toBe(200);
    expect(assembleSpy).toHaveBeenCalledWith(
      '2026-06-11',
      '2026-06-13',
      [5001],
      [],
      { start_date: '2026-06-12', end_date: '2026-06-12' },
      { enable_standalone_tasks: false, allow_position_vacancy: true },
    );

    const solverPayload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(solverPayload.window).toEqual({ start_date: '2026-06-12', end_date: '2026-06-12' });
    expect(solverPayload.shift_definitions).toEqual([]);
    expect(solverPayload.locked_shifts).toEqual([]);
    expect(solverPayload.config).toMatchObject({
      max_time_seconds: 15,
      enable_locked_shifts: false,
      metadata: {
        preview_only: true,
        source: 'Roster Exception Repair',
        repair_mode: 'MINIMAL_CHANGE',
      },
    });
    expect(response.body.solverRepairProposal).toMatchObject({
      status: 'READY',
      solverStatus: 'OPTIMAL',
      changedAssignmentCount: 1,
      uncoveredVacancyCount: 0,
    });
  });

  it('requires supervisor confirmation before applying selected proposal', async () => {
    const response = await request(app)
      .post('/api/roster-exceptions/apply-proposal')
      .send({
        proposal: { previewOnly: true, solverRepairProposal: { previewOnly: true, assignmentChanges: [] } },
        selectedChangeIds: ['change-9001-456'],
        supervisorConfirmation: false,
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('SUPERVISOR_CONFIRMATION_REQUIRED');
  });

  it('applies selected proposal with assignment-only batch_personnel_assignments update', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([[
          {
            id: 9001,
            batch_operation_plan_id: 7001,
            employee_id: 123,
            shift_plan_id: 8001,
            is_locked: 0,
            assignment_status: 'PLANNED',
          },
        ], []])
        .mockResolvedValueOnce([[
          {
            id: 123,
            employee_code: 'E123',
            employee_name: '张三',
            unit_id: 10,
            department_id: 1,
            department_name: 'USP',
          },
          {
            id: 456,
            employee_code: 'E456',
            employee_name: '李四',
            unit_id: 10,
            department_id: 1,
            department_name: 'USP',
          },
        ], []])
        .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
    };
    mockPool.getConnection.mockResolvedValue(connection);

    const proposal = {
      exceptionId: 'preview-apply',
      previewOnly: true,
      solverRepairProposal: {
        previewOnly: true,
        assignmentChanges: [{
          changeId: 'change-9001-456',
          assignmentId: 9001,
          batchOperationPlanId: 7001,
          originalEmployeeId: 123,
          originalDepartmentId: 1,
          originalDepartmentName: 'USP',
          proposedEmployeeId: 456,
          proposedDepartmentId: 1,
          proposedDepartmentName: 'USP',
          sameDepartment: true,
          proposedShiftPlanId: 8002,
          canApply: true,
        }],
      },
    };

    const response = await request(app)
      .post('/api/roster-exceptions/apply-proposal')
      .send({
        proposal,
        selectedChangeIds: ['change-9001-456'],
        supervisorConfirmation: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.appliedCount).toBe(1);
    expect(response.body.writeBoundary.wrote).toEqual([
      'batch_personnel_assignments.employee_id',
      'batch_personnel_assignments.shift_plan_id',
    ]);

    const executedSql = connection.execute.mock.calls.map((call) => String(call[0])).join('\n');
    expect(executedSql).toContain('UPDATE batch_personnel_assignments');
    expect(executedSql).not.toMatch(/UPDATE\s+batch_operation_plans/i);
    expect(executedSql).not.toMatch(/scheduling_results/i);
  });

  it('blocks apply when proposed employee is from another department', async () => {
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([[
          {
            id: 9001,
            batch_operation_plan_id: 7001,
            employee_id: 123,
            shift_plan_id: 8001,
            is_locked: 0,
            assignment_status: 'PLANNED',
          },
        ], []])
        .mockResolvedValueOnce([[
          {
            id: 123,
            employee_code: 'E123',
            employee_name: '张三',
            unit_id: 10,
            department_id: 1,
            department_name: 'USP',
          },
          {
            id: 789,
            employee_code: 'E789',
            employee_name: '王五',
            unit_id: 20,
            department_id: 2,
            department_name: 'DSP',
          },
        ], []]),
    };
    mockPool.getConnection.mockResolvedValue(connection);

    const proposal = {
      exceptionId: 'preview-cross-dept',
      previewOnly: true,
      solverRepairProposal: {
        previewOnly: true,
        assignmentChanges: [{
          changeId: 'change-9001-789',
          assignmentId: 9001,
          batchOperationPlanId: 7001,
          originalEmployeeId: 123,
          proposedEmployeeId: 789,
          proposedShiftPlanId: 8003,
          canApply: true,
        }],
      },
    };

    const response = await request(app)
      .post('/api/roster-exceptions/apply-proposal')
      .send({
        proposal,
        selectedChangeIds: ['change-9001-789'],
        supervisorConfirmation: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.appliedCount).toBe(0);
    expect(response.body.skippedChanges).toEqual([
      { changeId: 'change-9001-789', reason: 'CROSS_DEPARTMENT_BLOCKED' },
    ]);

    const executedSql = connection.execute.mock.calls.map((call) => String(call[0])).join('\n');
    expect(executedSql).not.toMatch(/UPDATE\s+batch_personnel_assignments/i);
  });
});
