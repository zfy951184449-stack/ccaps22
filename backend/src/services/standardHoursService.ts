import { CalendarService } from './calendarService';
import dayjs from 'dayjs';

/**
 * 标准工时计算服务
 * 负责计算各种周期的标准工时
 */
export class StandardHoursService {
  private calendarService: CalendarService;
  private monthlyTolerance: number = 16; // 月度工时容差，默认16小时

  constructor(calendarService: CalendarService) {
    this.calendarService = calendarService;
  }

  /**
   * 设置月度工时容差
   */
  setMonthlyTolerance(tolerance: number): void {
    this.monthlyTolerance = Math.max(0, tolerance);
  }

  /**
   * 获取月度工时容差
   */
  getMonthlyTolerance(): number {
    return this.monthlyTolerance;
  }

  /**
   * 计算季度标准工时
   * 公式：季度工作日数量 × 8h
   */
  async calculateQuarterStandardHours(quarterStart: string, quarterEnd: string): Promise<number> {
    const workdays = await this.calendarService.getWorkdayCount(quarterStart, quarterEnd);
    return workdays * 8;
  }

  /**
   * 计算月度标准工时
   * 公式：月度工作日数量 × 8h
   */
  async calculateMonthStandardHours(monthStart: string, monthEnd: string): Promise<number> {
    const workdays = await this.calendarService.getWorkdayCount(monthStart, monthEnd);
    return workdays * 8;
  }

  /**
   * 获取指定年季度的标准工时
   */
  async getQuarterStandardHours(year: number, quarter: number): Promise<number> {
    return this.calendarService.getQuarterStandardHours(year, quarter);
  }

  /**
   * 获取指定年月的标准工时
   */
  async getMonthStandardHours(year: number, month: number): Promise<number> {
    return this.calendarService.getMonthStandardHours(year, month);
  }

  /**
   * 计算月度工时约束范围
   */
  async getMonthHoursConstraints(year: number, month: number): Promise<HoursConstraint> {
    const standardHours = await this.getMonthStandardHours(year, month);

    return {
      standardHours,
      minHours: standardHours - this.monthlyTolerance,
      maxHours: standardHours + this.monthlyTolerance,
      tolerance: this.monthlyTolerance
    };
  }

  /**
   * 计算季度工时约束范围
   */
  async getQuarterHoursConstraints(year: number, quarter: number): Promise<QuarterHoursConstraint> {
    const standardHours = await this.getQuarterStandardHours(year, quarter);

    return {
      standardHours,
      minHours: standardHours, // 季度下限为标准工时
      maxHours: null, // 季度无上限要求
    };
  }

  /**
   * 验证月度工时是否符合约束
   */
  async validateMonthHours(employeeId: number, month: string, actualHours: number): Promise<ValidationResult> {
    const monthStart = dayjs(month + '-01').startOf('month');
    const monthEnd = dayjs(month + '-01').endOf('month');

    const constraint = await this.getMonthHoursConstraints(
      monthStart.year(),
      monthStart.month() + 1
    );

    const isValid = actualHours >= constraint.minHours && actualHours <= constraint.maxHours;
    const deviation = actualHours - constraint.standardHours;

    return {
      isValid,
      actualHours,
      standardHours: constraint.standardHours,
      deviation,
      minHours: constraint.minHours,
      maxHours: constraint.maxHours,
      message: isValid
        ? `合规：${actualHours}h 在标准工时 ${constraint.standardHours}h ±${constraint.tolerance}h范围内`
        : `违规：${actualHours}h 超出标准工时 ${constraint.standardHours}h ±${constraint.tolerance}h范围`
    };
  }

  /**
   * 验证季度工时是否符合约束
   */
  async validateQuarterHours(employeeId: number, quarter: string, actualHours: number): Promise<QuarterValidationResult> {
    // 解析季度字符串，如 "2025Q4"
    const match = quarter.match(/^(\d{4})Q(\d)$/);
    if (!match) {
      throw new Error(`无效的季度格式: ${quarter}`);
    }

    const year = parseInt(match[1]);
    const quarterNum = parseInt(match[2]);

    const constraint = await this.getQuarterHoursConstraints(year, quarterNum);

    const isValid = actualHours >= constraint.minHours;
    const deviation = actualHours - constraint.standardHours;

    return {
      isValid,
      actualHours,
      standardHours: constraint.standardHours,
      deviation,
      minHours: constraint.minHours,
      message: isValid
        ? `合规：${actualHours}h ≥ 季度标准工时 ${constraint.standardHours}h`
        : `违规：${actualHours}h < 季度标准工时 ${constraint.standardHours}h`
    };
  }

  /**
   * 批量计算员工周期工时统计
   */
  async calculateEmployeeHoursStatistics(
    employeeId: number,
    assignments: EmployeeAssignment[]
  ): Promise<EmployeeHoursStatistics> {
    const monthlyStats: Map<string, MonthlyHours> = new Map();
    let quarterlyHours = 0;
    let quarterlyShopHours = 0;

    // 按月分组统计
    for (const assignment of assignments) {
      const month = assignment.date.substring(0, 7); // YYYY-MM

      if (!monthlyStats.has(month)) {
        monthlyStats.set(month, {
          month,
          scheduledHours: 0,
          shopHours: 0,
          days: 0,
          validation: {
            isValid: true,
            actualHours: 0,
            standardHours: 0,
            deviation: 0,
            minHours: 0,
            maxHours: 0,
            message: ''
          }
        });
      }

      const monthStat = monthlyStats.get(month)!;

      // 累加排班工时（班次折算工时）
      if (assignment.scheduledHours) {
        monthStat.scheduledHours += assignment.scheduledHours;
        quarterlyHours += assignment.scheduledHours;
      }

      // 累加车间工时（操作时长）
      if (assignment.shopHours) {
        monthStat.shopHours += assignment.shopHours;
        quarterlyShopHours += assignment.shopHours;
      }

      monthStat.days += 1;
    }

    // 转换为数组并验证约束
    const monthlyHours = await Promise.all(
      Array.from(monthlyStats.values()).map(async (stat) => {
        const validation = await this.validateMonthHours(employeeId, stat.month, stat.scheduledHours);
        return {
          ...stat,
          validation
        };
      })
    );

    // 季度验证（假设为2025Q4）
    const quarterValidation = await this.validateQuarterHours(employeeId, '2025Q4', quarterlyHours);

    return {
      employeeId,
      quarterlyHours,
      quarterlyShopHours,
      quarterlyValidation: quarterValidation,
      monthlyHours
    };
  }

  /**
   * 获取完整的工作日历统计
   */
  async getCalendarStatistics(startDate: string, endDate: string): Promise<CalendarStatistics> {
    const calendarDays = await this.calendarService.getCalendarDays(startDate, endDate);
    const totalDays = calendarDays.length;
    const workdays = calendarDays.filter(d => d.isWorkday).length;
    const holidays = calendarDays.filter(d => d.isHoliday).length;
    const standardHours = workdays * 8;

    return {
      period: { startDate, endDate },
      totalDays,
      workdays,
      holidays,
      standardHours,
      calendarDays
    };
  }
}

/**
 * 工时约束
 */
export interface HoursConstraint {
  standardHours: number;
  minHours: number;
  maxHours: number;
  tolerance: number;
}

/**
 * 季度工时约束
 */
export interface QuarterHoursConstraint {
  standardHours: number;
  minHours: number;
  maxHours: number | null; // 季度无上限
}

/**
 * 验证结果
 */
export interface ValidationResult {
  isValid: boolean;
  actualHours: number;
  standardHours: number;
  deviation: number;
  minHours: number;
  maxHours: number;
  message: string;
}

/**
 * 季度验证结果
 */
export interface QuarterValidationResult {
  isValid: boolean;
  actualHours: number;
  standardHours: number;
  deviation: number;
  minHours: number;
  message: string;
}

/**
 * 员工分配记录
 */
export interface EmployeeAssignment {
  date: string;
  scheduledHours: number; // 排班工时
  shopHours: number;      // 车间工时
  shiftId?: string;
  operations?: number[];  // 操作ID列表
}

/**
 * 月度工时统计
 */
export interface MonthlyHours {
  month: string;
  scheduledHours: number;
  shopHours: number;
  days: number;
  validation: ValidationResult;
}

/**
 * 员工工时统计
 */
export interface EmployeeHoursStatistics {
  employeeId: number;
  quarterlyHours: number;
  quarterlyShopHours: number;
  quarterlyValidation: QuarterValidationResult;
  monthlyHours: MonthlyHours[];
}

/**
 * 日历统计
 */
export interface CalendarStatistics {
  period: {
    startDate: string;
    endDate: string;
  };
  totalDays: number;
  workdays: number;
  holidays: number;
  standardHours: number;
  calendarDays: Array<{
    date: string;
    isWorkday: boolean;
    isHoliday: boolean;
    holidayName: string | null;
  }>;
}
