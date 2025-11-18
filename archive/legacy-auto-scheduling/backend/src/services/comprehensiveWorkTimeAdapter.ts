import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/database";
import HolidayService from "./holidayService";
import { HolidaySalaryConfigService } from "./holidaySalaryConfigService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * 工时制类型
 */
export type WorkTimeSystemType = "STANDARD" | "COMPREHENSIVE" | "FLEXIBLE";

/**
 * 综合工时制周期类型
 */
export type ComprehensivePeriod = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

/**
 * 综合工时制休息天数要求
 * 根据《关于职工工作时间有关问题的复函》规定
 */
const COMPREHENSIVE_REST_REQUIREMENTS: Record<ComprehensivePeriod, number> = {
  YEAR: 52,    // 年应至少休息52天
  QUARTER: 13, // 季应至少休息13天
  MONTH: 4,    // 月应至少休息4天
  WEEK: 1,      // 周应至少休息1天
};

/**
 * 员工工时制配置
 */
export interface WorkTimeSystemConfig {
  employeeId: number;
  workTimeSystemType: WorkTimeSystemType;
  comprehensivePeriod?: ComprehensivePeriod;
  comprehensiveTargetHours?: number;
  quarterStandardHours?: number;
  monthStandardHours?: number;
  maxDailyHours?: number;
  maxConsecutiveDays?: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

/**
 * 约束违反
 */
export interface ConstraintViolation {
  type: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  employeeId: number;
  message: string;
  date?: string; // 添加date字段
  period?: ComprehensivePeriod;
  accumulatedHours?: number;
  targetHours?: number;
}

/**
 * 排班记录（用于累计工时计算）
 */
export interface ScheduleRecord {
  date: string;
  planHours: number;
  overtimeHours: number;
  operationPlanId?: number; // 操作ID（用于区分车间工时和基础班次，>0表示操作任务，0或undefined表示基础班次）
  operationDuration?: number; // 操作实际时长（小时），用于车间工时计算
}

/**
 * 周期累计工时详情（区分正常工时和法定节假日工时）
 */
export interface PeriodAccumulatedHoursDetail {
  normalHours: number; // 正常工时（排除法定节假日）
  legalHolidayHours: number; // 法定节假日工时（3倍工资）
  totalHours: number; // 总工时（正常工时 + 法定节假日工时）
  legalHolidayDates: string[]; // 法定节假日日期列表
}

/**
 * 节假日工资类型
 */
export type HolidaySalaryType = "TRIPLE_SALARY" | "DOUBLE_SALARY_OR_REST";

/**
 * 检查指定日期是否为3倍工资的法定节假日
 * 
 * 根据《全国年节及纪念日放假办法》：
 * - 真正的法定节假日：3倍工资
 * - 调休的休息日：2倍工资或补休
 * 
 * 数据来源：
 * - 优先从数据库 holiday_salary_config 表读取
 * - 如果数据库中没有，使用规则引擎自动识别
 * - 规则定义在 holiday_salary_rules 表中
 */
async function isTripleSalaryHoliday(date: string): Promise<boolean> {
  return await HolidaySalaryConfigService.isTripleSalaryHoliday(date);
}

/**
 * 综合工时制适配器
 * 
 * 功能：
 * - 识别员工适用的工时制类型
 * - 加载和计算综合工时制周期目标工时
 * - 跟踪综合工时制周期累计工时
 * - 计算综合工时制下的加班工时
 * - 适配不同工时制的排班约束
 */
export class ComprehensiveWorkTimeAdapter {
  /**
   * 获取员工工时制类型和配置
   */
  async getWorkTimeSystemConfig(
    employeeId: number,
    date: string = dayjs().format("YYYY-MM-DD")
  ): Promise<WorkTimeSystemConfig | null> {
    try {
      // 先检查是否存在综合工时制相关字段
      const [testRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'employee_shift_limits' 
           AND COLUMN_NAME IN ('work_time_system_type', 'comprehensive_period', 'comprehensive_target_hours')`
      );

      const testRowsArray = Array.isArray(testRows) ? testRows : [];
      const hasWorkTimeSystemFields = testRowsArray.length > 0;

      let query: string;
      if (hasWorkTimeSystemFields) {
        query = `SELECT 
          work_time_system_type,
          comprehensive_period,
          comprehensive_target_hours,
          quarter_standard_hours,
          month_standard_hours,
          max_daily_hours,
          max_consecutive_days,
          effective_from,
          effective_to
         FROM employee_shift_limits
         WHERE employee_id = ?
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY effective_from DESC
         LIMIT 1`;
      } else {
        query = `SELECT 
          quarter_standard_hours,
          month_standard_hours,
          max_daily_hours,
          max_consecutive_days,
          effective_from,
          effective_to
         FROM employee_shift_limits
         WHERE employee_id = ?
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY effective_from DESC
         LIMIT 1`;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(query, [
        employeeId,
        date,
        date,
      ]);

      const rowsArray = Array.isArray(rows) ? rows : [];
      if (rowsArray.length === 0) {
        return null;
      }

      const row = rowsArray[0] as any;
      return {
        employeeId,
        workTimeSystemType:
          row.work_time_system_type || ("STANDARD" as WorkTimeSystemType),
        comprehensivePeriod: row.comprehensive_period || undefined,
        comprehensiveTargetHours: row.comprehensive_target_hours
          ? Number(row.comprehensive_target_hours)
          : undefined,
        quarterStandardHours: row.quarter_standard_hours
          ? Number(row.quarter_standard_hours)
          : undefined,
        monthStandardHours: row.month_standard_hours
          ? Number(row.month_standard_hours)
          : undefined,
        maxDailyHours: row.max_daily_hours
          ? Number(row.max_daily_hours)
          : 11.0,
        maxConsecutiveDays: row.max_consecutive_days
          ? Number(row.max_consecutive_days)
          : 6,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to || null,
      };
    } catch (error) {
      console.error(
        `Failed to get work time system config for employee ${employeeId}:`,
        error
      );
      return null;
    }
  }

  /**
   * 获取周期开始日期
   */
  getPeriodStart(dateStr: string, period: ComprehensivePeriod): dayjs.Dayjs {
    const date = dayjs(dateStr);

    switch (period) {
      case "WEEK":
        return date.startOf("week");
      case "MONTH":
        return date.startOf("month");
      case "QUARTER":
        return date.startOf("quarter");
      case "YEAR":
        return date.startOf("year");
      default:
        return date.startOf("month");
    }
  }

  /**
   * 获取周期结束日期
   */
  getPeriodEnd(dateStr: string, period: ComprehensivePeriod): dayjs.Dayjs {
    const date = dayjs(dateStr);

    switch (period) {
      case "WEEK":
        return date.endOf("week");
      case "MONTH":
        return date.endOf("month");
      case "QUARTER":
        return date.endOf("quarter");
      case "YEAR":
        return date.endOf("year");
      default:
        return date.endOf("month");
    }
  }

  /**
   * 检查指定日期是否为法定节假日（3倍工资）
   * 
   * 注意：只有真正的法定节假日才是3倍工资，调休的休息日是2倍工资
   * 数据来源：数据库 holiday_salary_config 表 + 规则引擎
   */
  async isLegalHoliday(date: string): Promise<boolean> {
    // 从数据库或规则引擎检查是否是3倍工资的法定节假日
    return await isTripleSalaryHoliday(date);
  }

  /**
   * 检查指定日期的节假日工资类型
   */
  async getHolidaySalaryType(date: string): Promise<HolidaySalaryType> {
    if (await this.isLegalHoliday(date)) {
      return "TRIPLE_SALARY";
    }

    // 检查是否是调休的休息日（2倍工资）
    try {
      await HolidayService.ensureCalendarCoverage(date, date);

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT holiday_type, is_workday
         FROM calendar_workdays
         WHERE calendar_date = ?
           AND (holiday_type = 'LEGAL_HOLIDAY' OR holiday_type = 'WEEKEND_ADJUSTMENT')
           AND is_workday = 0`,
        [date]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      if (rowsArray.length > 0) {
        return "DOUBLE_SALARY_OR_REST"; // 调休休息日（2倍工资或补休）
      }
    } catch (error) {
      console.error(`Failed to check holiday salary type for date ${date}:`, error);
    }

    return "TRIPLE_SALARY"; // 默认返回（实际上应该是工作日）
  }

  /**
   * 获取周期内的法定节假日列表（仅3倍工资的日期）
   * 
   * 数据来源：数据库 holiday_salary_config 表 + 规则引擎
   */
  async getLegalHolidaysInPeriod(
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<string[]> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 使用服务类的方法获取3倍工资节假日列表
    return await HolidaySalaryConfigService.getTripleSalaryHolidaysInPeriod(start, end);
  }

  /**
   * 计算周期内的工作日数量
   */
  async calculateWorkingDays(
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<number> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 确保节假日日历覆盖该时间段
    await HolidayService.ensureCalendarCoverage(
      start.format("YYYY-MM-DD"),
      end.format("YYYY-MM-DD")
    );

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS working_days
         FROM calendar_workdays
         WHERE calendar_date BETWEEN ? AND ?
           AND is_workday = 1`,
        [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      return rowsArray.length > 0 ? Number(rowsArray[0].working_days || 0) : 0;
    } catch (error) {
      console.error("Failed to calculate working days:", error);
      // 如果查询失败，使用简单的天数估算（排除周末）
      let count = 0;
      let current = start;
      while (current.isSameOrBefore(end)) {
        const dayOfWeek = current.day();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          // 排除周日(0)和周六(6)
          count++;
        }
        current = current.add(1, "day");
      }
      return count;
    }
  }

  /**
   * 计算周期内的休息日数量（非工作日）
   */
  async calculateRestDays(
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<number> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 确保节假日日历覆盖该时间段
    await HolidayService.ensureCalendarCoverage(
      start.format("YYYY-MM-DD"),
      end.format("YYYY-MM-DD")
    );

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS rest_days
         FROM calendar_workdays
         WHERE calendar_date BETWEEN ? AND ?
           AND is_workday = 0`,
        [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      return rowsArray.length > 0 ? Number(rowsArray[0].rest_days || 0) : 0;
    } catch (error) {
      console.error("Failed to calculate rest days:", error);
      // 如果查询失败，使用简单的天数估算（只计算周末）
      let count = 0;
      let current = start;
      while (current.isSameOrBefore(end)) {
        const dayOfWeek = current.day();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // 周日(0)和周六(6)
          count++;
        }
        current = current.add(1, "day");
      }
      return count;
    }
  }

  /**
   * 计算员工在周期内的实际休息天数（排班记录中未安排工作的天数）
   */
  async calculateActualRestDays(
    employeeId: number,
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<number> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    try {
      // 获取周期内的总天数
      const totalDays = end.diff(start, "day") + 1;

      // 获取周期内员工有排班的日期数量
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT plan_date) AS scheduled_days
         FROM employee_shift_plans
         WHERE employee_id = ?
           AND plan_date BETWEEN ? AND ?
           AND plan_state != 'VOID'`,
        [
          employeeId,
          start.format("YYYY-MM-DD"),
          end.format("YYYY-MM-DD"),
        ]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      const scheduledDays = rowsArray.length > 0 ? Number(rowsArray[0].scheduled_days || 0) : 0;

      // 实际休息天数 = 总天数 - 有排班的天数
      return totalDays - scheduledDays;
    } catch (error) {
      console.error(
        `Failed to calculate actual rest days for employee ${employeeId}:`,
        error
      );
      return 0;
    }
  }

  /**
   * 从排班记录数组计算实际休息天数
   */
  calculateActualRestDaysFromSchedules(
    schedules: ScheduleRecord[],
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): number {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 获取周期内的总天数
    const totalDays = end.diff(start, "day") + 1;

    // 获取有排班的日期集合
    const scheduledDates = new Set<string>();
    schedules
      .filter((s) => {
        const scheduleDate = dayjs(s.date);
        return (
          scheduleDate.isSameOrAfter(start, "day") &&
          scheduleDate.isSameOrBefore(end, "day")
        );
      })
      .forEach((s) => {
        scheduledDates.add(s.date);
      });

    // 实际休息天数 = 总天数 - 有排班的天数
    return totalDays - scheduledDates.size;
  }

  /**
   * 获取综合工时制周期目标工时
   * 
   * 对于综合工时制，目标工时需要考虑：
   * 1. 如果配置了 comprehensive_target_hours，直接使用
   * 2. 如果没有配置，根据周期工作日数和标准日工时计算
   * 3. 对于标准工时制，使用季度/月度标准工时
   */
  async getPeriodTargetHours(
    employeeId: number,
    period: ComprehensivePeriod,
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<number> {
    const config = await this.getWorkTimeSystemConfig(
      employeeId,
      typeof periodStart === "string" ? periodStart : periodStart.format("YYYY-MM-DD")
    );

    if (!config) {
      return 0;
    }

    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 如果是综合工时制且有配置的目标工时
    if (
      config.workTimeSystemType === "COMPREHENSIVE" &&
      config.comprehensivePeriod === period &&
      config.comprehensiveTargetHours &&
      config.comprehensiveTargetHours > 0
    ) {
      return config.comprehensiveTargetHours;
    }

    // 根据周期类型和标准工时计算
    const workingDays = await this.calculateWorkingDays(start, end);
    const standardDailyHours = 8.0; // 标准日工时

    switch (period) {
      case "WEEK":
        return workingDays * standardDailyHours;
      case "MONTH":
        if (config.monthStandardHours && config.monthStandardHours > 0) {
          return config.monthStandardHours;
        }
        return workingDays * standardDailyHours;
      case "QUARTER":
        if (config.quarterStandardHours && config.quarterStandardHours > 0) {
          return config.quarterStandardHours;
        }
        return workingDays * standardDailyHours;
      case "YEAR":
        return workingDays * standardDailyHours;
      default:
        return workingDays * standardDailyHours;
    }
  }

  /**
   * 获取周期累计工时（排除法定节假日）
   * 
   * 对于综合工时制：
   * - 正常工时：计入周期工时统计
   * - 法定节假日工时：不计入周期工时，单独计算（3倍工资）
   */
  async getPeriodAccumulatedHours(
    employeeId: number,
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs,
    excludeLegalHolidays: boolean = true
  ): Promise<number> {
    const detail = await this.getPeriodAccumulatedHoursDetail(
      employeeId,
      periodStart,
      periodEnd
    );
    return excludeLegalHolidays ? detail.normalHours : detail.totalHours;
  }

  /**
   * 获取周期累计工时详情（区分正常工时和法定节假日工时）
   */
  async getPeriodAccumulatedHoursDetail(
    employeeId: number,
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<PeriodAccumulatedHoursDetail> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    try {
      // 确保节假日日历覆盖该时间段
      await HolidayService.ensureCalendarCoverage(
        start.format("YYYY-MM-DD"),
        end.format("YYYY-MM-DD")
      );

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          SUM(CASE 
            WHEN cw.holiday_type = 'LEGAL_HOLIDAY' AND cw.is_workday = 0 
            THEN 0 
            ELSE COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0) 
          END) AS normal_hours,
          SUM(CASE 
            WHEN cw.holiday_type = 'LEGAL_HOLIDAY' AND cw.is_workday = 0 
            THEN COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0) 
            ELSE 0 
          END) AS legal_holiday_hours,
          SUM(COALESCE(esp.plan_hours, 0) + COALESCE(esp.overtime_hours, 0)) AS total_hours
         FROM employee_shift_plans esp
         LEFT JOIN calendar_workdays cw ON cw.calendar_date = esp.plan_date
         WHERE esp.employee_id = ?
           AND esp.plan_date BETWEEN ? AND ?
           AND esp.plan_state != 'VOID'`,
        [
          employeeId,
          start.format("YYYY-MM-DD"),
          end.format("YYYY-MM-DD"),
        ]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      const row = rowsArray[0] || {};

      // 获取法定节假日日期列表
      const legalHolidayDates = await this.getLegalHolidaysInPeriod(start, end);

      return {
        normalHours: Number(row.normal_hours || 0),
        legalHolidayHours: Number(row.legal_holiday_hours || 0),
        totalHours: Number(row.total_hours || 0),
        legalHolidayDates,
      };
    } catch (error) {
      console.error(
        `Failed to get period accumulated hours detail for employee ${employeeId}:`,
        error
      );
      return {
        normalHours: 0,
        legalHolidayHours: 0,
        totalHours: 0,
        legalHolidayDates: [],
      };
    }
  }

  /**
   * 从排班记录数组计算周期累计工时（排除法定节假日）
   */
  async calculatePeriodAccumulatedHoursFromSchedules(
    schedules: ScheduleRecord[],
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs,
    excludeLegalHolidays: boolean = true
  ): Promise<number> {
    const detail = await this.calculatePeriodAccumulatedHoursDetailFromSchedules(
      schedules,
      periodStart,
      periodEnd
    );
    return excludeLegalHolidays ? detail.normalHours : detail.totalHours;
  }

  /**
   * 从排班记录数组计算周期累计工时详情（区分正常工时和法定节假日工时）
   */
  async calculatePeriodAccumulatedHoursDetailFromSchedules(
    schedules: ScheduleRecord[],
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<PeriodAccumulatedHoursDetail> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    // 获取周期内的法定节假日列表
    const legalHolidayDates = await this.getLegalHolidaysInPeriod(start, end);
    const legalHolidaySet = new Set(legalHolidayDates);

    let normalHours = 0;
    let legalHolidayHours = 0;
    let totalHours = 0;

    schedules
      .filter((s) => {
        const scheduleDate = dayjs(s.date);
        return (
          scheduleDate.isSameOrAfter(start, "day") &&
          scheduleDate.isSameOrBefore(end, "day")
        );
      })
      .forEach((s) => {
        // 总工时只计算planHours，不包括overtimeHours（加班工时不计入总工时）
        const hours = s.planHours || 0;
        totalHours += hours;

        if (legalHolidaySet.has(s.date)) {
          legalHolidayHours += hours;
        } else {
          normalHours += hours;
        }
      });

    return {
      normalHours,
      legalHolidayHours,
      totalHours,
      legalHolidayDates,
    };
  }

  /**
   * 计算综合工时制下的加班工时
   * 
   * 综合工时制的加班计算：
   * - 如果周期累计工时超过周期目标工时，超出部分视为加班
   * - 如果周期累计工时在目标工时的90%-110%之间，视为正常工时
   * - 如果周期累计工时超过目标工时的110%，超出110%的部分视为加班
   */
  calculateComprehensiveOvertime(
    totalHours: number,
    targetHours: number,
    tolerance: number = 0.1
  ): number {
    if (targetHours <= 0) {
      return 0;
    }

    const upperLimit = targetHours * (1 + tolerance); // 110% 上限

    if (totalHours <= upperLimit) {
      return 0; // 在容差范围内，无加班
    }

    // 超出上限的部分视为加班
    return totalHours - upperLimit;
  }

  /**
   * 检查综合工时制约束
   *
   * 规则：
   * - 季度：累计工时必须大于或等于季度标准工时（不设上限）
   * - 月度：累计工时须控制在标准工时 ± 自定义容差（默认 ±8 小时）
   */
  async checkComprehensiveConstraints(
    employeeId: number,
    proposedSchedules: ScheduleRecord[],
    period: ComprehensivePeriod,
    options?: {
      monthToleranceHours?: number;
    }
  ): Promise<ConstraintViolation[]> {
    const violations: ConstraintViolation[] = [];
    const monthTolerance = Math.max(0, options?.monthToleranceHours ?? 8);
    const EPSILON = 0.01;

    const config = await this.getWorkTimeSystemConfig(
      employeeId,
      proposedSchedules.length > 0
        ? proposedSchedules[0].date
        : dayjs().format("YYYY-MM-DD")
    );

    if (!config) {
      return violations; // 无配置，跳过检查
    }

    // 只检查综合工时制
    if (config.workTimeSystemType !== "COMPREHENSIVE" || !config.comprehensivePeriod) {
      return violations;
    }

    if (config.comprehensivePeriod !== period) {
      return violations; // 周期不匹配，跳过
    }

    const firstScheduleDate =
      proposedSchedules.length > 0
        ? proposedSchedules[0].date
        : dayjs().format("YYYY-MM-DD");

    // 同时检查季度和月度约束
    // 1. 检查季度约束
    const quarterStart = this.getPeriodStart(firstScheduleDate, "QUARTER");
    const quarterEnd = this.getPeriodEnd(firstScheduleDate, "QUARTER");
    const quarterTargetHours = await this.getPeriodTargetHours(
      employeeId,
      "QUARTER",
      quarterStart,
      quarterEnd
    );
    let quarterHours = 0;

    if (quarterTargetHours > 0) {
      quarterHours = await this.calculatePeriodAccumulatedHoursFromSchedules(
        proposedSchedules,
        quarterStart,
        quarterEnd,
        true // 排除法定节假日
      );

      // 季度约束：工时必须 ≥ 标准工时
      if (quarterHours + EPSILON < quarterTargetHours) {
        violations.push({
          type: "COMPREHENSIVE_QUARTER_MIN_LIMIT",
          severity: "CRITICAL",
          employeeId,
          message: `季度综合工时制工时不足: ${quarterHours.toFixed(2)}h / 最低要求: ${quarterTargetHours.toFixed(2)}h`,
          period: "QUARTER",
          accumulatedHours: quarterHours,
          targetHours: quarterTargetHours,
        });
      }
    }

    // 2. 检查月度约束（如果当前周期是月度，或者需要检查月度）
    if (period === "MONTH" || period === "QUARTER") {
      // 检查季度内的所有月份
      const monthSet = new Set<string>();
      let current = dayjs(firstScheduleDate).startOf("quarter");
      const quarterEndDate = dayjs(firstScheduleDate).endOf("quarter");
      
      while (current.isSameOrBefore(quarterEndDate, "day")) {
        const monthKey = current.format("YYYY-MM");
        monthSet.add(monthKey);
        current = current.add(1, "month").startOf("month");
      }

      for (const monthKey of monthSet) {
        const monthStart = dayjs(`${monthKey}-01`).startOf("month");
        const monthEnd = dayjs(`${monthKey}-01`).endOf("month");
        
        const monthTargetHours = await this.getPeriodTargetHours(
          employeeId,
          "MONTH",
          monthStart,
          monthEnd
        );

        if (monthTargetHours > 0) {
          const monthHours = await this.calculatePeriodAccumulatedHoursFromSchedules(
            proposedSchedules,
            monthStart,
            monthEnd,
            true // 排除法定节假日
          );

          // 月度约束：标准工时 ± 指定容差（硬约束）
          const monthMinHours = Math.max(0, monthTargetHours - monthTolerance);
          const monthMaxHours = monthTargetHours + monthTolerance;

          console.log(`[综合工时制] 员工${employeeId} ${monthKey}月检查: 实际${monthHours.toFixed(2)}h, 目标${monthTargetHours.toFixed(2)}h, 容差${monthTolerance.toFixed(2)}h, 上限${monthMaxHours.toFixed(2)}h`);

          if (monthHours < monthMinHours) {
            violations.push({
              type: "COMPREHENSIVE_MONTH_MIN_LIMIT",
              severity: "HIGH",
              employeeId,
              message: `月度综合工时制工时不足: ${monthHours.toFixed(2)}h / 最低要求: ${monthMinHours.toFixed(2)}h (标准工时${monthTargetHours.toFixed(2)}h - ${monthTolerance.toFixed(2)}h)`,
              period: "MONTH",
              date: monthKey,
              accumulatedHours: monthHours,
              targetHours: monthMinHours,
            });
          }

          if (monthHours > monthMaxHours) {
            violations.push({
              type: "COMPREHENSIVE_MONTH_MAX_LIMIT",
              severity: "HIGH",
              employeeId,
              message: `月度综合工时制工时超过上限: ${monthHours.toFixed(2)}h / 最高限制: ${monthMaxHours.toFixed(2)}h (标准工时${monthTargetHours.toFixed(2)}h + ${monthTolerance.toFixed(2)}h)`,
              period: "MONTH",
              date: monthKey,
              accumulatedHours: monthHours,
              targetHours: monthMaxHours,
            });
          }
        }
      }
    }

    // 3. 检查当前周期的约束（保持原有逻辑，用于其他周期类型）
    const periodStart = this.getPeriodStart(firstScheduleDate, period);
    const periodEnd = this.getPeriodEnd(firstScheduleDate, period);
    const targetHours = await this.getPeriodTargetHours(
      employeeId,
      period,
      periodStart,
      periodEnd
    );

    if (targetHours > 0 && period !== "QUARTER" && period !== "MONTH") {
      const accumulatedHours = await this.calculatePeriodAccumulatedHoursFromSchedules(
        proposedSchedules,
        periodStart,
        periodEnd,
        true // 排除法定节假日
      );

      // 对于其他周期类型，使用10%容差
      const upperLimit = targetHours * 1.1;
      if (accumulatedHours > upperLimit) {
        violations.push({
          type: "COMPREHENSIVE_PERIOD_LIMIT",
          severity: "CRITICAL",
          employeeId,
          message: `综合工时制${period}周期工时超过上限: ${accumulatedHours.toFixed(
            2
          )}h / ${upperLimit.toFixed(2)}h (目标: ${targetHours.toFixed(2)}h)`,
          period,
          accumulatedHours,
          targetHours: upperLimit,
        });
      }
    }

    // 检查周期内休息天数要求（硬约束）
    // 对于季度综合工时制，应至少休息13天
    const requiredRestDays = COMPREHENSIVE_REST_REQUIREMENTS["QUARTER"]; // 季度至少休息13天
    if (requiredRestDays > 0) {
      const actualRestDays = this.calculateActualRestDaysFromSchedules(
        proposedSchedules,
        quarterStart,
        quarterEnd
      );

      if (actualRestDays < requiredRestDays) {
        violations.push({
          type: "COMPREHENSIVE_REST_DAYS_REQUIREMENT",
          severity: "CRITICAL",
          employeeId,
          message: `综合工时制季度周期休息天数不足: ${actualRestDays}天 / 要求: ${requiredRestDays}天`,
          period: "QUARTER",
          accumulatedHours: quarterHours,
          targetHours: quarterTargetHours > 0 ? quarterTargetHours : 500.0,
        });
      }
    }

    return violations;
  }

  /**
   * 批量获取多个员工的工时制配置
   */
  async getBatchWorkTimeSystemConfigs(
    employeeIds: number[],
    date: string = dayjs().format("YYYY-MM-DD")
  ): Promise<Map<number, WorkTimeSystemConfig>> {
    const configMap = new Map<number, WorkTimeSystemConfig>();

    if (employeeIds.length === 0) {
      return configMap;
    }

    try {
      // 检查是否存在综合工时制相关字段
      const [testRows] = await pool.execute<RowDataPacket[]>(
        `SELECT COLUMN_NAME 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'employee_shift_limits' 
           AND COLUMN_NAME IN ('work_time_system_type', 'comprehensive_period', 'comprehensive_target_hours')`
      );

      const testRowsArray = Array.isArray(testRows) ? testRows : [];
      const hasWorkTimeSystemFields = testRowsArray.length > 0;

      const placeholders = employeeIds.map(() => "?").join(",");
      let query: string;

      if (hasWorkTimeSystemFields) {
        query = `SELECT 
          employee_id,
          work_time_system_type,
          comprehensive_period,
          comprehensive_target_hours,
          quarter_standard_hours,
          month_standard_hours,
          max_daily_hours,
          max_consecutive_days,
          effective_from,
          effective_to
         FROM employee_shift_limits
         WHERE employee_id IN (${placeholders})
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY employee_id, effective_from DESC`;
      } else {
        query = `SELECT 
          employee_id,
          quarter_standard_hours,
          month_standard_hours,
          max_daily_hours,
          max_consecutive_days,
          effective_from,
          effective_to
         FROM employee_shift_limits
         WHERE employee_id IN (${placeholders})
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY employee_id, effective_from DESC`;
      }

      const [rows] = await pool.execute<RowDataPacket[]>(query, [
        ...employeeIds,
        date,
        date,
      ]);

      // 确保 rows 是数组
      const rowsArray = Array.isArray(rows) ? rows : [];

      // 处理每个员工的最新配置
      // 由于查询已按 employee_id, effective_from DESC 排序，每个员工的第一条记录就是最新配置
      const processedEmployees = new Set<number>();
      for (const row of rowsArray as any[]) {
        const empId = Number(row.employee_id);
        if (processedEmployees.has(empId)) {
          continue; // 已处理过该员工的最新配置
        }

        configMap.set(empId, {
          employeeId: empId,
          workTimeSystemType:
            row.work_time_system_type || ("STANDARD" as WorkTimeSystemType),
          comprehensivePeriod: row.comprehensive_period || undefined,
          comprehensiveTargetHours: row.comprehensive_target_hours
            ? Number(row.comprehensive_target_hours)
            : undefined,
          quarterStandardHours: row.quarter_standard_hours
            ? Number(row.quarter_standard_hours)
            : undefined,
          monthStandardHours: row.month_standard_hours
            ? Number(row.month_standard_hours)
            : undefined,
          maxDailyHours: row.max_daily_hours
            ? Number(row.max_daily_hours)
            : 11.0,
          maxConsecutiveDays: row.max_consecutive_days
            ? Number(row.max_consecutive_days)
            : 6,
          effectiveFrom: row.effective_from,
          effectiveTo: row.effective_to || null,
        });

        processedEmployees.add(empId);
      }
    } catch (error) {
      console.error(
        `Failed to get batch work time system configs:`,
        error
      );
    }

    return configMap;
  }
}

export default ComprehensiveWorkTimeAdapter;
