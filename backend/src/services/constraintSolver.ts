import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/database";
import {
  ComprehensiveWorkTimeAdapter,
  type ComprehensivePeriod,
  type ConstraintViolation,
  type ScheduleRecord,
} from "./comprehensiveWorkTimeAdapter";

// Re-export ConstraintViolation for convenience
export type { ConstraintViolation };

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * 排班记录（用于约束检查）
 */
export interface ScheduleAssignment {
  employeeId: number;
  date: string;
  planHours: number;
  overtimeHours: number;
  shiftCode?: string;
  operationId?: number;
  operationPlanId?: number;
  operationDuration?: number; // 操作实际时长（小时），用于车间工时计算
  startTime?: string; // HH:mm格式
  endTime?: string; // HH:mm格式
  isLocked?: boolean;
}

/**
 * 员工资质信息
 */
export interface EmployeeQualification {
  qualificationId: number;
  qualificationLevel: number;
}

/**
 * 操作资质要求
 */
export interface OperationQualificationRequirement {
  qualificationId: number;
  minLevel: number;
}

/**
 * 调度上下文（用于约束检查）
 */
export interface SchedulingContext {
  periodStart: string;
  periodEnd: string;
  employees: Map<number, {
    employeeId: number;
    qualifications: EmployeeQualification[];
    maxDailyHours?: number;
    maxConsecutiveDays?: number;
    workTimeSystemType?: string;
    comprehensivePeriod?: ComprehensivePeriod;
  }>;
  operations: Map<number, {
    operationId: number;
    requiredQualifications: OperationQualificationRequirement[];
  }>;
  historicalSchedules: Map<number, ScheduleAssignment[]>; // employeeId -> schedules
}

/**
 * 约束权重配置
 */
export interface ConstraintWeights {
  hardConstraints: {
    timeConflict: number; // 硬约束，权重无穷大
    qualification: number; // 硬约束
    consecutiveDays: number; // 硬约束
    nightRest: number; // 硬约束
    comprehensivePeriodLimit: number; // 综合工时制周期工时上限（硬约束）
    comprehensiveRestDays: number; // 综合工时制休息天数要求（硬约束）
  };
  softConstraints: {
    preference: number; // 可配置权重
    skillMatch: number;
    workloadBalance: number;
    shiftContinuity: number;
    comprehensivePeriodAverage: number; // 综合工时制周期平均工时（软约束）
  };
}

/**
 * 约束检查结果
 */
export interface ConstraintCheckResult {
  isValid: boolean;
  violations: ConstraintViolation[];
  hardViolations: number;
  softViolations: number;
  score: number; // 约束遵循度评分 (0-1)
}

/**
 * 约束修复建议
 */
export interface RepairSuggestion {
  type: string;
  employeeId: number;
  date?: string;
  action: "REMOVE" | "MODIFY" | "REASSIGN" | "ADD_REST";
  description: string;
  priority: number; // 1-10，数字越大优先级越高
  expectedImpact: number; // 预期改善程度 (0-1)
}

/**
 * 约束求解器
 * 
 * 功能：
 * - 硬约束检查（必须满足）
 * - 软约束评估（尽量满足）
 * - 约束修复（回溯、重分配）
 * - 动态约束调整
 */
export class ConstraintSolver {
  private adapter: ComprehensiveWorkTimeAdapter;
  private weights: ConstraintWeights;

  constructor(weights?: Partial<ConstraintWeights>) {
    this.adapter = new ComprehensiveWorkTimeAdapter();
    this.weights = {
      hardConstraints: {
        timeConflict: Infinity, // 硬约束，不可违反
        qualification: Infinity,
        consecutiveDays: Infinity,
        nightRest: Infinity,
        comprehensivePeriodLimit: Infinity,
        comprehensiveRestDays: Infinity,
        ...weights?.hardConstraints,
      },
      softConstraints: {
        preference: 1.0,
        skillMatch: 1.5,
        workloadBalance: 1.0,
        shiftContinuity: 0.8,
        comprehensivePeriodAverage: 1.0,
        ...weights?.softConstraints,
      },
    };
  }

  /**
   * 检查所有约束
   */
  async checkConstraints(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintCheckResult> {
    const violations: ConstraintViolation[] = [];

    // 硬约束检查
    const hardViolations = await this.checkHardConstraints(
      employeeId,
      schedules,
      context
    );
    violations.push(...hardViolations);

    // 软约束评估
    const softViolations = await this.evaluateSoftConstraints(
      employeeId,
      schedules,
      context
    );
    violations.push(...softViolations);

    // 计算评分
    const hardViolationCount = hardViolations.length;
    const softViolationCount = softViolations.length;

    // 评分：无违反=1.0，硬约束违反直接为0，软约束违反按权重扣分
    let score = 1.0;
    if (hardViolationCount > 0) {
      score = 0; // 硬约束违反，方案不可行
    } else {
      // 软约束违反扣分
      const totalSoftPenalty = softViolations.reduce((sum, v) => {
        const weight = this.getSoftConstraintWeight(v.type);
        return sum + weight * 0.1; // 每个软约束违反扣0.1 * 权重
      }, 0);
      score = Math.max(0, 1.0 - totalSoftPenalty);
    }

    return {
      isValid: hardViolationCount === 0,
      violations,
      hardViolations: hardViolationCount,
      softViolations: softViolationCount,
      score,
    };
  }

  /**
   * 检查硬约束
   */
  private async checkHardConstraints(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    // 1. 时间冲突检查
    violations.push(...this.checkTimeConflicts(employeeId, schedules));

    // 2. 资质要求检查
    violations.push(...await this.checkQualificationRequirements(employeeId, schedules, context));

    // 3. 连续工作限制检查
    violations.push(...this.checkConsecutiveDaysLimit(employeeId, schedules, context));

    // 4. 夜班后休息要求检查
    violations.push(...this.checkNightRestRule(employeeId, schedules));

    // 5. 每日工时限制检查
    violations.push(...this.checkDailyHoursLimit(employeeId, schedules, context));

    // 6. 综合工时制约束检查
    violations.push(...await this.checkComprehensiveConstraints(employeeId, schedules, context));

    // 7. 季度标准工时约束检查
    violations.push(...await this.checkQuarterlyStandardHours(employeeId, schedules, context));

    // 8. 月度标准工时约束检查
    violations.push(...await this.checkMonthlyStandardHours(employeeId, schedules, context));

    return violations;
  }

  /**
   * 评估软约束
   */
  private async evaluateSoftConstraints(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    // 1. 偏好匹配度评估
    violations.push(...await this.evaluatePreferenceMatch(employeeId, schedules));

    // 2. 技能匹配度评估
    violations.push(...await this.evaluateSkillMatch(employeeId, schedules, context));

    // 3. 工时均衡度评估
    violations.push(...this.evaluateWorkloadBalance(employeeId, schedules, context));

    // 4. 综合工时制周期平均工时评估
    violations.push(...await this.evaluateComprehensivePeriodAverage(employeeId, schedules, context));

    // 5. 车间工时均衡度评估
    violations.push(...await this.checkShopfloorWorkloadBalance(employeeId, schedules, context));

    return violations;
  }

  /**
   * 检查时间冲突
   */
  private checkTimeConflicts(
    employeeId: number,
    schedules: ScheduleAssignment[]
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // 按日期分组
    const schedulesByDate = new Map<string, ScheduleAssignment[]>();
    schedules.forEach((schedule) => {
      const date = schedule.date;
      if (!schedulesByDate.has(date)) {
        schedulesByDate.set(date, []);
      }
      schedulesByDate.get(date)!.push(schedule);
    });

    // 检查同一天的双重排班
    schedulesByDate.forEach((daySchedules, date) => {
      if (daySchedules.length > 1) {
        violations.push({
          type: "DOUBLE_BOOKING",
          severity: "CRITICAL",
          employeeId,
          message: `员工${employeeId}在${date}有${daySchedules.length}个排班安排，存在双重排班冲突`,
        });
      }
    });

    // 检查时间段重叠
    const sortedSchedules = [...schedules].sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      if (!a.startTime || !b.startTime) return 0;
      return a.startTime.localeCompare(b.startTime);
    });

    for (let i = 0; i < sortedSchedules.length - 1; i++) {
      const current = sortedSchedules[i];
      const next = sortedSchedules[i + 1];

      // 检查是否为同一天
      if (current.date === next.date && current.startTime && current.endTime && next.startTime && next.endTime) {
        // 检查时间段是否重叠
        if (this.intervalsOverlap(
          current.startTime,
          current.endTime,
          next.startTime,
          next.endTime
        )) {
          violations.push({
            type: "TIME_CONFLICT",
            severity: "CRITICAL",
            employeeId,
            message: `员工${employeeId}在${current.date}的排班时间段重叠：${current.startTime}-${current.endTime} 与 ${next.startTime}-${next.endTime}`,
          });
        }
      }

      // 检查跨天班次冲突（夜班）
      if (current.shiftCode?.toUpperCase().includes("NIGHT")) {
        const currentDate = dayjs(current.date);
        const nextDate = dayjs(next.date);
        if (nextDate.diff(currentDate, "day") === 1 && next.startTime) {
          // 夜班结束时间通常是次日早上，如果次日早班开始时间太早，可能冲突
          // 这里简化处理：如果次日有早班（8:00之前），认为可能冲突
          const nextStartHour = parseInt(next.startTime.split(":")[0]);
          if (nextStartHour < 10) {
            violations.push({
              type: "CROSS_DAY_CONFLICT",
              severity: "CRITICAL",
              employeeId,
              message: `员工${employeeId}在${current.date}的夜班与次日${next.date}的早班可能存在冲突`,
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * 检查时间段是否重叠
   */
  private intervalsOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean {
    const [h1, m1] = start1.split(":").map(Number);
    const [h2, m2] = end1.split(":").map(Number);
    const [h3, m3] = start2.split(":").map(Number);
    const [h4, m4] = end2.split(":").map(Number);

    const start1Minutes = h1 * 60 + m1;
    const end1Minutes = h2 * 60 + m2;
    const start2Minutes = h3 * 60 + m3;
    const end2Minutes = h4 * 60 + m4;

    // 处理跨天情况（如夜班）
    const end1Adj = end1Minutes < start1Minutes ? end1Minutes + 24 * 60 : end1Minutes;
    const end2Adj = end2Minutes < start2Minutes ? end2Minutes + 24 * 60 : end2Minutes;

    return !(end1Adj <= start2Minutes || end2Adj <= start1Minutes);
  }

  /**
   * 检查资质要求
   */
  private async checkQualificationRequirements(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee) {
      return violations;
    }

    for (const schedule of schedules) {
      if (!schedule.operationId) {
        continue;
      }

      const operation = context.operations.get(schedule.operationId);
      if (!operation || !operation.requiredQualifications.length) {
        continue;
      }

      // 检查员工是否满足所有资质要求
      for (const requirement of operation.requiredQualifications) {
        const employeeQual = employee.qualifications.find(
          (q) => q.qualificationId === requirement.qualificationId
        );

        if (!employeeQual || employeeQual.qualificationLevel < requirement.minLevel) {
          violations.push({
            type: "QUALIFICATION_REQUIREMENT",
            severity: "CRITICAL",
            employeeId,
            message: `员工${employeeId}不满足操作${schedule.operationId}的资质要求：需要资质${requirement.qualificationId}级别${requirement.minLevel}，但员工只有${employeeQual?.qualificationLevel || 0}级`,
          });
          break; // 一个操作只要有一个资质不满足就违反
        }
      }
    }

    return violations;
  }

  /**
   * 检查连续工作限制
   */
  private checkConsecutiveDaysLimit(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee) {
      return violations;
    }

    const maxConsecutiveDays = employee.maxConsecutiveDays || 6;

    // 按日期排序
    const sortedSchedules = [...schedules]
      .filter((s) => s.planHours > 0 || s.overtimeHours > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sortedSchedules.length === 0) {
      return violations;
    }

    // 获取历史排班
    const historicalSchedules = context.historicalSchedules.get(employeeId) || [];
    const allSchedules = [...historicalSchedules, ...sortedSchedules].sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    // 计算连续工作天数
    let consecutiveDays = 0;
    let lastDate: dayjs.Dayjs | null = null;

    for (const schedule of allSchedules) {
      const scheduleDate = dayjs(schedule.date);
      if (lastDate === null) {
        consecutiveDays = 1;
        lastDate = scheduleDate;
      } else if (scheduleDate.diff(lastDate, "day") === 1) {
        consecutiveDays++;
        lastDate = scheduleDate;
      } else {
        consecutiveDays = 1;
        lastDate = scheduleDate;
      }

      if (consecutiveDays > maxConsecutiveDays) {
        violations.push({
          type: "CONSECUTIVE_DAYS_EXCEEDED",
          severity: "HIGH",
          employeeId,
          message: `员工${employeeId}连续工作${consecutiveDays}天，超过限制${maxConsecutiveDays}天`,
          date: schedule.date,
        });
      }
    }

    return violations;
  }

  /**
   * 检查夜班后休息规则
   */
  private checkNightRestRule(
    employeeId: number,
    schedules: ScheduleAssignment[]
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // 按日期排序
    const sortedSchedules = [...schedules].sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 0; i < sortedSchedules.length - 1; i++) {
      const current = sortedSchedules[i];
      const next = sortedSchedules[i + 1];

      // 检查当前是否为夜班
      const isNightShift =
        current.shiftCode?.toUpperCase().includes("NIGHT") || false;

      if (isNightShift && (next.planHours > 0 || next.overtimeHours > 0)) {
        const daysDiff = dayjs(next.date).diff(dayjs(current.date), "day");

        if (daysDiff < 1) {
          violations.push({
            type: "NIGHT_SHIFT_REST_VIOLATION",
            severity: "CRITICAL",
            employeeId,
            message: `员工${employeeId}在${current.date}的夜班后未休息，次日${next.date}仍有排班`,
            date: next.date,
          });
        } else if (daysDiff === 1) {
          violations.push({
            type: "NIGHT_SHIFT_REST_INSUFFICIENT",
            severity: "MEDIUM",
            employeeId,
            message: `员工${employeeId}在${current.date}的夜班后仅休息1天，建议休息2天`,
            date: next.date,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 检查每日工时限制
   */
  private checkDailyHoursLimit(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee) {
      return violations;
    }

    const maxDailyHours = employee.maxDailyHours || 11;

    // 按日期分组计算每日总工时
    const dailyHours = new Map<string, number>();
    schedules.forEach((schedule) => {
      const totalHours = schedule.planHours + schedule.overtimeHours;
      const current = dailyHours.get(schedule.date) || 0;
      dailyHours.set(schedule.date, current + totalHours);
    });

    dailyHours.forEach((totalHours, date) => {
      if (totalHours > maxDailyHours) {
        violations.push({
          type: "DAILY_HOURS_EXCEEDED",
          severity: "HIGH",
          employeeId,
          message: `员工${employeeId}在${date}的总工时${totalHours.toFixed(2)}h，超过限制${maxDailyHours}h`,
        });
      }
    });

    return violations;
  }

  /**
   * 检查综合工时制约束
   */
  private async checkComprehensiveConstraints(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee || employee.workTimeSystemType !== "COMPREHENSIVE" || !employee.comprehensivePeriod) {
      return violations;
    }

    // 转换为 ScheduleRecord 格式
    const scheduleRecords: ScheduleRecord[] = schedules.map((s) => ({
      date: s.date,
      planHours: s.planHours,
      overtimeHours: s.overtimeHours,
    }));

    // 使用 ComprehensiveWorkTimeAdapter 检查约束
    const adapterViolations = await this.adapter.checkComprehensiveConstraints(
      employeeId,
      scheduleRecords,
      employee.comprehensivePeriod
    );

    violations.push(...adapterViolations);

    return violations;
  }

  /**
   * 检查季度标准工时约束
   */
  private async checkQuarterlyStandardHours(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    if (schedules.length === 0) {
      return violations;
    }

    try {
      // 计算季度累计工时
      // 总工时只计算planHours，不包括overtimeHours
      const quarterHours = schedules.reduce(
        (sum, s) => sum + (s.planHours || 0), // 只计算planHours
        0
      );

      // 动态计算季度标准工时（基于工作日，不依赖废弃的quarterly_standard_hours表）
      const periodStart = dayjs(context.periodStart);
      const quarterStart = periodStart.startOf("quarter");
      const quarterEnd = periodStart.endOf("quarter");
      
      // 使用 ComprehensiveWorkTimeAdapter 计算工作日数
      const workingDays = await this.adapter.calculateWorkingDays(
        quarterStart.format("YYYY-MM-DD"),
        quarterEnd.format("YYYY-MM-DD")
      );
      
      const standardHours = workingDays * 8; // 标准日工时8小时
      
      if (standardHours > 0) {
        const upperLimit = standardHours + 40; // 上限：标准工时 + 40小时
        const lowerLimit = standardHours; // 下限：标准工时（不得低于）

        if (quarterHours > upperLimit) {
          violations.push({
            type: "QUARTERLY_STANDARD_HOURS_EXCEEDED",
            severity: "CRITICAL",
            employeeId,
            message: `季度工时${quarterHours.toFixed(2)}h，超过上限${upperLimit.toFixed(2)}h（标准工时${standardHours.toFixed(2)}h，工作日${workingDays}天 + 40h）`,
          });
        } else if (quarterHours < lowerLimit) {
          violations.push({
            type: "QUARTERLY_STANDARD_HOURS_INSUFFICIENT",
            severity: "CRITICAL",
            employeeId,
            message: `季度工时${quarterHours.toFixed(2)}h，低于标准工时${standardHours.toFixed(2)}h（工作日${workingDays}天）`,
          });
        }
      }
    } catch (error) {
      console.error(`Error checking quarterly standard hours for employee ${employeeId}:`, error);
      // 如果表不存在或其他错误，不抛出异常，只记录日志
    }

    return violations;
  }

  /**
   * 检查月度标准工时约束
   */
  private async checkMonthlyStandardHours(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    if (schedules.length === 0) {
      return violations;
    }

    try {
      // 按月份分组计算月度工时
      // 总工时只计算planHours，不包括overtimeHours
      const monthlyHours = new Map<string, number>(); // monthKey -> totalHours
      schedules.forEach((schedule) => {
        const monthKey = dayjs(schedule.date).format("YYYY-MM");
        const current = monthlyHours.get(monthKey) || 0;
        monthlyHours.set(monthKey, current + (schedule.planHours || 0)); // 只计算planHours
      });

      // 获取员工月度标准工时配置
      const periodStart = context.periodStart;
      const employeeConfig = await this.adapter.getWorkTimeSystemConfig(employeeId, periodStart);
      const defaultStandardHours = employeeConfig?.monthStandardHours;

      // 检查每个月的工时
      for (const [monthKey, monthHours] of monthlyHours) {
        let standardHours = defaultStandardHours;

        // 如果没有配置，动态计算月度标准工时
        if (!standardHours || standardHours <= 0) {
          // 计算该月的工作日数
          const monthStart = dayjs(`${monthKey}-01`);
          const monthEnd = monthStart.endOf("month");
          
          const workingDays = await this.adapter.calculateWorkingDays(
            monthStart.format("YYYY-MM-DD"),
            monthEnd.format("YYYY-MM-DD")
          );
          
          standardHours = workingDays * 8; // 标准日工时8小时
        }

        if (standardHours && standardHours > 0) {
          const upperLimit = standardHours + 20; // 上限：标准工时 + 20小时
          const lowerLimit = standardHours; // 下限：标准工时（不得低于）
          if (monthHours > upperLimit) {
            violations.push({
              type: "MONTHLY_STANDARD_HOURS_EXCEEDED",
              severity: "CRITICAL",
              employeeId,
              date: `${monthKey}-01`, // 使用月份的第一天作为日期标识
              message: `${monthKey}月度工时${monthHours.toFixed(2)}h，超过上限${upperLimit.toFixed(2)}h（标准工时${standardHours.toFixed(2)}h + 20h）`,
            });
          } else if (monthHours < lowerLimit) {
            violations.push({
              type: "MONTHLY_STANDARD_HOURS_INSUFFICIENT",
              severity: "CRITICAL",
              employeeId,
              date: `${monthKey}-01`, // 使用月份的第一天作为日期标识
              message: `${monthKey}月度工时${monthHours.toFixed(2)}h，低于标准工时${standardHours.toFixed(2)}h`,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error checking monthly standard hours for employee ${employeeId}:`, error);
      // 如果配置不存在或其他错误，不抛出异常，只记录日志
    }

    return violations;
  }

  /**
   * 评估偏好匹配度
   */
  private async evaluatePreferenceMatch(
    employeeId: number,
    schedules: ScheduleAssignment[]
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    // 这里简化处理：如果排班中没有偏好信息，不评估
    // 实际实现应该查询 employee_shift_preferences 表
    // 暂时返回空数组

    return violations;
  }

  /**
   * 评估技能匹配度
   */
  private async evaluateSkillMatch(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee) {
      return violations;
    }

    for (const schedule of schedules) {
      if (!schedule.operationId) {
        continue;
      }

      const operation = context.operations.get(schedule.operationId);
      if (!operation || !operation.requiredQualifications.length) {
        continue;
      }

      // 计算技能匹配度
      let matchScore = 0;
      let allMatch = true;

      for (const requirement of operation.requiredQualifications) {
        const employeeQual = employee.qualifications.find(
          (q) => q.qualificationId === requirement.qualificationId
        );

        if (!employeeQual || employeeQual.qualificationLevel < requirement.minLevel) {
          allMatch = false;
          break;
        }

        matchScore += Math.min(1, employeeQual.qualificationLevel / requirement.minLevel);
      }

      const finalScore = allMatch ? matchScore / operation.requiredQualifications.length : 0;

      // 如果匹配度低于0.8，记录为软约束违反
      if (finalScore < 0.8) {
        violations.push({
          type: "QUALIFICATION_MATCH",
          severity: "MEDIUM",
          employeeId,
          message: `员工${employeeId}对操作${schedule.operationId}的技能匹配度较低：${(finalScore * 100).toFixed(1)}%`,
          date: schedule.date,
        });
      }
    }

    return violations;
  }

  /**
   * 评估工时均衡度
   * 注意：总工时只计算planHours，不包括overtimeHours（加班工时不计入总工时）
   */
  private evaluateWorkloadBalance(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    // 计算员工总工时（只计算planHours）
    const totalHours = schedules.reduce(
      (sum, s) => sum + s.planHours, // 只计算planHours
      0
    );

    // 计算所有员工的平均工时（只计算planHours）
    let totalAllHours = 0;
    let employeeCount = 0;

    context.employees.forEach((emp) => {
      const empSchedules = schedules.filter((s) => s.employeeId === emp.employeeId);
      const empHours = empSchedules.reduce(
        (sum, s) => sum + s.planHours, // 只计算planHours
        0
      );
      totalAllHours += empHours;
      employeeCount++;
    });

    if (employeeCount === 0) {
      return violations;
    }

    const averageHours = totalAllHours / employeeCount;
    const deviation = Math.abs(totalHours - averageHours);

    // 如果偏差超过平均值的20%，记录为软约束违反
    if (deviation > averageHours * 0.2) {
      violations.push({
        type: "WORKLOAD_BALANCE",
        severity: "MEDIUM",
        employeeId,
        message: `员工${employeeId}的工时${totalHours.toFixed(2)}h与平均值${averageHours.toFixed(2)}h偏差较大：${deviation.toFixed(2)}h`,
      });
    }

    return violations;
  }

  /**
   * 评估综合工时制周期平均工时
   */
  private async evaluateComprehensivePeriodAverage(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];
    const employee = context.employees.get(employeeId);

    if (!employee || employee.workTimeSystemType !== "COMPREHENSIVE" || !employee.comprehensivePeriod) {
      return violations;
    }

    // 转换为 ScheduleRecord 格式
    const scheduleRecords: ScheduleRecord[] = schedules.map((s) => ({
      date: s.date,
      planHours: s.planHours,
      overtimeHours: s.overtimeHours,
    }));

    // 计算周期范围
    const referenceDate = schedules.length > 0 ? schedules[0].date : dayjs().format("YYYY-MM-DD");
    const periodStart = this.adapter.getPeriodStart(referenceDate, employee.comprehensivePeriod);
    const periodEnd = this.adapter.getPeriodEnd(referenceDate, employee.comprehensivePeriod);

    // 计算周期累计工时
    const accumulatedHours = await this.adapter.calculatePeriodAccumulatedHoursFromSchedules(
      scheduleRecords,
      periodStart,
      periodEnd,
      true // 排除法定节假日
    );

    // 计算工作日数
    const workingDays = await this.adapter.calculateWorkingDays(periodStart, periodEnd);

    if (workingDays > 0) {
      const avgDailyHours = accumulatedHours / workingDays;

      // 如果平均日工时超过8.5小时，记录为软约束违反
      if (avgDailyHours > 8.5) {
        violations.push({
          type: "COMPREHENSIVE_AVG_DAILY_HOURS",
          severity: "MEDIUM",
          employeeId,
          message: `员工${employeeId}的综合工时制${employee.comprehensivePeriod}周期平均日工时${avgDailyHours.toFixed(2)}h过高（工作日: ${workingDays}天）`,
          period: employee.comprehensivePeriod,
          accumulatedHours,
        });
      }
    }

    return violations;
  }

  /**
   * 检查车间工时均衡度
   * 车间工时 = operationPlanId > 0 的工时（操作任务工时）
   * 目的：确保员工之间执行操作任务的工时相对均衡，实现劳动公平性
   */
  private async checkShopfloorWorkloadBalance(
    employeeId: number,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];

    // 1. 计算当前员工的车间工时（只统计操作任务工时）
    // 车间工时应该使用操作实际时长（operationDuration），而不是planHours（班次标准工时）
    const employeeShopfloorHours = schedules
      .filter((s) => s.operationPlanId && s.operationPlanId > 0)
      .reduce((sum, s) => {
        // 优先使用operationDuration（操作实际时长），如果没有则使用planHours + overtimeHours
        const operationHours = s.operationDuration ?? (s.planHours + s.overtimeHours);
        return sum + operationHours;
      }, 0);

    // 2. 计算所有员工的车间工时
    const allShopfloorHours = new Map<number, number>();
    context.employees.forEach((emp) => {
      const empSchedules = schedules.filter((s) => s.employeeId === emp.employeeId);
      const shopfloorHours = empSchedules
        .filter((s) => s.operationPlanId && s.operationPlanId > 0)
        .reduce((sum, s) => {
          // 优先使用operationDuration（操作实际时长），如果没有则使用planHours + overtimeHours
          const operationHours = s.operationDuration ?? (s.planHours + s.overtimeHours);
          return sum + operationHours;
        }, 0);
      allShopfloorHours.set(emp.employeeId, shopfloorHours);
    });

    // 3. 计算车间工时平均值
    const shopfloorHoursArray = Array.from(allShopfloorHours.values());
    if (shopfloorHoursArray.length === 0) {
      return violations;
    }

    const meanShopfloorHours = shopfloorHoursArray.reduce((sum, h) => sum + h, 0) / shopfloorHoursArray.length;
    
    if (meanShopfloorHours === 0) {
      return violations; // 如果平均车间工时为0，无需检查
    }

    // 4. 计算车间工时方差
    const variance = shopfloorHoursArray.reduce(
      (sum, h) => sum + Math.pow(h - meanShopfloorHours, 2),
      0
    ) / shopfloorHoursArray.length;

    // 5. 如果方差过大（超过10000，约100小时的差异），记录为软约束违反
    if (variance > 10000) {
      const deviation = Math.abs(employeeShopfloorHours - meanShopfloorHours);
      
      // 如果当前员工的车间工时与平均值偏差超过50小时，记录违反
      if (deviation > 50) {
        violations.push({
          type: "SHOPFLOOR_WORKLOAD_BALANCE",
          severity: "MEDIUM",
          employeeId,
          message: `员工${employeeId}的车间工时${employeeShopfloorHours.toFixed(2)}h与平均值${meanShopfloorHours.toFixed(2)}h偏差较大：${deviation.toFixed(2)}h（车间工时方差：${variance.toFixed(2)}）`,
        });
      }
    }

    return violations;
  }

  /**
   * 修复约束违反
   */
  async repairViolations(
    violations: ConstraintViolation[],
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<{
    repairedSchedules: ScheduleAssignment[];
    repairSuggestions: RepairSuggestion[];
    success: boolean;
  }> {
    const repairSuggestions: RepairSuggestion[] = [];
    let repairedSchedules = [...schedules];
    let success = true;

    // 按严重程度排序：CRITICAL > HIGH > MEDIUM > LOW
    const sortedViolations = [...violations].sort((a, b) => {
      const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });

    for (const violation of sortedViolations) {
      const suggestion = await this.generateRepairSuggestion(
        violation,
        repairedSchedules,
        context
      );

      if (suggestion) {
        repairSuggestions.push(suggestion);

        // 尝试应用修复建议
        const repaired = this.applyRepairSuggestion(
          suggestion,
          repairedSchedules,
          context
        );

        if (repaired) {
          repairedSchedules = repaired;
        } else {
          // 如果无法修复硬约束，标记为失败
          if (violation.severity === "CRITICAL" || violation.severity === "HIGH") {
            success = false;
          }
        }
      }
    }

    return {
      repairedSchedules,
      repairSuggestions,
      success,
    };
  }

  /**
   * 生成修复建议
   */
  private async generateRepairSuggestion(
    violation: ConstraintViolation,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): Promise<RepairSuggestion | null> {
    switch (violation.type) {
      case "DOUBLE_BOOKING":
      case "TIME_CONFLICT":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          date: violation.date,
          action: "REMOVE",
          description: `移除员工${violation.employeeId}在${violation.date}的重复排班`,
          priority: 10,
          expectedImpact: 1.0,
        };

      case "QUALIFICATION_REQUIREMENT":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          date: violation.date,
          action: "REASSIGN",
          description: `重新分配员工${violation.employeeId}，因为资质不满足要求`,
          priority: 9,
          expectedImpact: 1.0,
        };

      case "CONSECUTIVE_DAYS_EXCEEDED":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          date: violation.date,
          action: "ADD_REST",
          description: `员工${violation.employeeId}连续工作天数超限，需要添加休息日`,
          priority: 8,
          expectedImpact: 0.9,
        };

      case "NIGHT_SHIFT_REST_VIOLATION":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          date: violation.date,
          action: "REMOVE",
          description: `移除员工${violation.employeeId}在${violation.date}的排班，因为夜班后需要休息`,
          priority: 9,
          expectedImpact: 1.0,
        };

      case "DAILY_HOURS_EXCEEDED":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          date: violation.date,
          action: "MODIFY",
          description: `减少员工${violation.employeeId}在${violation.date}的工时`,
          priority: 7,
          expectedImpact: 0.8,
        };

      case "COMPREHENSIVE_PERIOD_LIMIT":
        return {
          type: violation.type,
          employeeId: violation.employeeId,
          action: "MODIFY",
          description: `调整员工${violation.employeeId}的综合工时制周期工时，使其不超过上限`,
          priority: 8,
          expectedImpact: 0.9,
        };

      default:
        return null;
    }
  }

  /**
   * 应用修复建议
   */
  private applyRepairSuggestion(
    suggestion: RepairSuggestion,
    schedules: ScheduleAssignment[],
    context: SchedulingContext
  ): ScheduleAssignment[] | null {
    const repaired = [...schedules];

    switch (suggestion.action) {
      case "REMOVE":
        if (suggestion.date) {
          return repaired.filter(
            (s) => !(s.employeeId === suggestion.employeeId && s.date === suggestion.date)
          );
        }
        break;

      case "MODIFY":
        if (suggestion.date) {
          return repaired.map((s) => {
            if (s.employeeId === suggestion.employeeId && s.date === suggestion.date) {
              // 减少工时
              return {
                ...s,
                planHours: Math.max(0, s.planHours * 0.5),
                overtimeHours: Math.max(0, s.overtimeHours * 0.5),
              };
            }
            return s;
          });
        }
        break;

      case "REASSIGN":
        // 移除该员工的排班，需要外部重新分配
        return repaired.filter((s) => s.employeeId !== suggestion.employeeId);

      case "ADD_REST":
        // 添加休息日：移除该日期的排班
        if (suggestion.date) {
          return repaired.filter(
            (s) => !(s.employeeId === suggestion.employeeId && s.date === suggestion.date)
          );
        }
        break;
    }

    return null;
  }

  /**
   * 获取软约束权重
   */
  private getSoftConstraintWeight(constraintType: string): number {
    const typeMap: Record<string, keyof ConstraintWeights["softConstraints"]> = {
      PREFERENCE_MATCH: "preference",
      QUALIFICATION_MATCH: "skillMatch",
      WORKLOAD_BALANCE: "workloadBalance",
      COMPREHENSIVE_AVG_DAILY_HOURS: "comprehensivePeriodAverage",
      SHOPFLOOR_WORKLOAD_BALANCE: "workloadBalance", // 使用相同的权重
    };

    const key = typeMap[constraintType];
    return key ? this.weights.softConstraints[key] : 1.0;
  }

  /**
   * 动态调整约束权重
   */
  adjustWeights(adjustments: Partial<ConstraintWeights>): void {
    this.weights = {
      hardConstraints: {
        ...this.weights.hardConstraints,
        ...adjustments.hardConstraints,
      },
      softConstraints: {
        ...this.weights.softConstraints,
        ...adjustments.softConstraints,
      },
    };
  }

  /**
   * 获取当前约束权重
   */
  getWeights(): ConstraintWeights {
    return { ...this.weights };
  }
}

