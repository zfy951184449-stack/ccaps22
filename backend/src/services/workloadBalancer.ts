import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isoWeek from "dayjs/plugin/isoWeek";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/database";
import {
  ComprehensiveWorkTimeAdapter,
  type ComprehensivePeriod,
  type WorkTimeSystemType,
  type WorkTimeSystemConfig,
  type ScheduleRecord,
} from "./comprehensiveWorkTimeAdapter";
import HolidayService from "./holidayService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isoWeek);

/**
 * 每日操作负载信息（用于高峰日识别）
 */
export interface DailyOperationLoad {
  date: string;
  operationCount: number;
  totalRequiredPeople: number;
  peakHourLoad: number;
  operations: Array<{
    operationPlanId: number;
    operationId: number;
    operationName: string;
    plannedStart: string;
    plannedEnd: string;
    requiredPeople: number;
  }>;
}

/**
 * Backup需求信息
 */
export interface BackupRequirement {
  date: string;
  requiredBackupPeople: number;
  reason: string;
}

/**
 * 排班调整建议
 */
export interface ScheduleAdjustment {
  employeeId: number;
  date: string;
  action: "ADD" | "REMOVE" | "MODIFY";
  planHours: number;
  overtimeHours: number;
  shiftCode?: string;
  startTime?: string;      // HH:mm格式，班次开始时间
  endTime?: string;         // HH:mm格式，班次结束时间
  reason: string;
  priority: number; // 优先级：1-10，数字越大优先级越高
  preserveLocked?: boolean; // 是否保护已锁定排班
  isSupplemental?: boolean; // 标记为补充班次（非操作班次）
  isBackup?: boolean;       // 标记为backup人员
  operationPlanId?: number; // 操作ID（补充班次为0）
}

/**
 * 员工工时统计
 */
export interface EmployeeWorkloadStats {
  employeeId: number;
  workTimeSystemType: WorkTimeSystemType;
  comprehensivePeriod?: ComprehensivePeriod;
  
  // 季度工时统计
  quarterHours: number;
  quarterTargetHours: number;
  
  // 月度工时统计
  monthlyHours: Map<string, number>; // monthKey -> hours
  monthlyTargetHours?: number;
  
  // 周度工时统计
  weeklyHours: Map<string, number>; // weekKey -> hours
  weeklyTargetHours?: number;
  
  // 日度工时统计
  dailyHours: Map<string, number>; // date -> hours
  
  // 综合工时制周期统计
  comprehensivePeriodHours?: number;
  comprehensivePeriodTargetHours?: number;
  comprehensivePeriodStart?: string;
  comprehensivePeriodEnd?: string;
  
  // 锁定排班日期集合
  lockedDates: Set<string>;
  
  // 生产任务日期集合（高优先级）
  productionDates: Set<string>;
}

/**
 * 均衡结果
 */
export interface BalanceResult {
  adjustments: ScheduleAdjustment[];
  summary: {
    totalAdjustments: number;
    quarterBalance: number; // 季度均衡度（方差）
    monthlyBalance: number; // 月度均衡度（方差）
    weeklyBalance: number; // 周度均衡度（方差）
    employeesAffected: number;
    lockedProtected: number; // 受保护的锁定排班数
  };
  warnings: string[];
}

/**
 * 均衡配置
 */
export interface BalanceConfig {
  // 优先级权重
  priorities: {
    quarter: number; // 默认：1.0
    month: number; // 默认：0.8
    week: number; // 默认：0.6
    day: number; // 默认：0.4
    comprehensive: number; // 默认：1.0（综合工时制）
  };
  
  // 容差范围
  tolerance: {
    quarter: number; // 季度工时容差（小时），默认：4
    month: number; // 月度工时容差（小时），默认：2
    week: number; // 周度工时容差（小时），默认：1
    day: number; // 日度工时容差（小时），默认：0.5
  };
  
  // 保护锁定排班
  protectLocked: boolean; // 默认：true
  
  // 保护生产任务
  protectProduction: boolean; // 默认：true
  
  // 最大调整次数
  maxAdjustments: number; // 默认：1000
  
  // Backup配置
  backup?: {
    backupRatio: number;        // backup比例，默认0.2（20%）
    minBackupPerDay: number;     // 每日最小backup人数，默认2
    peakThresholdMultiplier: number; // 高峰日阈值倍数，默认1.5
    prioritizePeakDays: boolean; // 是否优先在高峰日补足工时，默认true
  };
  
  // 车间工时均衡配置
  shopfloor?: {
    enabled: boolean;                    // 是否启用车间工时均衡，默认true
    targetRatio: number;                 // 目标车间工时占比（默认0.7，即70%）
    tolerance: number;                   // 车间工时均衡容差（小时），默认50
    priority: number;                    // 车间工时均衡优先级权重，默认0.4
  };

  comprehensiveRules?: {
    monthToleranceHours?: number;        // 月度上/下浮动限制，默认8
    quarterUpperAllowanceHours?: number; // 超过季度标准可放宽的小时数，默认不封顶
  };
}

/**
 * 改进的工时均衡器
 * 
 * 功能：
 * - 多维度工时均衡（季度/月度/周度/日度）
 * - 综合工时制均衡支持
 * - 保护已锁定排班
 * - 考虑生产任务优先级
 */
export class WorkloadBalancer {
  private adapter: ComprehensiveWorkTimeAdapter;
  private config: BalanceConfig;
  private comprehensiveRules: {
    monthToleranceHours: number;
    quarterUpperAllowanceHours?: number;
  };

  constructor(config?: Partial<BalanceConfig>) {
    this.adapter = new ComprehensiveWorkTimeAdapter();
    this.config = {
      priorities: {
        quarter: 1.0,
        month: 0.8,
        week: 0.6,
        day: 0.4,
        comprehensive: 1.0,
      },
      tolerance: {
        quarter: 4,
        month: 2,
        week: 1,
        day: 0.5,
      },
      protectLocked: true,
      protectProduction: true,
      maxAdjustments: 100000, // 取消调整数量限制，设置为非常大的值
      shopfloor: {
        enabled: true,
        targetRatio: 0.7,
        tolerance: 50,
        priority: 0.4,
      },
      comprehensiveRules: {
        monthToleranceHours: 8,
        quarterUpperAllowanceHours: undefined,
      },
      ...config,
    };
    this.comprehensiveRules = {
      monthToleranceHours: Math.max(
        0,
        config?.comprehensiveRules?.monthToleranceHours ??
          this.config.comprehensiveRules?.monthToleranceHours ??
          8
      ),
      quarterUpperAllowanceHours:
        config?.comprehensiveRules?.quarterUpperAllowanceHours ??
        this.config.comprehensiveRules?.quarterUpperAllowanceHours,
    };
  }

  /**
   * 计算员工工时统计
   */
  async calculateEmployeeStats(
    employeeId: number,
    schedules: ScheduleRecord[],
    periodStart: string,
    periodEnd: string
  ): Promise<EmployeeWorkloadStats> {
    const config = await this.adapter.getWorkTimeSystemConfig(
      employeeId,
      periodStart
    );

    const stats: EmployeeWorkloadStats = {
      employeeId,
      workTimeSystemType: config?.workTimeSystemType || "STANDARD",
      comprehensivePeriod: config?.comprehensivePeriod,
      quarterHours: 0,
      quarterTargetHours: config?.quarterStandardHours || 0,
      monthlyHours: new Map(),
      weeklyHours: new Map(),
      dailyHours: new Map(),
      lockedDates: new Set(),
      productionDates: new Set(),
    };

    // 加载锁定排班日期
    if (this.config.protectLocked) {
      const lockedDates = await this.loadLockedDates(employeeId, periodStart, periodEnd);
      lockedDates.forEach((date) => stats.lockedDates.add(date));
    }

    // 计算各维度工时
    let totalHours = 0;
    schedules.forEach((schedule) => {
      const hours = schedule.planHours + schedule.overtimeHours;
      totalHours += hours;

      const date = dayjs(schedule.date);
      const dateStr = date.format("YYYY-MM-DD");

      // 日度工时
      stats.dailyHours.set(dateStr, hours);

      // 月度工时
      const monthKey = date.format("YYYY-MM");
      stats.monthlyHours.set(
        monthKey,
        (stats.monthlyHours.get(monthKey) || 0) + hours
      );

      // 周度工时（ISO周）
      const weekKey = `${date.year()}-W${String(date.isoWeek()).padStart(2, "0")}`;
      stats.weeklyHours.set(
        weekKey,
        (stats.weeklyHours.get(weekKey) || 0) + hours
      );

      // 标记生产任务日期
      if (schedule.overtimeHours > 0) {
        stats.productionDates.add(dateStr);
      }
    });

    stats.quarterHours = totalHours;

    // 如果是综合工时制，计算周期工时
    if (config?.workTimeSystemType === "COMPREHENSIVE" && config.comprehensivePeriod) {
      const periodStartDate = this.adapter.getPeriodStart(periodStart, config.comprehensivePeriod);
      const periodEndDate = this.adapter.getPeriodEnd(periodStart, config.comprehensivePeriod);
      
      stats.comprehensivePeriodStart = periodStartDate.format("YYYY-MM-DD");
      stats.comprehensivePeriodEnd = periodEndDate.format("YYYY-MM-DD");
      
      const periodHours = await this.adapter.calculatePeriodAccumulatedHoursFromSchedules(
        schedules,
        periodStartDate,
        periodEndDate,
        true // 排除法定节假日
      );
      
      stats.comprehensivePeriodHours = periodHours;
      stats.comprehensivePeriodTargetHours = config.comprehensiveTargetHours;
    }

    // 设置月度目标工时
    if (config?.monthStandardHours) {
      stats.monthlyTargetHours = config.monthStandardHours;
    }

    // 设置周度目标工时（默认40小时）
    stats.weeklyTargetHours = 40;

    return stats;
  }

  /**
   * 季度工时均衡
   * 硬约束：确保所有员工至少达到标准工时（不得低于标准工时）
   * 软约束：均衡员工之间的工时差异
   */
  async balanceQuarterHours(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string,
    targetHours: number
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    const tolerance = this.config.tolerance.quarter;

    // 计算每个员工的工时统计
    const statsMap = new Map<number, EmployeeWorkloadStats>();
    for (const employeeId of employeeIds) {
      const employeeSchedules = schedules.get(employeeId) || [];
      const stats = await this.calculateEmployeeStats(
        employeeId,
        employeeSchedules,
        periodStart,
        periodEnd
      );
      statsMap.set(employeeId, stats);
    }

    // 硬约束：找出工时不足标准工时的员工（必须补足）
    const criticalShortages: Array<{ employeeId: number; needed: number; stats: EmployeeWorkloadStats }> = [];
    // 软约束：找出工时超标的员工（可以适当减少）
    const overages: Array<{ employeeId: number; excess: number; stats: EmployeeWorkloadStats }> = [];

    statsMap.forEach((stats, employeeId) => {
      const quarterHours = stats.quarterHours;
      const diff = targetHours - quarterHours;
      const upperLimit = targetHours + 40; // 上限：季度标准工时 + 40小时
      
      // 硬约束：工时低于标准工时且未超过上限，必须补足
      if (diff > 0.1 && quarterHours < upperLimit) {
        // 确保补足后不超过上限
        const neededHours = Math.min(diff, upperLimit - quarterHours);
        if (neededHours > 0.1) {
          criticalShortages.push({ employeeId, needed: neededHours, stats });
        }
      } else if (diff < -tolerance) {
        // 软约束：工时超过标准工时+tolerance，可以适当减少
        overages.push({ employeeId, excess: -diff, stats });
      }
    });

    // 硬约束：为工时不足标准工时的员工强制添加班次（最高优先级）
    for (const shortage of criticalShortages) {
      const employeeAdjustments = await this.addHoursToEmployee(
        shortage.employeeId,
        shortage.needed,
        schedules.get(shortage.employeeId) || [],
        periodStart,
        periodEnd,
        shortage.stats,
        "QUARTER_STANDARD_HOURS_REQUIREMENT" // 硬约束标识
      );
      // 设置最高优先级，确保硬约束调整不被截断
      employeeAdjustments.forEach(adj => {
        adj.priority = 10; // 最高优先级
      });
      adjustments.push(...employeeAdjustments);
    }

    // 软约束：为工时超标的员工减少班次（较低优先级）
    for (const overage of overages) {
      const employeeAdjustments = await this.removeHoursFromEmployee(
        overage.employeeId,
        overage.excess,
        schedules.get(overage.employeeId) || [],
        periodStart,
        periodEnd,
        overage.stats,
        "QUARTER_BALANCE"
      );
      // 设置较低优先级，允许被截断
      employeeAdjustments.forEach(adj => {
        adj.priority = adj.priority || 5; // 中等优先级
      });
      adjustments.push(...employeeAdjustments);
    }

    // 取消调整数量限制，返回所有调整
    return adjustments;
  }

  /**
   * 月度工时均衡
   * 硬约束：确保所有员工至少达到月度标准工时（不得低于标准工时）
   * 软约束：均衡员工之间的月度工时差异
   */
  async balanceMonthlyHours(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string,
    month: string, // YYYY-MM格式
    previousAdjustments?: ScheduleAdjustment[] // 前面阶段已生成的调整建议（用于累计工时计算）
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    const tolerance = this.config.tolerance.month;

    // 计算月度标准工时
    const monthStartDate = dayjs(`${month}-01`);
    const monthEndDate = monthStartDate.endOf("month");
    const workingDays = await this.adapter.calculateWorkingDays(
      monthStartDate.format("YYYY-MM-DD"),
      monthEndDate.format("YYYY-MM-DD")
    );
    const monthStandardHours = workingDays * 8; // 标准日工时8小时

    // 计算每个员工的月度工时统计
    const statsMap = new Map<number, EmployeeWorkloadStats>();
    for (const employeeId of employeeIds) {
      const employeeSchedules = schedules.get(employeeId) || [];
      const stats = await this.calculateEmployeeStats(
        employeeId,
        employeeSchedules,
        periodStart,
        periodEnd
      );
      statsMap.set(employeeId, stats);
    }

    // 硬约束：找出工时不足月度标准工时的员工（必须补足）
    const criticalShortages: Array<{
      employeeId: number;
      needed: number;
      stats: EmployeeWorkloadStats;
    }> = [];
    // 软约束：找出工时超标的员工（可以适当减少）
    const overages: Array<{
      employeeId: number;
      excess: number;
      stats: EmployeeWorkloadStats;
    }> = [];

    // 累计前面阶段（季度均衡）已生成的调整建议工时
    const previousAdjustmentHoursMap = new Map<number, number>();
    if (previousAdjustments) {
      previousAdjustments.forEach(adj => {
        if (adj.action === "ADD" || adj.action === "MODIFY") {
          const adjDate = dayjs(adj.date);
          const adjMonth = adjDate.format("YYYY-MM");
          if (adjMonth === month) {
            const current = previousAdjustmentHoursMap.get(adj.employeeId) || 0;
            previousAdjustmentHoursMap.set(adj.employeeId, current + adj.planHours + adj.overtimeHours);
          }
        }
      });
    }
    
    statsMap.forEach((stats, employeeId) => {
      const monthHours = stats.monthlyHours.get(month) || 0;
      // 累计前面阶段（季度均衡）已生成的调整建议工时
      const previousAdjustmentHours = previousAdjustmentHoursMap.get(employeeId) || 0;
      const accumulatedMonthHours = monthHours + previousAdjustmentHours;
      const diff = monthStandardHours - accumulatedMonthHours;
      const upperLimit = monthStandardHours + 20; // 上限：标准工时 + 20小时
      
      // 硬约束：工时低于标准工时且未超过上限，必须补足
      if (diff > 0.1 && accumulatedMonthHours < upperLimit) {
        // 确保补足后不超过上限
        const neededHours = Math.min(diff, upperLimit - accumulatedMonthHours);
        if (neededHours > 0.1) {
          criticalShortages.push({ employeeId, needed: neededHours, stats });
        }
      } else if (diff < -tolerance) {
        // 软约束：工时超过标准工时+tolerance，可以适当减少
        overages.push({ employeeId, excess: -diff, stats });
      }
    });

    // 硬约束：为工时不足标准工时的员工强制添加班次（最高优先级）
    for (const shortage of criticalShortages) {
      const addAdjustments = await this.addHoursToEmployee(
        shortage.employeeId,
        shortage.needed,
        schedules.get(shortage.employeeId) || [],
        monthStartDate.format("YYYY-MM-DD"),
        monthEndDate.format("YYYY-MM-DD"),
        shortage.stats,
        "MONTHLY_STANDARD_HOURS_REQUIREMENT" // 硬约束标识
      );
      // 设置最高优先级，确保硬约束调整不被截断
      addAdjustments.forEach(adj => {
        adj.priority = 10; // 最高优先级
      });
      adjustments.push(...addAdjustments);
    }

    // 软约束：为工时超标的员工减少班次（较低优先级）
    for (const overage of overages) {
      const removeAdjustments = await this.removeHoursFromEmployee(
        overage.employeeId,
        overage.excess,
        schedules.get(overage.employeeId) || [],
        monthStartDate.format("YYYY-MM-DD"),
        monthEndDate.format("YYYY-MM-DD"),
        overage.stats,
        "MONTHLY_BALANCE"
      );
      // 设置较低优先级，允许被截断
      removeAdjustments.forEach(adj => {
        adj.priority = adj.priority || 5; // 中等优先级
      });
      adjustments.push(...removeAdjustments);
    }

    // 取消调整数量限制，返回所有调整
    return adjustments;
  }

  /**
   * 周度工时均衡
   * 调整周内日度分配
   */
  async balanceWeeklyHours(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string,
    weekKey: string // YYYY-Www格式
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    const tolerance = this.config.tolerance.week;

    // 解析周键
    const [year, week] = weekKey.split("-W").map(Number);
    const weekStart = dayjs().year(year).isoWeek(week).startOf("isoWeek");
    const weekEnd = weekStart.endOf("isoWeek");

    // 计算每个员工的周度工时统计
    const statsMap = new Map<number, EmployeeWorkloadStats>();
    for (const employeeId of employeeIds) {
      const employeeSchedules = schedules.get(employeeId) || [];
      const stats = await this.calculateEmployeeStats(
        employeeId,
        employeeSchedules,
        periodStart,
        periodEnd
      );
      statsMap.set(employeeId, stats);
    }

    // 计算周度平均工时
    const weeklyHoursArray: number[] = [];
    statsMap.forEach((stats) => {
      const weekHours = stats.weeklyHours.get(weekKey) || 0;
      weeklyHoursArray.push(weekHours);
    });

    if (weeklyHoursArray.length === 0) {
      return adjustments;
    }

    const meanHours =
      weeklyHoursArray.reduce((sum, h) => sum + h, 0) / weeklyHoursArray.length;

    // 找出偏离平均值的员工
    const rebalance: Array<{
      employeeId: number;
      diff: number;
      stats: EmployeeWorkloadStats;
    }> = [];

    statsMap.forEach((stats, employeeId) => {
      const weekHours = stats.weeklyHours.get(weekKey) || 0;
      const diff = meanHours - weekHours;
      if (Math.abs(diff) > tolerance) {
        rebalance.push({ employeeId, diff, stats });
      }
    });

    // 调整工时
    for (const item of rebalance) {
      if (item.diff > 0) {
        // 需要增加工时
        const addAdjustments = await this.addHoursToEmployee(
          item.employeeId,
          item.diff,
          schedules.get(item.employeeId) || [],
          weekStart.format("YYYY-MM-DD"),
          weekEnd.format("YYYY-MM-DD"),
          item.stats,
          "WEEKLY_BALANCE"
        );
        adjustments.push(...addAdjustments);
      } else {
        // 需要减少工时
        const removeAdjustments = await this.removeHoursFromEmployee(
          item.employeeId,
          -item.diff,
          schedules.get(item.employeeId) || [],
          weekStart.format("YYYY-MM-DD"),
          weekEnd.format("YYYY-MM-DD"),
          item.stats,
          "WEEKLY_BALANCE"
        );
        adjustments.push(...removeAdjustments);
      }
    }

    // 取消调整数量限制，返回所有调整
    return adjustments;
  }

  /**
   * 车间工时均衡
   * 确保员工之间执行操作任务的工时相对均衡，实现劳动公平性
   * 车间工时 = operationPlanId > 0 的工时（操作任务工时）
   * 
   * 注意：车间工时均衡主要通过以下机制实现：
   * 1. 优化阶段（阶段4）：通过多目标优化算法，车间工时均衡作为优化目标（40%权重）
   * 2. 约束检查阶段（阶段6）：检查车间工时方差，记录软约束违反
   * 3. 工时均衡阶段（阶段7）：本函数记录不均衡情况并提供警告
   */
  async balanceShopfloorHours(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    const tolerance = this.config.shopfloor?.tolerance || 50; // 车间工时均衡容差（小时）

    // 1. 计算每个员工的车间工时（只统计操作任务工时）
    const shopfloorHoursMap = new Map<number, number>();
    const totalHoursMap = new Map<number, number>(); // 总工时（用于计算占比）
    
    employeeIds.forEach(empId => {
      shopfloorHoursMap.set(empId, 0);
      totalHoursMap.set(empId, 0);
    });

    schedules.forEach((empSchedules, empId) => {
      let shopfloorHours = 0;
      let totalHours = 0;
      empSchedules.forEach((schedule) => {
        const hours = schedule.planHours + schedule.overtimeHours;
        totalHours += hours;
        // 只统计 operationPlanId > 0 的工时（操作任务）
        if (schedule.operationPlanId && schedule.operationPlanId > 0) {
          shopfloorHours += hours;
        }
      });
      shopfloorHoursMap.set(empId, shopfloorHours);
      totalHoursMap.set(empId, totalHours);
    });

    // 2. 计算车间工时平均值、方差和标准差
    const shopfloorHoursArray = Array.from(shopfloorHoursMap.values());
    if (shopfloorHoursArray.length === 0) {
      return adjustments;
    }

    const meanShopfloorHours = shopfloorHoursArray.reduce((sum, h) => sum + h, 0) / shopfloorHoursArray.length;
    
    if (meanShopfloorHours === 0) {
      return adjustments; // 如果平均车间工时为0，无需均衡
    }

    // 计算方差和标准差
    const variance = shopfloorHoursArray.reduce((sum, h) => sum + Math.pow(h - meanShopfloorHours, 2), 0) / shopfloorHoursArray.length;
    const stdDev = Math.sqrt(variance);
    
    // 计算最大值和最小值
    const maxShopfloorHours = Math.max(...shopfloorHoursArray);
    const minShopfloorHours = Math.min(...shopfloorHoursArray);
    const range = maxShopfloorHours - minShopfloorHours;

    // 3. 识别车间工时过高/过低的员工
    const highShopfloorEmployees: Array<{ employeeId: number; hours: number; diff: number; ratio: number }> = [];
    const lowShopfloorEmployees: Array<{ employeeId: number; hours: number; diff: number; ratio: number }> = [];

    shopfloorHoursMap.forEach((hours, empId) => {
      const diff = hours - meanShopfloorHours;
      const totalHours = totalHoursMap.get(empId) || 0;
      const ratio = totalHours > 0 ? hours / totalHours : 0; // 车间工时占比
      
      if (Math.abs(diff) > tolerance) {
        if (diff > 0) {
          highShopfloorEmployees.push({ employeeId: empId, hours, diff, ratio });
        } else {
          lowShopfloorEmployees.push({ employeeId: empId, hours, diff: -diff, ratio });
        }
      }
    });

    // 4. 排序：车间工时高的优先减少，车间工时低的优先增加
    highShopfloorEmployees.sort((a, b) => b.diff - a.diff);
    lowShopfloorEmployees.sort((a, b) => b.diff - a.diff);

    // 5. 记录车间工时均衡情况（通过返回警告信息）
    // 注意：车间工时均衡主要在优化阶段（阶段4）通过多目标优化实现
    // 这里的调整建议主要用于监控和报告，实际的重新分配操作任务需要在下一轮优化中完成
    
    // 如果车间工时方差过大，记录详细警告
    const varianceThreshold = 10000; // 方差阈值：10000（约100小时的差异）
    if (variance > varianceThreshold || range > tolerance * 2) {
      // 车间工时不均衡，记录详细信息供后续参考
      // 注意：由于操作任务已经分配完成，这里无法直接重新分配
      // 但可以提供详细的报告，帮助识别需要改进的地方
      
      const highCount = highShopfloorEmployees.length;
      const lowCount = lowShopfloorEmployees.length;
      const targetRatio = this.config.shopfloor?.targetRatio || 0.7; // 目标车间工时占比70%
      
      // 计算平均车间工时占比
      const avgRatio = Array.from(shopfloorHoursMap.entries())
        .map(([empId, hours]) => {
          const total = totalHoursMap.get(empId) || 0;
          return total > 0 ? hours / total : 0;
        })
        .reduce((sum, r) => sum + r, 0) / employeeIds.length;
      
      // 生成详细的均衡报告（可以通过日志或警告返回）
      // 这些信息可以帮助用户了解车间工时的分布情况
      
      // 返回空数组，因为实际调整需要在优化阶段完成
      // 但可以通过warnings字段传递信息（这个需要在调用方处理）
    }

    return adjustments; // 返回空数组，车间工时均衡主要通过优化阶段的多目标优化实现
  }

  /**
   * 计算车间工时统计信息
   * 用于监控和报告车间工时的分布情况
   */
  private async calculateShopfloorStatistics(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>
  ): Promise<{
    mean: number;
    variance: number;
    stdDev: number;
    min: number;
    max: number;
    range: number;
    minEmployeeId: number;
    maxEmployeeId: number;
  }> {
    const shopfloorHoursMap = new Map<number, number>();
    
    employeeIds.forEach(empId => {
      shopfloorHoursMap.set(empId, 0);
    });

    schedules.forEach((empSchedules, empId) => {
      let shopfloorHours = 0;
      empSchedules.forEach((schedule) => {
        // 只统计 operationPlanId > 0 的工时（操作任务）
        if (schedule.operationPlanId && schedule.operationPlanId > 0) {
          shopfloorHours += schedule.planHours + schedule.overtimeHours;
        }
      });
      shopfloorHoursMap.set(empId, shopfloorHours);
    });

    const shopfloorHoursArray = Array.from(shopfloorHoursMap.values());
    if (shopfloorHoursArray.length === 0) {
      return {
        mean: 0,
        variance: 0,
        stdDev: 0,
        min: 0,
        max: 0,
        range: 0,
        minEmployeeId: 0,
        maxEmployeeId: 0,
      };
    }

    const mean = shopfloorHoursArray.reduce((sum, h) => sum + h, 0) / shopfloorHoursArray.length;
    const variance = shopfloorHoursArray.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) / shopfloorHoursArray.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...shopfloorHoursArray);
    const max = Math.max(...shopfloorHoursArray);
    const range = max - min;

    // 找出工时最高和最低的员工ID
    let minEmployeeId = 0;
    let maxEmployeeId = 0;
    shopfloorHoursMap.forEach((hours, empId) => {
      if (hours === min && minEmployeeId === 0) {
        minEmployeeId = empId;
      }
      if (hours === max) {
        maxEmployeeId = empId;
      }
    });

    return {
      mean,
      variance,
      stdDev,
      min,
      max,
      range,
      minEmployeeId,
      maxEmployeeId,
    };
  }

  /**
   * 综合工时制均衡
   * 根据综合工时制周期进行均衡
   */
  async balanceComprehensiveHours(
    employeeId: number,
    schedules: ScheduleRecord[],
    period: ComprehensivePeriod,
    currentHours: number,
    targetHours: number
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    const config = await this.adapter.getWorkTimeSystemConfig(
      employeeId,
      schedules.length > 0 ? schedules[0].date : dayjs().format("YYYY-MM-DD")
    );

    if (!config || config.workTimeSystemType !== "COMPREHENSIVE") {
      return adjustments;
    }

    const tolerance = 0.1 * targetHours; // 10%容差
    const diff = targetHours - currentHours;

    if (Math.abs(diff) <= tolerance) {
      return adjustments;
    }

    // 计算周期范围
    const referenceDate = schedules.length > 0 ? schedules[0].date : dayjs().format("YYYY-MM-DD");
    const periodStart = this.adapter.getPeriodStart(referenceDate, period);
    const periodEnd = this.adapter.getPeriodEnd(referenceDate, period);

    const stats = await this.calculateEmployeeStats(
      employeeId,
      schedules,
      periodStart.format("YYYY-MM-DD"),
      periodEnd.format("YYYY-MM-DD")
    );

    if (diff > 0) {
      // 需要增加工时
      const addAdjustments = await this.addHoursToEmployee(
        employeeId,
        diff,
        schedules,
        periodStart.format("YYYY-MM-DD"),
        periodEnd.format("YYYY-MM-DD"),
        stats,
        `COMPREHENSIVE_${period}`
      );
      adjustments.push(...addAdjustments);
    } else {
      // 需要减少工时
      const removeAdjustments = await this.removeHoursFromEmployee(
        employeeId,
        -diff,
        schedules,
        periodStart.format("YYYY-MM-DD"),
        periodEnd.format("YYYY-MM-DD"),
        stats,
        `COMPREHENSIVE_${period}`
      );
      adjustments.push(...removeAdjustments);
    }

    // 取消调整数量限制，返回所有调整
    return adjustments;
  }

  /**
   * 多目标均衡优化
   * 综合考虑季度、月度、周度、日度均衡
   */
  async multiObjectiveBalance(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string,
    targetQuarterHours?: number,
    peakDays?: Map<string, DailyOperationLoad>,
    backupRequirements?: Map<string, BackupRequirement>
  ): Promise<BalanceResult> {
    const adjustments: ScheduleAdjustment[] = [];
    const warnings: string[] = [];
    
    // 辅助函数：计算累计工时（初始工时 + 已生成的调整建议工时）
    const calculateAccumulatedHours = (empId: number): number => {
      const initialHours = (() => {
        const empSchedules = schedules.get(empId) || [];
        return empSchedules.reduce((sum, s) => sum + s.planHours + s.overtimeHours, 0);
      })();
      const adjustmentHours = adjustments
        .filter(adj => adj.employeeId === empId && (adj.action === "ADD" || adj.action === "MODIFY"))
        .reduce((sum, adj) => sum + adj.planHours + adj.overtimeHours, 0);
      return initialHours + adjustmentHours;
    };

    // 算法层强制：所有员工均采用综合工时制
    // 规则：
    // - 季度：必须满足最低要求（500小时），最高不超过标准工时+40小时（540小时）
    // - 月度：可以有10%的上下幅度（166.64小时 ± 10%，即约150-183小时）
    
    // 辅助函数：计算累计季度工时（初始工时 + 已生成的调整建议工时）
    const calculateAccumulatedQuarterHours = (empId: number): number => {
      const quarterStart = dayjs(periodStart).startOf("quarter");
      const quarterEnd = dayjs(periodStart).endOf("quarter");
      
      const initialHours = (() => {
        const empSchedules = schedules.get(empId) || [];
        return empSchedules
          .filter(s => {
            const date = dayjs(s.date);
            return date.isSameOrAfter(quarterStart, "day") && date.isSameOrBefore(quarterEnd, "day");
          })
          .reduce((sum, s) => sum + s.planHours, 0); // 只计算planHours
      })();
      const adjustmentHours = adjustments
        .filter(adj => {
          if (adj.employeeId !== empId) return false;
          const date = dayjs(adj.date);
          if (!date.isSameOrAfter(quarterStart, "day") || !date.isSameOrBefore(quarterEnd, "day")) return false;
          return adj.action === "ADD" || adj.action === "MODIFY" || adj.action === "REMOVE";
        })
        .reduce((sum, adj) => {
          if (adj.action === "ADD" || adj.action === "MODIFY") {
            return sum + adj.planHours; // 只计算planHours
          } else if (adj.action === "REMOVE") {
            // REMOVE操作：优先减去前面阶段ADD/MODIFY添加的工时，如果没有则减去初始记录的工时
            // 查找前面阶段是否有ADD/MODIFY操作在同一天
            const previousAddModify = adjustments
              .filter(a => 
                a.employeeId === empId && 
                a.date === adj.date && 
                (a.action === "ADD" || a.action === "MODIFY")
              );
            if (previousAddModify.length > 0) {
              // 减去前面ADD/MODIFY操作添加的工时
              const addedHours = previousAddModify.reduce((s, a) => s + a.planHours, 0);
              return sum - addedHours;
            } else {
              // 如果没有前面的ADD/MODIFY，减去初始记录的工时
              const initialSchedule = schedules.get(empId)?.find(s => s.date === adj.date);
              if (initialSchedule) {
                return sum - initialSchedule.planHours; // 减去被移除的工时
              }
            }
            return sum;
          }
          return sum;
        }, 0);
      return initialHours + adjustmentHours;
    };

    // 辅助函数：计算累计月度工时（初始工时 + 已生成的调整建议工时）
    const calculateAccumulatedMonthHours = (empId: number, monthKey: string): number => {
      const monthStart = dayjs(`${monthKey}-01`).startOf("month");
      const monthEnd = dayjs(`${monthKey}-01`).endOf("month");
      
      const initialHours = (() => {
        const empSchedules = schedules.get(empId) || [];
        return empSchedules
          .filter(s => dayjs(s.date).format("YYYY-MM") === monthKey)
          .reduce((sum, s) => sum + s.planHours, 0); // 只计算planHours
      })();
      const adjustmentHours = adjustments
        .filter(adj => {
          if (adj.employeeId !== empId) return false;
          if (dayjs(adj.date).format("YYYY-MM") !== monthKey) return false;
          return adj.action === "ADD" || adj.action === "MODIFY" || adj.action === "REMOVE";
        })
        .reduce((sum, adj) => {
          if (adj.action === "ADD" || adj.action === "MODIFY") {
            return sum + adj.planHours; // 只计算planHours
          } else if (adj.action === "REMOVE") {
            // REMOVE操作：优先减去前面阶段ADD/MODIFY添加的工时，如果没有则减去初始记录的工时
            // 查找前面阶段是否有ADD/MODIFY操作在同一天
            const previousAddModify = adjustments
              .filter(a => 
                a.employeeId === empId && 
                a.date === adj.date && 
                (a.action === "ADD" || a.action === "MODIFY")
              );
            if (previousAddModify.length > 0) {
              // 减去前面ADD/MODIFY操作添加的工时
              const addedHours = previousAddModify.reduce((s, a) => s + a.planHours, 0);
              return sum - addedHours;
            } else {
              // 如果没有前面的ADD/MODIFY，减去初始记录的工时
              const initialSchedule = schedules.get(empId)?.find(s => s.date === adj.date);
              if (initialSchedule) {
                return sum - initialSchedule.planHours; // 减去被移除的工时
              }
            }
            return sum;
          }
          return sum;
        }, 0);
      return initialHours + adjustmentHours;
    };
    
    // 1. 季度均衡（优先处理，确保季度约束满足）
    const quarterStart = dayjs(periodStart).startOf("quarter");
    const quarterEnd = dayjs(periodStart).endOf("quarter");
    
    // 动态计算季度标准工时（工作日 * 8小时）
    const quarterWorkingDays = await this.adapter.calculateWorkingDays(
      quarterStart.format("YYYY-MM-DD"),
      quarterEnd.format("YYYY-MM-DD")
    );
    const QUARTER_TARGET_HOURS = quarterWorkingDays * 8; // 季度标准工时
    const quarterUpperAllowance =
      this.comprehensiveRules.quarterUpperAllowanceHours;
    const QUARTER_MIN_HOURS = QUARTER_TARGET_HOURS; // 季度工时需≥标准
    const QUARTER_MAX_HOURS =
      quarterUpperAllowance !== undefined
        ? QUARTER_TARGET_HOURS + quarterUpperAllowance
        : Number.POSITIVE_INFINITY;
    
    for (const employeeId of employeeIds) {
      const employeeSchedules = schedules.get(employeeId) || [];
      
      // 关键修复：使用累计工时（初始工时 + 前面阶段的调整建议），而不是仅初始工时
      const quarterHours = calculateAccumulatedQuarterHours(employeeId);

      // 季度约束：标准工时 ± 4小时（硬约束）
      if (quarterHours < QUARTER_MIN_HOURS) {
        // 需要增加工时到最低要求
        const diff = QUARTER_MIN_HOURS - quarterHours;
        const stats = await this.calculateEmployeeStats(
          employeeId,
          employeeSchedules,
          quarterStart.format("YYYY-MM-DD"),
          quarterEnd.format("YYYY-MM-DD")
        );
        
        const addAdjustments = await this.addHoursToEmployee(
          employeeId,
          diff,
          employeeSchedules,
          quarterStart.format("YYYY-MM-DD"),
          quarterEnd.format("YYYY-MM-DD"),
          stats,
          `QUARTER_MIN_${quarterStart.format("YYYY-Q")}`
        );
        adjustments.push(...addAdjustments);
      } else if (
        Number.isFinite(QUARTER_MAX_HOURS) &&
        quarterHours > QUARTER_MAX_HOURS
      ) {
        // 需要减少工时到最高限制
        const diff = quarterHours - QUARTER_MAX_HOURS;
        const stats = await this.calculateEmployeeStats(
          employeeId,
          employeeSchedules,
          quarterStart.format("YYYY-MM-DD"),
          quarterEnd.format("YYYY-MM-DD")
        );
        
        const removeAdjustments = await this.removeHoursFromEmployee(
          employeeId,
          diff,
          employeeSchedules,
          quarterStart.format("YYYY-MM-DD"),
          quarterEnd.format("YYYY-MM-DD"),
          stats,
          `QUARTER_MAX_${quarterStart.format("YYYY-Q")}`
        );
        adjustments.push(...removeAdjustments);
      }
    }

    // 2. 月度均衡（在季度约束满足的前提下，确保月度约束满足）
    const monthSet = new Set<string>();
    let current = dayjs(periodStart);
    const end = dayjs(periodEnd);
    while (current.isSameOrBefore(end)) {
      monthSet.add(current.format("YYYY-MM"));
      current = current.add(1, "month").startOf("month");
    }

    for (const monthKey of monthSet) {
      const monthStart = dayjs(`${monthKey}-01`).startOf("month");
      const monthEnd = dayjs(`${monthKey}-01`).endOf("month");
      
      for (const employeeId of employeeIds) {
        const employeeSchedules = schedules.get(employeeId) || [];
        
        // 关键修复：使用累计工时（初始工时 + 前面阶段的调整建议），而不是仅初始工时
        const monthHours = calculateAccumulatedMonthHours(employeeId, monthKey);

        // 获取月度目标工时（动态计算）
        const monthTargetHours = await this.adapter.getPeriodTargetHours(
          employeeId,
          "MONTH",
          monthStart,
          monthEnd
        );

        if (monthTargetHours > 0) {
          // 月度约束：标准工时 ± 自定义容差（硬约束）
          const monthTolerance = this.comprehensiveRules.monthToleranceHours;
          const monthMinHours = Math.max(
            0,
            monthTargetHours - monthTolerance
          ); // 标准工时 - 容差
          const monthMaxHours = monthTargetHours + monthTolerance; // 标准工时 + 容差
          
          // 关键：检查季度约束，确保月度补足不会导致季度超限
          const quarterHours = calculateAccumulatedQuarterHours(employeeId);
          const quarterRemainingCapacity = QUARTER_MAX_HOURS - quarterHours; // 季度剩余容量
          
          // 如果月度补足会导致季度超限，调整月度上限
          const adjustedMonthMaxHours = Math.min(
            monthMaxHours,
            monthHours + quarterRemainingCapacity // 不超过季度剩余容量
          );

          if (monthHours < monthMinHours) {
            // 需要增加工时到最低要求，但不超过季度剩余容量
            const neededHours = monthMinHours - monthHours;
            const diff = Math.min(neededHours, quarterRemainingCapacity); // 不超过季度剩余容量
            
            // 如果季度剩余容量不足，记录警告
            if (diff < neededHours - 0.1) {
              warnings.push(
                `员工${employeeId}在${monthKey}月需要补足${neededHours.toFixed(2)}h，但季度剩余容量仅${quarterRemainingCapacity.toFixed(2)}h，只能补足${diff.toFixed(2)}h（季度约束优先）`
              );
            }
            const stats = await this.calculateEmployeeStats(
              employeeId,
              employeeSchedules,
              monthStart.format("YYYY-MM-DD"),
              monthEnd.format("YYYY-MM-DD")
            );
            
            const addAdjustments = await this.addHoursToEmployee(
              employeeId,
              diff,
              employeeSchedules,
              monthStart.format("YYYY-MM-DD"),
              monthEnd.format("YYYY-MM-DD"),
              stats,
              `MONTH_MIN_${monthKey}`
            );
            adjustments.push(...addAdjustments);
          } else if (monthHours > adjustedMonthMaxHours) {
            // 需要减少工时到最高限制（考虑季度约束）
            const diff = monthHours - adjustedMonthMaxHours;
            const stats = await this.calculateEmployeeStats(
              employeeId,
              employeeSchedules,
              monthStart.format("YYYY-MM-DD"),
              monthEnd.format("YYYY-MM-DD")
            );
            
            const removeAdjustments = await this.removeHoursFromEmployee(
              employeeId,
              diff,
              employeeSchedules,
              monthStart.format("YYYY-MM-DD"),
              monthEnd.format("YYYY-MM-DD"),
              stats,
              `MONTH_MAX_${monthKey}`
            );
            adjustments.push(...removeAdjustments);
          }
        }
      }
    }

    // 2.1 高峰日backup人员安排（在标准工时补足之前）
    if (peakDays && backupRequirements && peakDays.size > 0 && this.config.backup?.prioritizePeakDays) {
      // 统计每日已安排的backup人员数量（通过operationPlanId=0或isBackup标记识别）
      const dailyBackupCount = new Map<string, number>();
      schedules.forEach((empSchedules) => {
        empSchedules.forEach((schedule) => {
          // 简化处理：统计每日已有排班的人数作为参考
          const date = schedule.date;
          dailyBackupCount.set(date, (dailyBackupCount.get(date) || 0) + 1);
        });
      });
      
      // 为高峰日补充backup人员
      for (const [date, requirement] of backupRequirements) {
        const currentBackup = dailyBackupCount.get(date) || 0;
        const neededBackup = requirement.requiredBackupPeople - currentBackup;
        
        if (neededBackup > 0) {
          // 选择工时不足的员工作为backup候选人
          const candidateEmployees: number[] = [];
          
          for (const empId of employeeIds) {
            const empSchedules = schedules.get(empId) || [];
            const stats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
            const config = await this.adapter.getWorkTimeSystemConfig(empId, periodStart);
            
            // 检查月度标准工时
            const monthKey = dayjs(date).format("YYYY-MM");
            const monthHours = stats.monthlyHours.get(monthKey) || 0;
            let monthStandardHours = config?.monthStandardHours;
            
            // 如果没有配置，动态计算
            if (!monthStandardHours || monthStandardHours <= 0) {
              const monthStart = dayjs(`${monthKey}-01`);
              const monthEnd = monthStart.endOf("month");
              const workingDays = await this.adapter.calculateWorkingDays(
                monthStart.format("YYYY-MM-DD"),
                monthEnd.format("YYYY-MM-DD")
              );
              monthStandardHours = workingDays * 8;
            }
            
            // 选择工时不足的员工
            if (monthHours < monthStandardHours) {
              candidateEmployees.push(empId);
            }
          }
          
          // 为需要的backup人数选择员工
          const selectedEmployees = candidateEmployees.slice(0, neededBackup);
          
          for (const empId of selectedEmployees) {
            const empSchedules = schedules.get(empId) || [];
            const empStats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
            
            // 获取默认班次工时
            const [shiftRows] = await pool.execute<RowDataPacket[]>(
              `SELECT nominal_hours FROM shift_definitions 
               WHERE is_active = 1 AND shift_code = 'DAY' LIMIT 1`
            );
            const defaultShiftHours = shiftRows.length > 0 
              ? Number(shiftRows[0].nominal_hours || 8) 
              : 8;
            
            // 添加一个完整班次作为backup
            const backupAdjustments = await this.addHoursToEmployee(
              empId,
              defaultShiftHours, // 添加一个完整班次
              empSchedules,
              periodStart,
              periodEnd,
              empStats,
              `PEAK_DAY_BACKUP_${date}`,
              peakDays,
              backupRequirements
            );
            adjustments.push(...backupAdjustments);
          }
        }
      }
    }

    // 算法层强制：所有员工均采用综合工时制，已在上面的综合工时制均衡中处理
    // 以下标准工时制均衡逻辑已禁用（所有员工统一按综合工时制处理）
    
    // 3. 季度均衡（标准工时制员工）- 已禁用
    // 4. 月度均衡（标准工时制员工）- 已禁用
    // 5. 周度均衡（标准工时制员工）- 已禁用
    
    // 5.1 车间工时均衡（确保员工之间执行操作任务的工时相对均衡）
    // 注意：车间工时均衡主要在优化阶段（阶段4）通过多目标优化实现
    // 这里主要用于监控和报告车间工时分布情况
    // 算法层强制：所有员工统一处理，不再区分标准工时制和综合工时制
    if (this.config.shopfloor?.enabled !== false) {
      const shopfloorAdjustments = await this.balanceShopfloorHours(
        employeeIds, // 使用所有员工，不再区分标准工时制
        schedules,
        periodStart,
        periodEnd
      );
      adjustments.push(...shopfloorAdjustments);
      
      // 计算车间工时统计信息（用于报告）
      const shopfloorStats = await this.calculateShopfloorStatistics(
        employeeIds, // 使用所有员工，不再区分标准工时制
        schedules
      );
      
      if (shopfloorStats.variance > 10000 || shopfloorStats.range > 100) {
        warnings.push(
          `车间工时不均衡警告：平均车间工时${shopfloorStats.mean.toFixed(1)}h，标准差${shopfloorStats.stdDev.toFixed(1)}h，极差${shopfloorStats.range.toFixed(1)}h，方差${shopfloorStats.variance.toFixed(0)}。` +
          `最高${shopfloorStats.max.toFixed(1)}h（员工${shopfloorStats.maxEmployeeId}），最低${shopfloorStats.min.toFixed(1)}h（员工${shopfloorStats.minEmployeeId}）。` +
          `建议在下一轮优化中调整操作任务分配以实现更好的均衡。`
        );
      }
    }

    // 6. 计算均衡度
    const balanceMetrics = await this.calculateBalanceMetrics(
      employeeIds,
      schedules,
      periodStart,
      periodEnd
    );

    // 7. 确保所有员工都有足够的工时（强制补足工时严重不足的员工）
    // 重要：必须处理employeeIds列表中的所有员工，而不仅仅是schedules中已有排班记录的员工
    // 关键修复：需要累计前面阶段已生成的调整建议工时，避免重复补足导致工时超出
    const criticalEmployees: number[] = [];
    const employeeHoursMap = new Map<number, number>();
    
    // 初始化所有员工的工时映射（确保即使没有排班记录也被包含）
    employeeIds.forEach(empId => {
      employeeHoursMap.set(empId, 0);
    });
    
    // 计算每个员工的初始工时（从schedules中累加）
    schedules.forEach((empSchedules, empId) => {
      const totalHours = empSchedules.reduce(
        (sum, s) => sum + s.planHours + s.overtimeHours,
        0
      );
      employeeHoursMap.set(empId, totalHours);
    });
    
    // 累计前面阶段已生成的调整建议工时（避免重复补足）
    const adjustmentHoursMap = new Map<number, number>();
    adjustments.forEach(adj => {
      if (adj.action === "ADD" || adj.action === "MODIFY") {
        const current = adjustmentHoursMap.get(adj.employeeId) || 0;
        adjustmentHoursMap.set(adj.employeeId, current + adj.planHours + adj.overtimeHours);
      } else if (adj.action === "REMOVE") {
        // REMOVE操作会减少工时，但这里简化处理，只考虑ADD和MODIFY的累加
        // 因为REMOVE通常是在前面阶段已经补足过多的基础上进行的调整
      }
    });
    
    // 计算累计工时（初始工时 + 前面阶段的调整建议工时）
    const accumulatedHoursMap = new Map<number, number>();
    employeeIds.forEach(empId => {
      const initialHours = employeeHoursMap.get(empId) || 0;
      const adjustmentHours = adjustmentHoursMap.get(empId) || 0;
      accumulatedHoursMap.set(empId, initialHours + adjustmentHours);
    });
    
    // 计算月度标准工时
    const monthStart = dayjs(periodStart).startOf("month");
    const monthEnd = dayjs(periodStart).endOf("month");
    const workingDays = await this.adapter.calculateWorkingDays(
      monthStart.format("YYYY-MM-DD"),
      monthEnd.format("YYYY-MM-DD")
    );
    const monthStandardHours = workingDays * 8;
    const criticalThreshold = monthStandardHours * 0.1; // 低于标准工时10%视为严重不足
    const upperLimit = monthStandardHours + 20; // 上限：标准工时 + 20小时（容差）
    
    // 识别工时严重不足且未超过上限的员工
    accumulatedHoursMap.forEach((accumulatedHours, empId) => {
      // 只对低于下限且未超过上限的员工进行补足
      if (accumulatedHours < criticalThreshold && accumulatedHours < upperLimit) {
        criticalEmployees.push(empId);
      }
    });
    
    // 为工时严重不足的员工强制生成补足建议
    if (criticalEmployees.length > 0) {
      const criticalAdjustments: ScheduleAdjustment[] = [];
      
      for (const empId of criticalEmployees) {
        const accumulatedHours = accumulatedHoursMap.get(empId) || 0;
        // 计算所需工时，但不超过上限
        const neededHours = Math.min(monthStandardHours - accumulatedHours, upperLimit - accumulatedHours);
        
        if (neededHours > 0.1) {
          const empSchedules = schedules.get(empId) || [];
          const empStats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
          
          // 为工时严重不足的员工生成高优先级的调整建议
          const criticalAdjusts = await this.addHoursToEmployee(
            empId,
            neededHours,
            empSchedules,
            periodStart,
            periodEnd,
            empStats,
            `CRITICAL_HOURS_COMPLETION_${empId}`,
            undefined,
            undefined
          );
          
          // 设置最高优先级，确保不被截断
          criticalAdjusts.forEach(adj => {
            adj.priority = 10; // 最高优先级
          });
          
          criticalAdjustments.push(...criticalAdjusts);
        }
      }
      
      // 将关键调整建议添加到调整列表的开头（最高优先级）
      adjustments.unshift(...criticalAdjustments);
      
      warnings.push(
        `检测到 ${criticalEmployees.length} 名员工工时严重不足（<标准工时10%），已强制补足（累计前面阶段调整后工时：${Array.from(criticalEmployees.slice(0, 5).map(empId => `员工${empId}=${accumulatedHoursMap.get(empId)?.toFixed(1)}h`)).join(', ')}${criticalEmployees.length > 5 ? '...' : ''}）`
      );
    }
    
    // 检查是否有员工工时超过上限
    const overLimitEmployees: number[] = [];
    accumulatedHoursMap.forEach((accumulatedHours, empId) => {
      if (accumulatedHours > upperLimit) {
        overLimitEmployees.push(empId);
      }
    });
    
    if (overLimitEmployees.length > 0) {
      warnings.push(
        `警告：${overLimitEmployees.length} 名员工累计工时超过上限（>${upperLimit}h）：${overLimitEmployees.slice(0, 10).map(empId => `员工${empId}=${accumulatedHoursMap.get(empId)?.toFixed(1)}h`).join(', ')}${overLimitEmployees.length > 10 ? '...' : ''}。可能是前面阶段的补足导致叠加，建议检查季度/月度均衡逻辑。`
      );
    }

    // 8. 按优先级排序，确保高优先级调整不被截断
    adjustments.sort((a, b) => {
      // 首先按优先级排序（降序）
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      // 然后按员工ID和日期排序（稳定排序）
      if (a.employeeId !== b.employeeId) {
        return a.employeeId - b.employeeId;
      }
      return a.date.localeCompare(b.date);
    });

    // 9. 应用所有调整（已取消调整数量限制）
    let finalAdjustments: ScheduleAdjustment[] = adjustments;
    
    // 记录调整数量（用于日志）
    const criticalAdjustmentsCount = adjustments.filter(a => a.priority === 10).length;
    if (adjustments.length > 0) {
      warnings.push(
        `生成了 ${adjustments.length} 个调整建议（其中 ${criticalAdjustmentsCount} 个关键调整）`
      );
    }
    
    // 10. 硬约束：最终检查 - 确保所有员工的月度和季度工时都达到标准工时
    // 这是一个兜底机制，确保即使前面的调整未能完全满足要求，也要强制补足
    const finalCheckAdjustments: ScheduleAdjustment[] = [];
    
    // 计算季度标准工时
    const finalCheckQuarterStart = dayjs(periodStart).startOf("quarter");
    const finalCheckQuarterEnd = dayjs(periodStart).endOf("quarter");
    const finalCheckQuarterWorkingDays = await this.adapter.calculateWorkingDays(
      finalCheckQuarterStart.format("YYYY-MM-DD"),
      finalCheckQuarterEnd.format("YYYY-MM-DD")
    );
    const quarterStandardHours = finalCheckQuarterWorkingDays * 8;
    
    // 计算所有月份的标准工时
    const finalCheckMonthSet = new Set<string>();
    current = dayjs(periodStart);
    const finalCheckEnd = dayjs(periodEnd);
    while (current.isSameOrBefore(finalCheckEnd)) {
      finalCheckMonthSet.add(current.format("YYYY-MM"));
      current = current.add(1, "month");
    }
    
    // 重新计算应用调整后的工时（模拟）
    const simulatedHoursMap = new Map<number, { quarter: number; monthly: Map<string, number> }>();
    employeeIds.forEach(empId => {
      simulatedHoursMap.set(empId, {
        quarter: employeeHoursMap.get(empId) || 0,
        monthly: new Map()
      });
    });
    
    // 累加所有调整建议的工时
    finalAdjustments.forEach(adj => {
      const empData = simulatedHoursMap.get(adj.employeeId);
      if (empData) {
        const monthKey = dayjs(adj.date).format("YYYY-MM");
        const currentMonthHours = empData.monthly.get(monthKey) || 0;
        empData.monthly.set(monthKey, currentMonthHours + adj.planHours + adj.overtimeHours);
        empData.quarter += adj.planHours + adj.overtimeHours;
      }
    });
    
    // 检查每个员工的季度和月度工时
    const quarterViolations: number[] = [];
    const monthlyViolations: Map<string, number[]> = new Map(); // month -> employeeIds[]
    
    for (const empId of employeeIds) {
      const empData = simulatedHoursMap.get(empId);
      if (!empData) continue;
      
      // 检查季度工时（硬约束）
      if (empData.quarter < quarterStandardHours - 0.1) {
        quarterViolations.push(empId);
      }
      
      // 检查月度工时（硬约束）
      for (const month of finalCheckMonthSet) {
        const monthHours = empData.monthly.get(month) || 0;
        const monthStartDate = dayjs(`${month}-01`);
        const monthEndDate = monthStartDate.endOf("month");
        const monthWorkingDays = await this.adapter.calculateWorkingDays(
          monthStartDate.format("YYYY-MM-DD"),
          monthEndDate.format("YYYY-MM-DD")
        );
        const monthStandardHoursForCheck = monthWorkingDays * 8;
        
        if (monthHours < monthStandardHoursForCheck - 0.1) {
          if (!monthlyViolations.has(month)) {
            monthlyViolations.set(month, []);
          }
          monthlyViolations.get(month)!.push(empId);
        }
      }
    }
    
    // 为季度工时不足的员工强制补足
    for (const empId of quarterViolations) {
      const empData = simulatedHoursMap.get(empId);
      if (!empData) continue;
      
      const neededHours = quarterStandardHours - empData.quarter;
      if (neededHours > 0.1) {
        const empSchedules = schedules.get(empId) || [];
        const empStats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
        
        const quarterAdjustments = await this.addHoursToEmployee(
          empId,
          neededHours,
          empSchedules,
          periodStart,
          periodEnd,
          empStats,
          "FINAL_QUARTER_STANDARD_HOURS_ENFORCEMENT",
          peakDays,
          backupRequirements
        );
        
        quarterAdjustments.forEach(adj => {
          adj.priority = 10; // 最高优先级
        });
        
        finalCheckAdjustments.push(...quarterAdjustments);
      }
    }
    
    // 为月度工时不足的员工强制补足
    for (const [month, violatingEmployeeIds] of monthlyViolations) {
      const monthStartDate = dayjs(`${month}-01`);
      const monthEndDate = monthStartDate.endOf("month");
      const monthWorkingDays = await this.adapter.calculateWorkingDays(
        monthStartDate.format("YYYY-MM-DD"),
        monthEndDate.format("YYYY-MM-DD")
      );
      const monthStandardHoursForCheck = monthWorkingDays * 8;
      
      for (const empId of violatingEmployeeIds) {
        const empData = simulatedHoursMap.get(empId);
        if (!empData) continue;
        
        const monthHours = empData.monthly.get(month) || 0;
        const neededHours = monthStandardHoursForCheck - monthHours;
        
        if (neededHours > 0.1) {
          const empSchedules = schedules.get(empId) || [];
          const empStats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
          
          const monthAdjustments = await this.addHoursToEmployee(
            empId,
            neededHours,
            empSchedules,
            monthStartDate.format("YYYY-MM-DD"),
            monthEndDate.format("YYYY-MM-DD"),
            empStats,
            `FINAL_MONTHLY_STANDARD_HOURS_ENFORCEMENT_${month}`,
            peakDays,
            backupRequirements
          );
          
          monthAdjustments.forEach(adj => {
            adj.priority = 10; // 最高优先级
          });
          
          finalCheckAdjustments.push(...monthAdjustments);
        }
      }
    }
    
    // 将最终检查的调整建议添加到列表（最高优先级）
    if (finalCheckAdjustments.length > 0) {
      finalAdjustments.unshift(...finalCheckAdjustments);
      warnings.push(
        `硬约束检查：为 ${new Set(finalCheckAdjustments.map(a => a.employeeId)).size} 名员工生成了标准工时补足调整（季度不足：${quarterViolations.length}人，月度不足：${Array.from(monthlyViolations.values()).flat().length}人次）`
      );
    }
    
    // 统计调整建议的员工覆盖情况
    // 重要：确保所有员工都被处理，包括那些没有排班记录的员工
    const employeesWithAdjustments = new Set(finalAdjustments.map(a => a.employeeId));
    const employeesWithoutAdjustments = employeeIds.filter(id => !employeesWithAdjustments.has(id));
    
    // 对于没有调整建议的员工，检查是否需要补足工时
    if (employeesWithoutAdjustments.length > 0) {
      const employeesNeedingHours: number[] = [];
      
      for (const empId of employeesWithoutAdjustments) {
        const currentHours = employeeHoursMap.get(empId) || 0;
        // 如果员工工时低于月度标准工时的50%，需要补足
        if (currentHours < monthStandardHours * 0.5) {
          employeesNeedingHours.push(empId);
        }
      }
      
      // 为需要补足工时的员工生成调整建议
      if (employeesNeedingHours.length > 0) {
        const missingAdjustments: ScheduleAdjustment[] = [];
        
        for (const empId of employeesNeedingHours) {
          const currentHours = employeeHoursMap.get(empId) || 0;
          const neededHours = monthStandardHours - currentHours;
          
          if (neededHours > 0.1) {
            const empSchedules = schedules.get(empId) || [];
            const empStats = await this.calculateEmployeeStats(empId, empSchedules, periodStart, periodEnd);
            
            const empAdjustments = await this.addHoursToEmployee(
              empId,
              neededHours,
              empSchedules,
              periodStart,
              periodEnd,
              empStats,
              `MISSING_EMPLOYEE_HOURS_COMPLETION`,
              peakDays,
              backupRequirements
            );
            
            // 设置最高优先级，确保硬约束被满足
            empAdjustments.forEach(adj => {
              adj.priority = 10; // 最高优先级，确保达到标准工时
            });
            
            missingAdjustments.push(...empAdjustments);
          }
        }
        
        // 将缺失员工的调整建议添加到最终列表
        finalAdjustments.push(...missingAdjustments);
        
        warnings.push(
          `为 ${employeesNeedingHours.length} 名未参与排班的员工生成了工时补足建议`
        );
      }
      
      // 如果仍有员工没有任何调整建议，记录警告
      const stillWithoutAdjustments = employeeIds.filter(
        id => !finalAdjustments.some(a => a.employeeId === id)
      );
      
      if (stillWithoutAdjustments.length > 0) {
        warnings.push(
          `警告：${stillWithoutAdjustments.length} 名员工未生成任何调整建议：${stillWithoutAdjustments.slice(0, 10).join(', ')}${stillWithoutAdjustments.length > 10 ? '...' : ''}`
        );
      }
    }

    return {
      adjustments: finalAdjustments,
      summary: {
        totalAdjustments: finalAdjustments.length,
        quarterBalance: balanceMetrics.quarterVariance,
        monthlyBalance: balanceMetrics.monthlyVariance,
        weeklyBalance: balanceMetrics.weeklyVariance,
        employeesAffected: new Set(finalAdjustments.map((a) => a.employeeId)).size,
        lockedProtected: finalAdjustments.filter((a) => a.preserveLocked).length,
      },
      warnings,
    };
  }

  /**
   * 为员工添加工时（支持标准班次和高峰日backup）
   */
  private async addHoursToEmployee(
    employeeId: number,
    neededHours: number,
    schedules: ScheduleRecord[],
    periodStart: string,
    periodEnd: string,
    stats: EmployeeWorkloadStats,
    reason: string,
    peakDays?: Map<string, DailyOperationLoad>,
    backupRequirements?: Map<string, BackupRequirement>
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];
    
    // 1. 加载标准班次定义
    const [shiftRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, shift_code, start_time, end_time, nominal_hours, is_cross_day
       FROM shift_definitions 
       WHERE is_active = 1 
         AND shift_code IN ('DAY', 'LONGDAY', 'NIGHT')
       ORDER BY 
         CASE shift_code 
           WHEN 'DAY' THEN 1 
           WHEN 'LONGDAY' THEN 2 
           WHEN 'NIGHT' THEN 3 
         END`
    );
    
    if (shiftRows.length === 0) {
      // 如果没有找到班次定义，使用默认值
      const defaultShiftHours = 8;
      const defaultStartTime = "08:30";
      const defaultEndTime = "17:00";
      
      // 简化处理：直接添加工时，不设置班次信息
      const availableDates: string[] = [];
      let current = dayjs(periodStart);
      const end = dayjs(periodEnd);
      
      while (current.isSameOrBefore(end)) {
        const dateStr = current.format("YYYY-MM-DD");
        const existingSchedule = schedules.find((s) => s.date === dateStr);
        const isLocked = stats.lockedDates.has(dateStr);
        
        if (!isLocked && (!existingSchedule || existingSchedule.planHours < defaultShiftHours)) {
          availableDates.push(dateStr);
        }
        current = current.add(1, "day");
      }
      
      let remainingHours = neededHours;
      for (const date of availableDates) {
        if (remainingHours <= 0) break;
        const existingSchedule = schedules.find((s) => s.date === date);
        const currentHours = existingSchedule?.planHours || 0;
        const hoursToAdd = Math.min(remainingHours, defaultShiftHours - currentHours);
        
        if (hoursToAdd > 0.1) {
          adjustments.push({
            employeeId,
            date,
            action: existingSchedule ? "MODIFY" : "ADD",
            planHours: currentHours + hoursToAdd,
            overtimeHours: 0,
            shiftCode: "DAY",
            startTime: defaultStartTime,
            endTime: defaultEndTime,
            reason: `${reason}: 需要增加${neededHours.toFixed(2)}h，本次增加${hoursToAdd.toFixed(2)}h（标准DAY班次）`,
            priority: 7,
            preserveLocked: this.config.protectLocked,
            isSupplemental: true,
            operationPlanId: 0,
          });
          remainingHours -= hoursToAdd;
        }
      }
      
      return adjustments;
    }
    
    // 优先使用DAY班次（8小时）
    const dayShift = shiftRows.find((r) => String(r.shift_code).toUpperCase() === "DAY");
    const defaultShift = dayShift || shiftRows[0];
    const defaultShiftCode = String(defaultShift.shift_code).toUpperCase();
    const defaultShiftHours = Number(defaultShift.nominal_hours || 8);
    const defaultStartTime = String(defaultShift.start_time).substring(0, 5); // HH:mm
    const defaultEndTime = String(defaultShift.end_time).substring(0, 5); // HH:mm
    
    // 2. 加载日历信息，确保节假日日历覆盖
    await HolidayService.ensureCalendarCoverage(periodStart, periodEnd);
    
    // 3. 找出可以添加班次的日期（考虑高峰日和backup需求）
    const availableDates: Array<{
      date: string;
      isWorkday: boolean;
      existingHours: number;
      existingSchedules: ScheduleRecord[];
      priority: number;
      isPeakDay: boolean;
      backupNeeded: number;
    }> = [];
    
    let current = dayjs(periodStart);
    const end = dayjs(periodEnd);
    
    while (current.isSameOrBefore(end)) {
      const dateStr = current.format("YYYY-MM-DD");
      const existingSchedules = schedules.filter((s) => s.date === dateStr);
      const existingHours = existingSchedules.reduce(
        (sum, s) => sum + s.planHours + s.overtimeHours,
        0
      );
      const isLocked = stats.lockedDates.has(dateStr);
      
      // 检查是否为工作日
      const [calendarRows] = await pool.execute<RowDataPacket[]>(
        `SELECT is_workday FROM calendar_workdays WHERE calendar_date = ? LIMIT 1`,
        [dateStr]
      );
      const isWorkday = calendarRows.length > 0 
        ? Boolean(calendarRows[0].is_workday) 
        : current.day() !== 0 && current.day() !== 6; // 默认排除周末
      
      // 检查是否为高峰日
      const isPeakDay = peakDays?.has(dateStr) || false;
      const backupNeeded = backupRequirements?.get(dateStr)?.requiredBackupPeople || 0;
      
      // 获取员工每日最大工时限制（默认12小时）
      const maxDailyHours = stats.employeeId ? 12 : 12; // TODO: 从员工配置获取
      
      // 如果日期未被锁定，且工作日，且未达每日上限，可以添加
      // 放宽条件：允许在已有班次但未达每日上限的日期添加补充班次
      if (!isLocked && isWorkday && existingHours < maxDailyHours) {
        // 计算优先级：
        // - 高峰日且有backup需求：优先级最高（+200）
        // - 高峰日但无backup需求：优先级较高（+100）
        // - 工作日且无排班：优先级中等（+50）
        // - 工作日但有排班但未达上限：优先级较低（+0）
        let priority = 0;
        if (isPeakDay && backupNeeded > 0) {
          priority = 200 + backupNeeded * 10; // backup需求越多，优先级越高
        } else if (isPeakDay) {
          priority = 100;
        } else if (existingHours === 0) {
          priority = 50;
        }
        
        availableDates.push({
          date: dateStr,
          isWorkday,
          existingHours,
          existingSchedules,
          priority,
          isPeakDay,
          backupNeeded,
        });
      }
      
      current = current.add(1, "day");
    }
    
    // 按优先级排序：高峰日优先
    availableDates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // 优先级高的在前
      }
      return a.existingHours - b.existingHours; // 工时少的在前
    });
    
    // 记录调试信息
    if (availableDates.length === 0 && neededHours > 0) {
      console.warn(
        `[WorkloadBalancer] 员工${employeeId}需要补足${neededHours.toFixed(2)}h，但无可用日期（锁定日期: ${Array.from(stats.lockedDates).length}个，工作日检查: ${periodStart}至${periodEnd}）`
      );
    }
    
    // 4. 添加班次，优先在高峰日添加backup人员
    let remainingHours = neededHours;
    for (const dateInfo of availableDates) {
      if (remainingHours <= 0) {
        break;
      }
      
      const { date, existingHours, isPeakDay, backupNeeded } = dateInfo;
      
      // 计算可以添加的工时
      // 获取员工每日最大工时限制（默认12小时）
      const maxDailyHours = stats.employeeId ? 12 : 12; // TODO: 从员工配置获取
      const maxAddableHours = Math.max(0, maxDailyHours - existingHours);
      const hoursToAdd = Math.min(remainingHours, maxAddableHours);
      
      if (hoursToAdd > 0.1) {
        // 设置班次类型和时间
        let finalShiftCode = defaultShiftCode;
        let finalStartTime = defaultStartTime;
        let finalEndTime = defaultEndTime;
        
        // 如果是高峰日backup，确保使用DAY班次（正常班）
        if (isPeakDay && backupNeeded > 0) {
          finalShiftCode = "DAY"; // Backup人员使用标准DAY班次
          finalStartTime = "08:30"; // DAY班次标准时间
          finalEndTime = "17:00";
        }
        
        adjustments.push({
          employeeId,
          date,
          action: existingHours > 0 ? "MODIFY" : "ADD",
          planHours: existingHours + hoursToAdd,
          overtimeHours: 0,
          shiftCode: finalShiftCode,
          startTime: finalStartTime,
          endTime: finalEndTime,
          reason: isPeakDay && backupNeeded > 0
            ? `${reason}: 高峰日backup人员，需要${backupNeeded}人，本次增加${hoursToAdd.toFixed(2)}h（标准${finalShiftCode}班次）`
            : `${reason}: 需要增加${neededHours.toFixed(2)}h，本次增加${hoursToAdd.toFixed(2)}h（标准${finalShiftCode}班次）`,
          priority: isPeakDay && backupNeeded > 0 ? 9 : 7, // 高峰日backup优先级更高
          preserveLocked: this.config.protectLocked,
          isSupplemental: true,
          isBackup: isPeakDay && backupNeeded > 0,
          operationPlanId: 0,
        });
        
        remainingHours -= hoursToAdd;
      }
    }
    
    // 记录补足结果
    if (remainingHours > 0.1 && neededHours > 0) {
      console.warn(
        `[WorkloadBalancer] 员工${employeeId}工时补足不完整：需要${neededHours.toFixed(2)}h，已补足${(neededHours - remainingHours).toFixed(2)}h，剩余${remainingHours.toFixed(2)}h（可用日期: ${availableDates.length}个）`
      );
    }
    
    return adjustments;
  }

  /**
   * 从员工移除工时
   */
  private async removeHoursFromEmployee(
    employeeId: number,
    excessHours: number,
    schedules: ScheduleRecord[],
    periodStart: string,
    periodEnd: string,
    stats: EmployeeWorkloadStats,
    reason: string
  ): Promise<ScheduleAdjustment[]> {
    const adjustments: ScheduleAdjustment[] = [];

    // 找出可以减少工时的日期（排除锁定日期和生产任务日期）
    const reducibleDates: Array<{ date: string; hours: number; priority: number }> = [];

    schedules.forEach((schedule) => {
      const date = dayjs(schedule.date);
      if (
        date.isSameOrAfter(periodStart) &&
        date.isSameOrBefore(periodEnd)
      ) {
        const isLocked = stats.lockedDates.has(schedule.date);
        const isProduction = stats.productionDates.has(schedule.date);

        // 优先减少非生产任务的排班
        if (!isLocked && !isProduction && schedule.planHours > 0) {
          reducibleDates.push({
            date: schedule.date,
            hours: schedule.planHours,
            priority: isProduction ? 1 : 5, // 生产任务优先级更高
          });
        }
      }
    });

    // 按优先级排序：优先减少非生产任务的排班
    reducibleDates.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return b.hours - a.hours; // 优先减少工时多的
    });

    // 减少工时
    let remainingHours = excessHours;
    for (const item of reducibleDates) {
      if (remainingHours <= 0) {
        break;
      }

      const existingSchedule = schedules.find((s) => s.date === item.date);
      if (!existingSchedule) {
        continue;
      }

      const hoursToRemove = Math.min(remainingHours, item.hours);

      if (hoursToRemove > 0.1) {
        const newHours = item.hours - hoursToRemove;

        adjustments.push({
          employeeId,
          date: item.date,
          action: newHours > 0 ? "MODIFY" : "REMOVE",
          planHours: newHours,
          overtimeHours: existingSchedule.overtimeHours,
          reason: `${reason}: 需要减少${excessHours.toFixed(2)}h，本次减少${hoursToRemove.toFixed(2)}h`,
          priority: 6,
          preserveLocked: this.config.protectLocked,
        });

        remainingHours -= hoursToRemove;
      }
    }

    return adjustments;
  }

  /**
   * 计算均衡度指标
   */
  private async calculateBalanceMetrics(
    employeeIds: number[],
    schedules: Map<number, ScheduleRecord[]>,
    periodStart: string,
    periodEnd: string
  ): Promise<{
    quarterVariance: number;
    monthlyVariance: number;
    weeklyVariance: number;
  }> {
    const statsMap = new Map<number, EmployeeWorkloadStats>();

    for (const employeeId of employeeIds) {
      const employeeSchedules = schedules.get(employeeId) || [];
      const stats = await this.calculateEmployeeStats(
        employeeId,
        employeeSchedules,
        periodStart,
        periodEnd
      );
      statsMap.set(employeeId, stats);
    }

    // 计算季度工时方差
    const quarterHoursArray = Array.from(statsMap.values()).map((s) => s.quarterHours);
    const quarterMean =
      quarterHoursArray.length > 0
        ? quarterHoursArray.reduce((sum, h) => sum + h, 0) / quarterHoursArray.length
        : 0;
    const quarterVariance =
      quarterHoursArray.length > 0
        ? quarterHoursArray.reduce(
            (sum, h) => sum + Math.pow(h - quarterMean, 2),
            0
          ) / quarterHoursArray.length
        : 0;

    // 计算月度工时方差（所有月份的平均）
    const monthlyVarianceArray: number[] = [];
    statsMap.forEach((stats) => {
      const monthHours = Array.from(stats.monthlyHours.values());
      if (monthHours.length > 0) {
        const mean = monthHours.reduce((sum, h) => sum + h, 0) / monthHours.length;
        const variance =
          monthHours.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
          monthHours.length;
        monthlyVarianceArray.push(variance);
      }
    });
    const monthlyVariance =
      monthlyVarianceArray.length > 0
        ? monthlyVarianceArray.reduce((sum, v) => sum + v, 0) /
          monthlyVarianceArray.length
        : 0;

    // 计算周度工时方差（所有周的平均）
    const weeklyVarianceArray: number[] = [];
    statsMap.forEach((stats) => {
      const weekHours = Array.from(stats.weeklyHours.values());
      if (weekHours.length > 0) {
        const mean = weekHours.reduce((sum, h) => sum + h, 0) / weekHours.length;
        const variance =
          weekHours.reduce((sum, h) => sum + Math.pow(h - mean, 2), 0) /
          weekHours.length;
        weeklyVarianceArray.push(variance);
      }
    });
    const weeklyVariance =
      weeklyVarianceArray.length > 0
        ? weeklyVarianceArray.reduce((sum, v) => sum + v, 0) /
          weeklyVarianceArray.length
        : 0;

    return {
      quarterVariance,
      monthlyVariance,
      weeklyVariance,
    };
  }

  /**
   * 加载锁定日期列表
   */
  private async loadLockedDates(
    employeeId: number,
    periodStart: string,
    periodEnd: string
  ): Promise<string[]> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT DISTINCT plan_date
         FROM employee_shift_plans
         WHERE employee_id = ?
           AND plan_date BETWEEN ? AND ?
           AND (plan_state = 'LOCKED' OR IFNULL(is_locked, 0) = 1)
           AND plan_state <> 'VOID'`,
        [employeeId, periodStart, periodEnd]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      return rowsArray.map((row) =>
        dayjs(row.plan_date).format("YYYY-MM-DD")
      );
    } catch (error) {
      console.error(
        `Failed to load locked dates for employee ${employeeId}:`,
        error
      );
      return [];
    }
  }
}
