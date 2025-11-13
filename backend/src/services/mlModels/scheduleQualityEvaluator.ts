import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../../config/database";
import ComprehensiveWorkTimeAdapter from "../../services/comprehensiveWorkTimeAdapter";

dayjs.extend(quarterOfYear);

/**
 * 排班质量指标
 */
export interface ScheduleQualityMetrics {
  overallScore: number; // 总体质量评分 (0-1)
  constraintCompliance: number; // 约束遵循度 (0-1)
  costEfficiency: number; // 成本效率 (0-1)
  employeeSatisfaction: number; // 员工满意度 (0-1)
  workloadBalance: number; // 工时均衡度 (0-1)
  skillMatch: number; // 技能匹配度 (0-1)
  comprehensiveWorkTimeCompliance?: number; // 综合工时制合规度 (0-1)（新增）
  details: {
    constraintViolations: ConstraintViolation[];
    costBreakdown: CostBreakdown;
    satisfactionBreakdown: SatisfactionBreakdown;
    workloadDistribution: WorkloadDistribution;
    skillMatchDetails: SkillMatchDetail[];
    comprehensiveWorkTimeDetails?: ComprehensiveWorkTimeDetail[]; // 新增
  };
  recommendations: string[]; // 改进建议
}

/**
 * 约束违反记录
 */
export interface ConstraintViolation {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  employeeId?: number;
  employeeName?: string;
  date?: string;
  description: string;
}

/**
 * 成本明细
 */
export interface CostBreakdown {
  totalCost: number;
  baseCost: number;
  overtimeCost: number;
  overheadCost: number;
  costPerEmployee: number;
}

/**
 * 满意度明细
 */
export interface SatisfactionBreakdown {
  averagePreferenceMatch: number;
  employeesWithHighSatisfaction: number;
  employeesWithLowSatisfaction: number;
  preferenceMatchDistribution: Record<string, number>;
}

/**
 * 工时分布
 */
export interface WorkloadDistribution {
  variance: number; // 工时方差
  maxDeviation: number; // 最大偏差
  employeesOverTarget: number; // 超过目标的员工数
  employeesUnderTarget: number; // 低于目标的员工数
  quarterlyDistribution: Record<string, number>; // 季度分布
  monthlyDistribution: Record<string, number>; // 月度分布
}

/**
 * 技能匹配明细
 */
export interface SkillMatchDetail {
  operationId: number;
  operationName: string;
  averageSkillMatch: number;
  employeesWithInsufficientSkills: number;
}

/**
 * 综合工时制合规明细（新增）
 */
export interface ComprehensiveWorkTimeDetail {
  employeeId: number;
  employeeName: string;
  workTimeSystemType: string;
  period: string;
  accumulatedHours: number;
  targetHours: number;
  complianceRate: number;
  violations: string[];
}

/**
 * 排班质量评估请求
 */
export interface ScheduleQualityEvaluationRequest {
  schedules: Array<{
    employeeId: number;
    date: string;
    shiftCode?: string;
    planHours: number;
    overtimeHours: number;
    operationPlanId?: number;
    operationId?: number;
  }>;
  period: {
    startDate: string;
    endDate: string;
  };
  employeeIds?: number[];
  operationIds?: number[];
}

/**
 * 排班质量评估模型
 * 
 * 多维度评估排班方案的整体质量
 */
export class ScheduleQualityEvaluator {
  private comprehensiveAdapter: ComprehensiveWorkTimeAdapter;

  constructor() {
    this.comprehensiveAdapter = new ComprehensiveWorkTimeAdapter();
  }

  /**
   * 评估排班质量
   */
  async evaluateQuality(
    request: ScheduleQualityEvaluationRequest
  ): Promise<ScheduleQualityMetrics> {
    // 1. 约束遵循度评估
    const constraintCompliance = await this.evaluateConstraintCompliance(
      request.schedules,
      request.period
    );

    // 2. 成本效率评估
    const costEfficiencyResult = this.evaluateCostEfficiency(request.schedules);
    const costEfficiency = costEfficiencyResult.score;

    // 3. 员工满意度评估
    const employeeSatisfaction = await this.evaluateEmployeeSatisfaction(
      request.schedules
    );

    // 4. 工时均衡度评估
    const workloadBalance = await this.evaluateWorkloadBalance(
      request.schedules,
      request.period
    );

    // 5. 技能匹配度评估
    const skillMatchResult = await this.evaluateSkillMatch(request.schedules);
    const skillMatch = skillMatchResult.score;

    // 6. 综合工时制合规度评估（新增）
    const comprehensiveWorkTimeCompliance =
      await this.evaluateComprehensiveWorkTimeCompliance(
        request.schedules,
        request.period
      );
    
    // 确保返回的是数字，不是NaN
    const complianceScore = comprehensiveWorkTimeCompliance?.score ?? 1.0;
    const complianceValue = isNaN(complianceScore) ? 1.0 : complianceScore;

    // 7. 综合评分
    // 确保所有值都是有效数字，避免NaN
    const constraintScore = isNaN(constraintCompliance.score) ? 1.0 : constraintCompliance.score;
    const costEffScore = isNaN(costEfficiency) ? 1.0 : costEfficiency;
    const satisfScore = isNaN(employeeSatisfaction.score) ? 0.5 : employeeSatisfaction.score;
    const balanceScore = isNaN(workloadBalance.score) ? 1.0 : workloadBalance.score;
    const skillScore = isNaN(skillMatch) ? 1.0 : skillMatch;
    
    const overallScore = this.calculateOverallScore({
      constraintCompliance: constraintScore,
      costEfficiency: costEffScore,
      employeeSatisfaction: satisfScore,
      workloadBalance: balanceScore,
      skillMatch: skillScore,
      comprehensiveWorkTimeCompliance: complianceValue,
    });

    // 8. 生成改进建议
    const recommendations = this.generateRecommendations({
      constraintCompliance: constraintCompliance.score,
      costEfficiency,
      employeeSatisfaction: employeeSatisfaction.score,
      workloadBalance: workloadBalance.score,
      skillMatch,
      comprehensiveWorkTimeCompliance: complianceValue,
      constraintViolations: constraintCompliance.violations,
    });

    return {
      overallScore,
      constraintCompliance: constraintCompliance.score,
      costEfficiency,
      employeeSatisfaction: employeeSatisfaction.score,
      workloadBalance: workloadBalance.score,
      skillMatch,
      comprehensiveWorkTimeCompliance: complianceValue,
      details: {
        constraintViolations: constraintCompliance.violations,
        costBreakdown: costEfficiencyResult.costBreakdown,
        satisfactionBreakdown: employeeSatisfaction.breakdown,
        workloadDistribution: workloadBalance.distribution,
        skillMatchDetails: skillMatchResult.details,
        comprehensiveWorkTimeDetails:
          comprehensiveWorkTimeCompliance?.details || [],
      },
      recommendations,
    };
  }

  /**
   * 评估约束遵循度
   */
  private async evaluateConstraintCompliance(
    schedules: ScheduleQualityEvaluationRequest["schedules"],
    period: { startDate: string; endDate: string }
  ): Promise<{
    score: number;
    violations: ConstraintViolation[];
  }> {
    const violations: ConstraintViolation[] = [];

    // 按员工分组
    const employeeSchedules = new Map<
      number,
      Array<ScheduleQualityEvaluationRequest["schedules"][0]>
    >();
    schedules.forEach((schedule) => {
      const employeeId = schedule.employeeId;
      if (!employeeSchedules.has(employeeId)) {
        employeeSchedules.set(employeeId, []);
      }
      employeeSchedules.get(employeeId)!.push(schedule);
    });

    // 检查每个员工的约束违反
    for (const [employeeId, empSchedules] of employeeSchedules) {
      // 检查连续工作天数
      const consecutiveViolations = this.checkConsecutiveDays(empSchedules);
      violations.push(...consecutiveViolations);

      // 检查每日工时限制
      const dailyHoursViolations = this.checkDailyHoursLimit(empSchedules);
      violations.push(...dailyHoursViolations);

      // 检查季度工时限制
      const quarterlyViolations = await this.checkQuarterlyHoursLimit(
        employeeId,
        empSchedules,
        period
      );
      violations.push(...quarterlyViolations);

      // 检查月度标准工时限制
      const monthlyViolations = await this.checkMonthlyStandardHours(
        employeeId,
        empSchedules,
        period
      );
      violations.push(...monthlyViolations);

      // 检查夜班后休息
      const nightRestViolations = this.checkNightRestRule(empSchedules);
      violations.push(...nightRestViolations);
    }

    // 计算遵循度评分
    const totalViolations = violations.length;
    const criticalViolations = violations.filter(
      (v) => v.severity === "CRITICAL"
    ).length;
    const highViolations = violations.filter(
      (v) => v.severity === "HIGH"
    ).length;

    // 评分：无违反=1.0，每10个违反扣0.1，严重违反额外扣分
    let score = 1.0;
    score -= (totalViolations * 0.01);
    score -= (criticalViolations * 0.1);
    score -= (highViolations * 0.05);
    score = Math.max(0, Math.min(1, score));

    return { score, violations };
  }

  /**
   * 检查连续工作天数
   */
  private checkConsecutiveDays(
    schedules: Array<ScheduleQualityEvaluationRequest["schedules"][0]>
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    
    if (schedules.length === 0) {
      return violations;
    }
    
    const sortedSchedules = [...schedules].sort((a, b) =>
      dayjs(a.date).diff(dayjs(b.date))
    );

    let consecutiveDays = 0;
    let lastDate: dayjs.Dayjs | null = null;

    for (const schedule of sortedSchedules) {
      if ((schedule.planHours || 0) === 0) {
        // 休息日，重置连续天数
        consecutiveDays = 0;
        lastDate = null;
        continue;
      }

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

      if (consecutiveDays > 6) {
        violations.push({
          type: "CONSECUTIVE_DAYS_EXCEEDED",
          severity: "HIGH",
          employeeId: schedule.employeeId,
          date: schedule.date,
          description: `连续工作${consecutiveDays}天，超过6天限制`,
        });
      }
    }

    return violations;
  }

  /**
   * 检查每日工时限制
   */
  /**
   * 检查每日工时限制
   * 注意：每日工时限制检查需要包含overtimeHours（因为这是检查每日总工时是否超过11小时）
   */
  private checkDailyHoursLimit(
    schedules: Array<ScheduleQualityEvaluationRequest["schedules"][0]>
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];

    schedules.forEach((schedule) => {
      // 每日工时限制检查包含overtimeHours（检查每日总工时是否超过11小时）
      const totalHours = (schedule.planHours || 0) + (schedule.overtimeHours || 0);
      if (totalHours > 11) {
        violations.push({
          type: "DAILY_HOURS_EXCEEDED",
          severity: "HIGH",
          employeeId: schedule.employeeId,
          date: schedule.date,
          description: `每日总工时${totalHours.toFixed(2)}h，超过11小时限制`,
        });
      }
    });

    return violations;
  }

  /**
   * 检查季度工时限制
   */
  private async checkQuarterlyHoursLimit(
    employeeId: number,
    schedules: Array<ScheduleQualityEvaluationRequest["schedules"][0]>,
    period: { startDate: string; endDate: string }
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
      const startDate = dayjs(period.startDate);
      const quarterStart = startDate.startOf("quarter");
      const quarterEnd = startDate.endOf("quarter");
      
      // 使用 ComprehensiveWorkTimeAdapter 计算工作日数
      const workingDays = await this.comprehensiveAdapter.calculateWorkingDays(
        quarterStart.format("YYYY-MM-DD"),
        quarterEnd.format("YYYY-MM-DD")
      );
      
      const standardHours = workingDays * 8; // 标准日工时8小时
      
      if (standardHours > 0) {
        const upperLimit = standardHours + 40; // 上限：标准工时 + 40小时
        const lowerLimit = standardHours; // 下限：标准工时（不得低于）

        if (quarterHours > upperLimit) {
          violations.push({
            type: "QUARTERLY_HOURS_EXCEEDED",
            severity: "CRITICAL",
            employeeId,
            description: `季度工时${quarterHours.toFixed(2)}h，超过上限${upperLimit.toFixed(2)}h（标准工时${standardHours.toFixed(2)}h，工作日${workingDays}天 + 40h）`,
          });
        } else if (quarterHours < lowerLimit) {
          violations.push({
            type: "QUARTERLY_HOURS_INSUFFICIENT",
            severity: "CRITICAL",
            employeeId,
            description: `季度工时${quarterHours.toFixed(2)}h，低于标准工时${standardHours.toFixed(2)}h（工作日${workingDays}天）`,
          });
        }
      }
    } catch (error) {
      console.error("Failed to check quarterly hours limit:", error);
    }

    return violations;
  }

  /**
   * 检查月度标准工时约束
   * 要求：不得低于月度标准工时，不得高于月度标准工时+20小时
   */
  private async checkMonthlyStandardHours(
    employeeId: number,
    schedules: Array<ScheduleQualityEvaluationRequest["schedules"][0]>,
    period: { startDate: string; endDate: string }
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
        monthlyHours.set(
          monthKey,
          current + (schedule.planHours || 0) // 只计算planHours
        );
      });

      // 获取员工月度标准工时配置
      const employeeConfig = await this.comprehensiveAdapter.getWorkTimeSystemConfig(
        employeeId,
        period.startDate
      );

      // 检查每个月的工时
      for (const [monthKey, monthHours] of monthlyHours) {
        let standardHours = employeeConfig?.monthStandardHours;

        // 如果没有配置，动态计算月度标准工时
        if (!standardHours || standardHours <= 0) {
          // 计算该月的工作日数
          const monthStart = dayjs(`${monthKey}-01`);
          const monthEnd = monthStart.endOf("month");
          
          const workingDays = await this.comprehensiveAdapter.calculateWorkingDays(
            monthStart.format("YYYY-MM-DD"),
            monthEnd.format("YYYY-MM-DD")
          );
          
          standardHours = workingDays * 8; // 标准日工时8小时
        }

        if (!standardHours || standardHours <= 0) {
          continue; // 无法计算月度标准工时，跳过该月
        }
        
        const upperLimit = standardHours + 20; // 上限：标准工时 + 20小时
        const lowerLimit = standardHours; // 下限：标准工时（不得低于）
        if (monthHours > upperLimit) {
          violations.push({
            type: "MONTHLY_STANDARD_HOURS_EXCEEDED",
            severity: "CRITICAL",
            employeeId,
            date: `${monthKey}-01`, // 使用月初日期作为标识
            description: `${monthKey}月度工时${monthHours.toFixed(2)}h，超过上限${upperLimit.toFixed(2)}h（标准工时${standardHours.toFixed(2)}h + 20h）`,
          });
        } else if (monthHours < lowerLimit) {
          violations.push({
            type: "MONTHLY_STANDARD_HOURS_INSUFFICIENT",
            severity: "CRITICAL",
            employeeId,
            date: `${monthKey}-01`, // 使用月初日期作为标识
            description: `${monthKey}月度工时${monthHours.toFixed(2)}h，低于标准工时${standardHours.toFixed(2)}h`,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to check monthly standard hours for employee ${employeeId}:`, error);
    }

    return violations;
  }

  /**
   * 检查夜班后休息规则
   */
  private checkNightRestRule(
    schedules: Array<ScheduleQualityEvaluationRequest["schedules"][0]>
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    
    if (schedules.length < 2) {
      return violations;
    }
    
    const sortedSchedules = [...schedules].sort((a, b) =>
      dayjs(a.date).diff(dayjs(b.date))
    );

    for (let i = 0; i < sortedSchedules.length - 1; i++) {
      const current = sortedSchedules[i];
      const next = sortedSchedules[i + 1];

      // 检查是否为夜班
      const isNightShift =
        current.shiftCode?.toUpperCase().includes("NIGHT") || false;

      if (isNightShift && (next.planHours || 0) > 0) {
        const daysDiff = dayjs(next.date).diff(dayjs(current.date), "day");
        if (daysDiff < 1) {
          violations.push({
            type: "NIGHT_SHIFT_REST_VIOLATION",
            severity: "CRITICAL",
            employeeId: current.employeeId,
            date: next.date,
            description: `夜班后未休息，次日仍有排班`,
          });
        } else if (daysDiff === 1) {
          violations.push({
            type: "NIGHT_SHIFT_REST_INSUFFICIENT",
            severity: "MEDIUM",
            employeeId: current.employeeId,
            date: next.date,
            description: `夜班后仅休息1天，建议休息2天`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * 评估成本效率
   */
  private evaluateCostEfficiency(
    schedules: ScheduleQualityEvaluationRequest["schedules"]
  ): {
    score: number;
    costBreakdown: CostBreakdown;
  } {
    // 基础成本（假设每小时100元）
    const baseHourlyRate = 100;
    const overtimeMultiplier = 1.5; // 加班倍率

    let totalBaseHours = 0;
    let totalOvertimeHours = 0;

    schedules.forEach((schedule) => {
      totalBaseHours += schedule.planHours || 0;
      totalOvertimeHours += schedule.overtimeHours || 0;
    });

    const baseCost = totalBaseHours * baseHourlyRate;
    const overtimeCost = totalOvertimeHours * baseHourlyRate * overtimeMultiplier;
    const totalCost = baseCost + overtimeCost;
    const overheadCost = totalCost * 0.1; // 10%管理成本

    const employeeCount = new Set(schedules.map((s) => s.employeeId)).size;
    const costPerEmployee = employeeCount > 0 ? totalCost / employeeCount : 0;

    const costBreakdown: CostBreakdown = {
      totalCost: totalCost + overheadCost,
      baseCost,
      overtimeCost,
      overheadCost,
      costPerEmployee,
    };

    // 评分：加班工时比例越低，评分越高
    const totalHours = totalBaseHours + totalOvertimeHours;
    const overtimeRatio = totalHours > 0 ? totalOvertimeHours / totalHours : 0;
    const score = Math.max(0, 1 - overtimeRatio * 2); // 加班比例每增加10%，扣0.2分

    return { score, costBreakdown };
  }

  /**
   * 评估员工满意度
   */
  private async evaluateEmployeeSatisfaction(
    schedules: ScheduleQualityEvaluationRequest["schedules"]
  ): Promise<{
    score: number;
    breakdown: SatisfactionBreakdown;
  }> {
    const employeeSatisfaction = new Map<number, number[]>();

    // 为每个员工计算满意度
    for (const schedule of schedules) {
      if (!employeeSatisfaction.has(schedule.employeeId)) {
        employeeSatisfaction.set(schedule.employeeId, []);
      }

      // 查询员工偏好
      if (schedule.shiftCode) {
        const preferenceScore = await this.getPreferenceScore(
          schedule.employeeId,
          schedule.shiftCode
        );
        employeeSatisfaction.get(schedule.employeeId)!.push(preferenceScore);
      }
    }

    // 计算平均满意度
    let totalSatisfaction = 0;
    let totalCount = 0;
    const distribution: Record<string, number> = {
      high: 0,
      medium: 0,
      low: 0,
    };

    employeeSatisfaction.forEach((scores) => {
      if (scores.length > 0) {
        const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        totalSatisfaction += avgScore;
        totalCount++;

        if (avgScore >= 0.7) {
          distribution.high++;
        } else if (avgScore >= 0.4) {
          distribution.medium++;
        } else {
          distribution.low++;
        }
      }
    });

    const averagePreferenceMatch =
      totalCount > 0 ? totalSatisfaction / totalCount : 0.5;

    const breakdown: SatisfactionBreakdown = {
      averagePreferenceMatch,
      employeesWithHighSatisfaction: distribution.high,
      employeesWithLowSatisfaction: distribution.low,
      preferenceMatchDistribution: distribution,
    };

    return { score: averagePreferenceMatch, breakdown };
  }

  /**
   * 获取偏好评分
   */
  private async getPreferenceScore(
    employeeId: number,
    shiftCode: string
  ): Promise<number> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT esp.preference_score AS preferenceScore
         FROM employee_shift_preferences esp
         JOIN shift_definitions sd ON esp.shift_type_id = sd.id
         WHERE esp.employee_id = ? AND sd.shift_code = ?
         LIMIT 1`,
        [employeeId, shiftCode.toUpperCase()]
      );

      if (rows.length > 0) {
        const score = Number(rows[0].preferenceScore || 0);
        return (score + 10) / 20; // 转换为0-1
      }
    } catch (error) {
      console.error("Failed to get preference score:", error);
    }

    return 0.5; // 默认中等评分
  }

  /**
   * 评估工时均衡度
   */
  private async evaluateWorkloadBalance(
    schedules: ScheduleQualityEvaluationRequest["schedules"],
    period: { startDate: string; endDate: string }
  ): Promise<{
    score: number;
    distribution: WorkloadDistribution;
  }> {
    // 按员工分组计算工时
    // 总工时只计算planHours，不包括overtimeHours
    const employeeHours = new Map<number, number>();
    schedules.forEach((schedule) => {
      const current = employeeHours.get(schedule.employeeId) || 0;
      employeeHours.set(
        schedule.employeeId,
        current + (schedule.planHours || 0) // 只计算planHours
      );
    });

    const hoursArray = Array.from(employeeHours.values());
    if (hoursArray.length === 0) {
      return {
        score: 1.0,
        distribution: {
          variance: 0,
          maxDeviation: 0,
          employeesOverTarget: 0,
          employeesUnderTarget: 0,
          quarterlyDistribution: {},
          monthlyDistribution: {},
        },
      };
    }

    // 计算平均值
    const mean = hoursArray.reduce((sum, h) => sum + h, 0) / hoursArray.length;

    // 计算方差
    const variance =
      hoursArray.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
      hoursArray.length;

    // 计算最大偏差
    const maxDeviation = Math.max(
      ...hoursArray.map((h) => Math.abs(h - mean))
    );

    // 计算季度分布
    const quarterlyDistribution: Record<string, number> = {};
    const monthlyDistribution: Record<string, number> = {};

    schedules.forEach((schedule) => {
      const date = dayjs(schedule.date);
      const quarter = `${date.year()}Q${date.quarter()}`;
      const month = `${date.year()}-${String(date.month() + 1).padStart(2, "0")}`;

      // 总工时只计算planHours，不包括overtimeHours
      const totalHours = schedule.planHours || 0; // 只计算planHours
      quarterlyDistribution[quarter] =
        (quarterlyDistribution[quarter] || 0) + totalHours;
      monthlyDistribution[month] =
        (monthlyDistribution[month] || 0) + totalHours;
    });

    // 获取季度标准工时作为参考
    const startDate = dayjs(period.startDate);
    const year = startDate.year();
    const quarter = startDate.quarter();

    let targetHours = mean; // 默认使用平均值作为目标
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT standard_hours FROM quarterly_standard_hours 
         WHERE year = ? AND quarter = ? LIMIT 1`,
        [year, quarter]
      );
      if (rows.length > 0) {
        targetHours = Number(rows[0].standard_hours || 0);
      }
    } catch {
      // 使用平均值
    }

    // 计算超过/低于目标的员工数
    const employeesOverTarget = hoursArray.filter(
      (h) => h > targetHours * 1.1
    ).length;
    const employeesUnderTarget = hoursArray.filter(
      (h) => h < targetHours * 0.9
    ).length;

    const distribution: WorkloadDistribution = {
      variance,
      maxDeviation,
      employeesOverTarget,
      employeesUnderTarget,
      quarterlyDistribution,
      monthlyDistribution,
    };

    // 评分：方差越小，评分越高
    const normalizedVariance = variance / (mean * mean + 1); // 归一化方差
    const score = mean > 0 && !isNaN(variance) ? Math.max(0, 1 - normalizedVariance * 10) : 1.0; // 方差越大，扣分越多

    return { score, distribution };
  }

  /**
   * 评估技能匹配度
   */
  private async evaluateSkillMatch(
    schedules: ScheduleQualityEvaluationRequest["schedules"]
  ): Promise<{
    score: number;
    details: SkillMatchDetail[];
  }> {
    const operationSkillMatch = new Map<
      number,
      { operationName: string; scores: number[]; insufficientCount: number }
    >();

    // 按操作分组
    for (const schedule of schedules) {
      if (!schedule.operationId || !schedule.operationPlanId) {
        continue;
      }

      if (!operationSkillMatch.has(schedule.operationId)) {
        operationSkillMatch.set(schedule.operationId, {
          operationName: `操作${schedule.operationId}`,
          scores: [],
          insufficientCount: 0,
        });
      }

      // 查询操作所需资质
      const requiredQuals = await this.getRequiredQualifications(
        schedule.operationId
      );
      if (requiredQuals.length === 0) {
        continue;
      }

      // 查询员工资质
      const employeeQuals = await this.getEmployeeQualifications(
        schedule.employeeId
      );

      // 计算匹配度
      let matchScore = 0;
      let allMatch = true;

      for (const req of requiredQuals) {
        const empQual = employeeQuals.find(
          (q) => q.qualificationId === req.qualificationId
        );
        if (!empQual || empQual.qualificationLevel < req.minLevel) {
          allMatch = false;
          break;
        }
        matchScore += Math.min(1, empQual.qualificationLevel / req.minLevel);
      }

      const finalScore = allMatch ? matchScore / requiredQuals.length : 0;
      const opMatch = operationSkillMatch.get(schedule.operationId)!;
      opMatch.scores.push(finalScore);
      if (finalScore < 0.8) {
        opMatch.insufficientCount++;
      }
    }

    const details: SkillMatchDetail[] = [];
    let totalScore = 0;
    let totalCount = 0;

    operationSkillMatch.forEach((match, operationId) => {
      const avgScore =
        match.scores.length > 0
          ? match.scores.reduce((sum, s) => sum + s, 0) / match.scores.length
          : 1.0;

      details.push({
        operationId,
        operationName: match.operationName,
        averageSkillMatch: avgScore,
        employeesWithInsufficientSkills: match.insufficientCount,
      });

      totalScore += avgScore;
      totalCount++;
    });

    const overallScore = totalCount > 0 ? totalScore / totalCount : 1.0;

    return { score: overallScore, details };
  }

  /**
   * 获取操作所需资质
   */
  private async getRequiredQualifications(
    operationId: number
  ): Promise<Array<{ qualificationId: number; minLevel: number }>> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          qualification_id AS qualificationId,
          min_level AS minLevel
         FROM operation_qualification_requirements
         WHERE operation_id = ?`,
        [operationId]
      );

      return rows.map((row) => ({
        qualificationId: Number(row.qualificationId),
        minLevel: Number(row.minLevel || 1),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 获取员工资质
   */
  private async getEmployeeQualifications(
    employeeId: number
  ): Promise<Array<{ qualificationId: number; qualificationLevel: number }>> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          qualification_id AS qualificationId,
          qualification_level AS qualificationLevel
         FROM employee_qualifications
         WHERE employee_id = ?`,
        [employeeId]
      );

      return rows.map((row) => ({
        qualificationId: Number(row.qualificationId),
        qualificationLevel: Number(row.qualificationLevel || 0),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 评估综合工时制合规度（新增）
   */
  private async evaluateComprehensiveWorkTimeCompliance(
    schedules: ScheduleQualityEvaluationRequest["schedules"],
    period: { startDate: string; endDate: string }
  ): Promise<{
    score: number;
    details: ComprehensiveWorkTimeDetail[];
  }> {
    const details: ComprehensiveWorkTimeDetail[] = [];

    // 按员工分组
    const employeeSchedules = new Map<
      number,
      Array<ScheduleQualityEvaluationRequest["schedules"][0]>
    >();
    schedules.forEach((schedule) => {
      const employeeId = schedule.employeeId;
      if (!employeeSchedules.has(employeeId)) {
        employeeSchedules.set(employeeId, []);
      }
      employeeSchedules.get(employeeId)!.push(schedule);
    });

    // 检查每个员工
    for (const [employeeId, empSchedules] of employeeSchedules) {
      try {
        // 使用ComprehensiveWorkTimeAdapter获取员工工时制配置
        const firstScheduleDate = empSchedules.length > 0 
          ? empSchedules[0].date 
          : period.startDate;
        const workTimeConfig = await this.comprehensiveAdapter.getWorkTimeSystemConfig(
          employeeId,
          firstScheduleDate
        );

        if (!workTimeConfig) {
          continue; // 无工时制配置，跳过
        }

        const workTimeSystem = workTimeConfig.workTimeSystemType;
        const periodType = workTimeConfig.comprehensivePeriod;
        const targetHours = workTimeConfig.comprehensiveTargetHours || 0;

        if (workTimeSystem !== 'COMPREHENSIVE' || !periodType || targetHours <= 0) {
          continue; // 不是综合工时制或配置不完整
        }

        // 计算周期累计工时
        // 总工时只计算planHours，不包括overtimeHours
        const periodStart = this.getPeriodStart(firstScheduleDate, periodType);
        const periodEnd = this.getPeriodEnd(firstScheduleDate, periodType);

        const accumulatedHours = empSchedules
          .filter((s) => {
            const scheduleDate = dayjs(s.date);
            return (
              scheduleDate.isSameOrAfter(periodStart) &&
              scheduleDate.isSameOrBefore(periodEnd)
            );
          })
          .reduce((sum, s) => sum + (s.planHours || 0), 0); // 只计算planHours

        const complianceRate = targetHours > 0 ? accumulatedHours / targetHours : 1.0;
        const violations: string[] = [];

        if (accumulatedHours > targetHours * 1.1) {
          violations.push(`周期工时超过上限${(targetHours * 1.1).toFixed(2)}h`);
        }

        // 检查周期平均日工时
        const days = periodEnd.diff(periodStart, "day") + 1;
        const avgDailyHours = accumulatedHours / days;
        if (avgDailyHours > 8.5) {
          violations.push(`周期平均日工时${avgDailyHours.toFixed(2)}h过高`);
        }

        // 查询员工姓名
        const [empRows] = await pool.execute<RowDataPacket[]>(
          `SELECT employee_name FROM employees WHERE id = ? LIMIT 1`,
          [employeeId]
        );
        const employeeName = empRows.length > 0 ? String(empRows[0].employee_name) : `员工${employeeId}`;

        details.push({
          employeeId,
          employeeName,
          workTimeSystemType: workTimeSystem,
          period: periodType,
          accumulatedHours,
          targetHours,
          complianceRate,
          violations,
        });
      } catch (error) {
        console.error(`Failed to evaluate comprehensive work time for employee ${employeeId}:`, error);
      }
    }

    // 计算总体合规度
    if (details.length === 0) {
      return { score: 1.0, details: [] }; // 无综合工时制员工，默认合规
    }

    const avgComplianceRate =
      details.reduce((sum, d) => sum + (d.complianceRate <= 1.1 ? 1.0 : 0.5), 0) /
      details.length;

    const violationRate = details.filter((d) => d.violations.length > 0).length / details.length;
    const score = avgComplianceRate * (1 - violationRate * 0.3); // 有违反时扣分

    return { score, details };
  }

  /**
   * 获取周期开始日期
   */
  private getPeriodStart(dateStr: string, period: string): dayjs.Dayjs {
    const date = dayjs(dateStr);
    switch (period) {
      case 'WEEK':
        return date.startOf('week');
      case 'MONTH':
        return date.startOf('month');
      case 'QUARTER':
        return date.startOf('quarter');
      case 'YEAR':
        return date.startOf('year');
      default:
        return date.startOf('month');
    }
  }

  /**
   * 获取周期结束日期
   */
  private getPeriodEnd(dateStr: string, period: string): dayjs.Dayjs {
    const date = dayjs(dateStr);
    switch (period) {
      case 'WEEK':
        return date.endOf('week');
      case 'MONTH':
        return date.endOf('month');
      case 'QUARTER':
        return date.endOf('quarter');
      case 'YEAR':
        return date.endOf('year');
      default:
        return date.endOf('month');
    }
  }

  /**
   * 综合评分
   */
  private calculateOverallScore(factors: {
    constraintCompliance: number;
    costEfficiency: number;
    employeeSatisfaction: number;
    workloadBalance: number;
    skillMatch: number;
    comprehensiveWorkTimeCompliance?: number;
  }): number {
    const weights = {
      constraintCompliance: 0.3, // 约束遵循最重要
      costEfficiency: 0.15,
      employeeSatisfaction: 0.20,
      workloadBalance: 0.15,
      skillMatch: 0.15,
      comprehensiveWorkTimeCompliance: 0.05, // 综合工时制合规度
    };

    let totalScore = 0;
    totalScore += weights.constraintCompliance * factors.constraintCompliance;
    totalScore += weights.costEfficiency * factors.costEfficiency;
    totalScore += weights.employeeSatisfaction * factors.employeeSatisfaction;
    totalScore += weights.workloadBalance * factors.workloadBalance;
    totalScore += weights.skillMatch * factors.skillMatch;
    totalScore += weights.comprehensiveWorkTimeCompliance * (factors.comprehensiveWorkTimeCompliance ?? 1.0);

    return Math.max(0, Math.min(1, totalScore));
  }

  /**
   * 生成改进建议
   */
  private generateRecommendations(factors: {
    constraintCompliance: number;
    costEfficiency: number;
    employeeSatisfaction: number;
    workloadBalance: number;
    skillMatch: number;
    comprehensiveWorkTimeCompliance?: number;
    constraintViolations: ConstraintViolation[];
  }): string[] {
    const recommendations: string[] = [];

    if (factors.constraintCompliance < 0.8) {
      const criticalViolations = factors.constraintViolations.filter(
        (v) => v.severity === "CRITICAL"
      ).length;
      if (criticalViolations > 0) {
        recommendations.push(`发现${criticalViolations}个严重约束违反，需要立即修复`);
      }
      recommendations.push("建议优化排班方案以减少约束违反");
    }

    if (factors.costEfficiency < 0.7) {
      recommendations.push("加班工时比例较高，建议优化人员配置以降低成本");
    }

    if (factors.employeeSatisfaction < 0.6) {
      recommendations.push("员工满意度较低，建议更多考虑员工偏好");
    }

    if (factors.workloadBalance < 0.7) {
      recommendations.push("工时分布不均衡，建议调整班次分配");
    }

    if (factors.skillMatch < 0.8) {
      recommendations.push("部分操作技能匹配度不足，建议加强员工培训或调整人员分配");
    }

    if (factors.comprehensiveWorkTimeCompliance !== undefined && factors.comprehensiveWorkTimeCompliance < 0.8) {
      recommendations.push("综合工时制员工存在合规性问题，建议检查周期工时分配");
    }

    if (recommendations.length === 0) {
      recommendations.push("排班方案质量良好，无需重大调整");
    }

    return recommendations;
  }
}

export default ScheduleQualityEvaluator;

