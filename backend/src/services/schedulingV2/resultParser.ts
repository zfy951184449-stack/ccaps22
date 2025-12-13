/**
 * 结果解析服务
 * 
 * 解析求解器返回的结果，转换为数据库可写入的格式
 */

import {
  SolverResponse,
  OperationAssignment,
  ShiftPlan,
  HoursSummary,
} from '../../types/schedulingV2';

/**
 * 人员分配记录（用于写入数据库）
 */
export interface AssignmentRecord {
  batchOperationPlanId: number;
  positionNumber: number;        // 岗位编号
  employeeId: number;
  assignmentStatus: 'PLANNED' | 'CONFIRMED';
  isLocked: boolean;
  assignedAt: Date;
}

/**
 * 班次计划记录（用于写入数据库）
 */
export interface ShiftPlanRecord {
  employeeId: number;
  planDate: string;
  shiftId: number | null;
  planCategory: string;
  planHours: number;
  workshopMinutes: number;
  isOvertime: boolean;
  isBuffer: boolean;
  isGenerated: boolean;
  operations: ShiftPlanOperationRecord[];
}

/**
 * 班次计划中的操作记录
 */
export interface ShiftPlanOperationRecord {
  operationPlanId: number;
  plannedStart: string;
  plannedEnd: string;
  durationMinutes: number;
}

/**
 * 工时统计记录
 */
export interface HoursSummaryRecord {
  employeeId: number;
  month: string;
  scheduledHours: number;
  standardHours: number;
  hoursDeviation: number;
  workshopHours: number;
  overtimeHours: number;
  workDays: number;
  restDays: number;
  bufferDays: number;
  isWithinBounds: boolean;
}

/**
 * 解析后的结果
 */
export interface ParsedResult {
  assignments: AssignmentRecord[];
  shiftPlans: ShiftPlanRecord[];
  hoursSummaries: HoursSummaryRecord[];
  summary: {
    totalAssignments: number;
    totalShiftPlans: number;
    status: string;
    message: string;
  };
}

/**
 * 结果解析服务
 */
export class ResultParser {
  /**
   * 解析求解器响应
   */
  static parse(response: SolverResponse): ParsedResult {
    const assignments = this.parseAssignments(response.assignments);
    const shiftPlans = this.parseShiftPlans(response.shift_plans);
    const hoursSummaries = this.parseHoursSummaries(response.hours_summaries);

    return {
      assignments,
      shiftPlans,
      hoursSummaries,
      summary: {
        totalAssignments: assignments.length,
        totalShiftPlans: shiftPlans.length,
        status: response.status,
        message: response.summary,
      },
    };
  }

  /**
   * 解析人员分配
   */
  private static parseAssignments(assignments: OperationAssignment[]): AssignmentRecord[] {
    const now = new Date();
    
    return assignments.map(a => ({
      batchOperationPlanId: a.operation_plan_id,
      positionNumber: a.position_number,
      employeeId: a.employee_id,
      assignmentStatus: 'PLANNED' as const,
      isLocked: false,
      assignedAt: now,
    }));
  }

  /**
   * 解析班次计划
   */
  private static parseShiftPlans(shiftPlans: ShiftPlan[]): ShiftPlanRecord[] {
    return shiftPlans.map(plan => ({
      employeeId: plan.employee_id,
      planDate: plan.date,
      shiftId: plan.shift_id || null,
      planCategory: plan.plan_type,
      planHours: plan.plan_hours,
      workshopMinutes: plan.workshop_minutes,
      isOvertime: plan.is_overtime,
      isBuffer: plan.is_buffer,
      isGenerated: true,
      operations: plan.operations.map(op => ({
        operationPlanId: op.operation_plan_id,
        plannedStart: op.planned_start,
        plannedEnd: op.planned_end,
        durationMinutes: op.duration_minutes,
      })),
    }));
  }

  /**
   * 解析工时统计
   */
  private static parseHoursSummaries(summaries: HoursSummary[]): HoursSummaryRecord[] {
    return summaries.map(s => ({
      employeeId: s.employee_id,
      month: s.month,
      scheduledHours: s.scheduled_hours,
      standardHours: s.standard_hours,
      hoursDeviation: s.hours_deviation,
      workshopHours: s.workshop_hours,
      overtimeHours: s.overtime_hours,
      workDays: s.work_days,
      restDays: s.rest_days,
      bufferDays: s.buffer_days,
      isWithinBounds: s.is_within_bounds,
    }));
  }

  /**
   * 验证解析结果
   */
  static validate(result: ParsedResult): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查分配是否有重复（按岗位）
    const assignmentKeys = new Set<string>();
    for (const a of result.assignments) {
      const key = `${a.batchOperationPlanId}-${a.positionNumber}`;
      if (assignmentKeys.has(key)) {
        errors.push(`重复的分配: 操作 ${a.batchOperationPlanId}, 岗位 ${a.positionNumber}`);
      }
      assignmentKeys.add(key);
    }

    // 检查班次计划是否有重复
    const planKeys = new Set<string>();
    for (const p of result.shiftPlans) {
      const key = `${p.employeeId}-${p.planDate}`;
      if (planKeys.has(key)) {
        errors.push(`重复的班次计划: 员工 ${p.employeeId}, 日期 ${p.planDate}`);
      }
      planKeys.add(key);
    }

    // 警告：没有分配
    if (result.assignments.length === 0) {
      warnings.push('没有生成任何人员分配');
    }

    // 警告：没有班次计划
    if (result.shiftPlans.length === 0) {
      warnings.push('没有生成任何班次计划');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

