import { describe, expect, it } from 'vitest';
import {
  buildRosterLeadershipCockpitSnapshotFromRows,
} from '../services/rosterLeadershipCockpit/RosterLeadershipCockpitService';

const employee = (id: number, name = `员工${id}`) => ({
  id,
  employee_code: `E${String(id).padStart(3, '0')}`,
  employee_name: name,
  employment_status: 'ACTIVE',
});

const shift = (employeeId: number, date: string) => ({
  employee_id: employeeId,
  overtime_hours: 0,
  plan_category: 'PRODUCTION',
  plan_date: date,
  plan_hours: 8,
});

const operation = (
  operationPlanId: number,
  operationId: number,
  date: string,
  startHour: number,
  durationHours: number,
  requiredPeople: number,
) => ({
  batch_code: `B-${operationPlanId}`,
  batch_plan_id: 10,
  operation_id: operationId,
  operation_name: `Operation ${operationId}`,
  operation_plan_id: operationPlanId,
  planned_duration_minutes: durationHours * 60,
  planned_end_datetime: `${date} ${String(startHour + durationHours).padStart(2, '0')}:00:00`,
  planned_start_datetime: `${date} ${String(startHour).padStart(2, '0')}:00:00`,
  required_people: requiredPeople,
});

const requirement = (
  operationId: number,
  qualificationId: number,
  qualificationName: string,
  requiredCount: number,
) => ({
  is_mandatory: 1,
  operation_id: operationId,
  position_number: 1,
  qualification_id: qualificationId,
  qualification_name: qualificationName,
  required_count: requiredCount,
  required_level: 1,
});

describe('RosterLeadershipCockpitService snapshot builder', () => {
  it('keeps high-frequency broad-supply qualification below Critical and flags scarce concurrent demand', () => {
    const employees = Array.from({ length: 9 }, (_, index) => employee(index + 1));
    const qualifications = [
      { id: 101, qualification_name: '基础上岗' },
      { id: 102, qualification_name: '病毒过滤 L3' },
    ];
    const employeeQualifications = [
      ...employees.map((item) => ({
        employee_id: item.id,
        qualification_id: 101,
        qualification_level: 1,
        qualification_name: '基础上岗',
      })),
      ...employees.slice(0, 2).map((item) => ({
        employee_id: item.id,
        qualification_id: 102,
        qualification_level: 1,
        qualification_name: '病毒过滤 L3',
      })),
    ];
    const operations = [
      operation(1, 201, '2026-06-01', 8, 4, 5),
      operation(2, 202, '2026-06-02', 8, 4, 5),
      operation(3, 203, '2026-06-03', 8, 4, 5),
      operation(4, 204, '2026-06-04', 8, 4, 5),
      operation(5, 205, '2026-06-05', 8, 4, 5),
      operation(6, 301, '2026-06-06', 9, 5, 1),
      operation(7, 302, '2026-06-06', 10, 4, 1),
      operation(8, 303, '2026-06-06', 11, 4, 1),
    ];
    const requirements = [
      requirement(201, 101, '基础上岗', 5),
      requirement(202, 101, '基础上岗', 5),
      requirement(203, 101, '基础上岗', 5),
      requirement(204, 101, '基础上岗', 5),
      requirement(205, 101, '基础上岗', 5),
      requirement(301, 102, '病毒过滤 L3', 1),
      requirement(302, 102, '病毒过滤 L3', 1),
      requirement(303, 102, '病毒过滤 L3', 1),
    ];
    const shiftPlans = employees.flatMap((item) =>
      ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06']
        .map((date) => shift(item.id, date)),
    );

    const snapshot = buildRosterLeadershipCockpitSnapshotFromRows({
      assignments: [],
      employeeQualifications: employeeQualifications as any,
      employees: employees as any,
      operations: operations as any,
      qualifications: qualifications as any,
      requirements: requirements as any,
      shiftPlans: shiftPlans as any,
      unavailability: [],
      windowDays: 7,
      windowStart: '2026-06-01',
    });

    const broadSupply = snapshot.qualifications.find((item) => item.name === '基础上岗');
    const scarceConcurrent = snapshot.qualifications.find((item) => item.name === '病毒过滤 L3');

    expect(snapshot.dataMode).toBe('LIVE_READONLY');
    expect(broadSupply?.demandCount).toBeGreaterThanOrEqual(5);
    expect(broadSupply?.riskLevel).not.toBe('CRITICAL');
    expect(scarceConcurrent?.riskLevel).toMatch(/CRITICAL|BOTTLENECK/);
    expect(scarceConcurrent?.peakConcurrentDemand).toBeGreaterThan(scarceConcurrent?.peakQualifiedAvailable ?? 0);
  });

  it('returns live baseline data and Data Quality Warning when the window has no operations', () => {
    const snapshot = buildRosterLeadershipCockpitSnapshotFromRows({
      assignments: [],
      employeeQualifications: [{
        employee_id: 1,
        qualification_id: 101,
        qualification_level: 1,
        qualification_name: '基础上岗',
      }] as any,
      employees: [employee(1)] as any,
      operations: [],
      qualifications: [{ id: 101, qualification_name: '基础上岗' }] as any,
      requirements: [],
      shiftPlans: [],
      unavailability: [],
      windowDays: 14,
      windowStart: '2026-06-01',
    });

    expect(snapshot.dataMode).toBe('LIVE_READONLY');
    expect(snapshot.qualifications[0]).toMatchObject({
      demandCount: 0,
      name: '基础上岗',
      riskLevel: 'LOW',
    });
    expect(snapshot.dataQualityWarnings.join(' ')).toContain('当前窗口没有激活/计划批次操作');
  });
});
