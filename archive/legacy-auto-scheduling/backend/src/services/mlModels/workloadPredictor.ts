import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../../config/database";

dayjs.extend(quarterOfYear);

/**
 * 工作负载预测结果
 */
export interface WorkloadPrediction {
  date: string;
  predictedWorkload: number; // 预测的工作负载（人员数量或工时）
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  features: {
    dayOfWeek: number;
    month: number;
    quarter: number;
    isHoliday: boolean;
    isWeekend: boolean;
  };
}

/**
 * 工作负载预测请求
 */
export interface WorkloadPredictionRequest {
  startDate: string;
  endDate: string;
  employeeIds?: number[];
  includeHistoricalData?: boolean;
}

/**
 * 工作负载预测模型
 * 
 * 当前实现：基于时间序列分析的统计预测模型
 * 后续可扩展为LSTM深度学习模型
 */
export class WorkloadPredictor {
  /**
   * 预测指定时间段的工作负载
   */
  async predictWorkload(
    request: WorkloadPredictionRequest
  ): Promise<WorkloadPrediction[]> {
    const startDate = dayjs(request.startDate);
    const endDate = dayjs(request.endDate);

    if (!startDate.isValid() || !endDate.isValid()) {
      throw new Error("Invalid date format");
    }

    if (startDate.isAfter(endDate)) {
      throw new Error("Start date must be before end date");
    }

    // 1. 加载历史数据（30天窗口）
    const historicalData = await this.loadHistoricalWorkload(
      startDate.subtract(30, "day").format("YYYY-MM-DD"),
      startDate.subtract(1, "day").format("YYYY-MM-DD"),
      request.employeeIds
    );

    // 2. 预加载节假日信息（用于预测期间）
    const holidayDates = await this.loadHolidayDates(
      request.startDate,
      request.endDate
    );

    // 3. 提取特征
    const features = this.extractFeatures(historicalData);

    // 4. 生成预测
    const predictions: WorkloadPrediction[] = [];
    let currentDate = startDate;

    while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, "day")) {
      const dateStr = currentDate.format("YYYY-MM-DD");
      const isHoliday = holidayDates.has(dateStr);
      const prediction = this.predictSingleDay(
        dateStr,
        features,
        historicalData,
        isHoliday
      );
      predictions.push(prediction);
      currentDate = currentDate.add(1, "day");
    }

    return predictions;
  }
  
  /**
   * 加载节假日日期集合
   */
  private async loadHolidayDates(
    startDate: string,
    endDate: string
  ): Promise<Set<string>> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT calendar_date FROM calendar_workdays 
         WHERE calendar_date BETWEEN ? AND ? 
         AND holiday_type = 'LEGAL_HOLIDAY' 
         AND is_working_day = FALSE`,
        [startDate, endDate]
      );
      return new Set(rows.map((row) => dayjs(row.calendar_date).format("YYYY-MM-DD")));
    } catch (error) {
      console.error("Failed to load holiday dates:", error);
      return new Set();
    }
  }

  /**
   * 加载历史工作负载数据
   */
  private async loadHistoricalWorkload(
    startDate: string,
    endDate: string,
    employeeIds?: number[]
  ): Promise<HistoricalWorkloadRecord[]> {
    let query = `
      SELECT 
        esp.plan_date AS date,
        COUNT(DISTINCT esp.employee_id) AS active_employees,
        COUNT(*) AS total_schedules,
        SUM(esp.plan_hours) AS total_hours,
        SUM(esp.overtime_hours) AS total_overtime_hours,
        AVG(esp.plan_hours) AS avg_hours,
        DAYOFWEEK(esp.plan_date) AS day_of_week,
        MONTH(esp.plan_date) AS month,
        QUARTER(esp.plan_date) AS quarter,
        CASE WHEN cw.calendar_date IS NOT NULL THEN 1 ELSE 0 END AS is_holiday
      FROM employee_shift_plans esp
      LEFT JOIN calendar_workdays cw ON esp.plan_date = cw.calendar_date 
        AND cw.holiday_type = 'LEGAL_HOLIDAY' 
        AND cw.is_working_day = FALSE
      WHERE esp.plan_state <> 'VOID'
        AND esp.plan_date BETWEEN ? AND ?
    `;

    const params: any[] = [startDate, endDate];

    if (employeeIds && employeeIds.length > 0) {
      const placeholders = employeeIds.map(() => "?").join(",");
      query += ` AND esp.employee_id IN (${placeholders})`;
      params.push(...employeeIds);
    }

    query += `
      GROUP BY esp.plan_date
      ORDER BY esp.plan_date
    `;

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(query, params);
      return rows.map((row) => ({
        date: row.date ? dayjs(row.date).format("YYYY-MM-DD") : "",
        activeEmployees: Number(row.active_employees || 0),
        totalSchedules: Number(row.total_schedules || 0),
        totalHours: Number(row.total_hours || 0),
        totalOvertimeHours: Number(row.total_overtime_hours || 0),
        avgHours: Number(row.avg_hours || 0),
        dayOfWeek: Number(row.day_of_week || 1),
        month: Number(row.month || 1),
        quarter: Number(row.quarter || 1),
        isHoliday: Boolean(row.is_holiday),
      }));
    } catch (error) {
      console.error("Failed to load historical workload:", error);
      return [];
    }
  }

  /**
   * 提取特征（用于模型训练和预测）
   */
  private extractFeatures(
    historicalData: HistoricalWorkloadRecord[]
  ): WorkloadFeatures {
    if (historicalData.length === 0) {
      return {
        weeklyPattern: {},
        monthlyPattern: {},
        seasonalPattern: {},
        holidayEffect: 0,
        trend: 0,
      };
    }

    // 计算周度模式（星期几的平均负载）
    const weeklyPattern: Record<number, number> = {};
    const weeklyCounts: Record<number, number> = {};
    for (let i = 1; i <= 7; i++) {
      weeklyPattern[i] = 0;
      weeklyCounts[i] = 0;
    }

    historicalData.forEach((record) => {
      const dow = record.dayOfWeek;
      weeklyPattern[dow] += record.totalHours;
      weeklyCounts[dow]++;
    });

    Object.keys(weeklyPattern).forEach((dow) => {
      const count = weeklyCounts[Number(dow)];
      if (count > 0) {
        weeklyPattern[Number(dow)] = weeklyPattern[Number(dow)] / count;
      }
    });

    // 计算月度模式
    const monthlyPattern: Record<number, number> = {};
    const monthlyCounts: Record<number, number> = {};
    for (let i = 1; i <= 12; i++) {
      monthlyPattern[i] = 0;
      monthlyCounts[i] = 0;
    }

    historicalData.forEach((record) => {
      const month = record.month;
      monthlyPattern[month] += record.totalHours;
      monthlyCounts[month]++;
    });

    Object.keys(monthlyPattern).forEach((month) => {
      const count = monthlyCounts[Number(month)];
      if (count > 0) {
        monthlyPattern[Number(month)] = monthlyPattern[Number(month)] / count;
      }
    });

    // 计算季节性模式（季度）
    const seasonalPattern: Record<number, number> = {};
    const seasonalCounts: Record<number, number> = {};
    for (let i = 1; i <= 4; i++) {
      seasonalPattern[i] = 0;
      seasonalCounts[i] = 0;
    }

    historicalData.forEach((record) => {
      const quarter = record.quarter;
      seasonalPattern[quarter] += record.totalHours;
      seasonalCounts[quarter]++;
    });

    Object.keys(seasonalPattern).forEach((quarter) => {
      const count = seasonalCounts[Number(quarter)];
      if (count > 0) {
        seasonalPattern[Number(quarter)] =
          seasonalPattern[Number(quarter)] / count;
      }
    });

    // 计算节假日效应
    const holidayRecords = historicalData.filter((r) => r.isHoliday);
    const workdayRecords = historicalData.filter((r) => !r.isHoliday);

    const holidayAvg =
      holidayRecords.length > 0
        ? holidayRecords.reduce((sum, r) => sum + r.totalHours, 0) /
          holidayRecords.length
        : 0;
    const workdayAvg =
      workdayRecords.length > 0
        ? workdayRecords.reduce((sum, r) => sum + r.totalHours, 0) /
          workdayRecords.length
        : 0;

    const holidayEffect =
      workdayAvg > 0 ? (holidayAvg - workdayAvg) / workdayAvg : 0;

    // 计算趋势（最近7天 vs 前7天）
    if (historicalData.length >= 14) {
      const recent7 = historicalData.slice(-7);
      const previous7 = historicalData.slice(-14, -7);

      const recentAvg =
        recent7.reduce((sum, r) => sum + r.totalHours, 0) / recent7.length;
      const previousAvg =
        previous7.reduce((sum, r) => sum + r.totalHours, 0) / previous7.length;

      const trend = previousAvg > 0 ? (recentAvg - previousAvg) / previousAvg : 0;
      
      return {
        weeklyPattern,
        monthlyPattern,
        seasonalPattern,
        holidayEffect,
        trend,
      };
    }

    return {
      weeklyPattern,
      monthlyPattern,
      seasonalPattern,
      holidayEffect,
      trend: 0,
    };
  }

  /**
   * 预测单日工作负载
   */
  private predictSingleDay(
    dateStr: string,
    features: WorkloadFeatures,
    historicalData: HistoricalWorkloadRecord[],
    isHoliday: boolean = false
  ): WorkloadPrediction {
    const date = dayjs(dateStr);
    const dayOfWeek = date.day() === 0 ? 7 : date.day(); // 转换为1-7
    const month = date.month() + 1;
    const quarter = date.quarter();

    // 检查是否为周末
    const isWeekend = dayOfWeek === 6 || dayOfWeek === 7;

    // 基础预测：使用历史平均值
    const avgWorkload =
      historicalData.length > 0
        ? historicalData.reduce((sum, r) => sum + r.totalHours, 0) /
          historicalData.length
        : 0;

    // 应用周度模式调整
    const weeklyAdjustment =
      features.weeklyPattern[dayOfWeek] || avgWorkload;
    const weeklyFactor =
      avgWorkload > 0 ? weeklyAdjustment / avgWorkload : 1;

    // 应用月度模式调整
    const monthlyAdjustment =
      features.monthlyPattern[month] || avgWorkload;
    const monthlyFactor =
      avgWorkload > 0 ? monthlyAdjustment / avgWorkload : 1;

    // 应用季节性模式调整
    const seasonalAdjustment =
      features.seasonalPattern[quarter] || avgWorkload;
    const seasonalFactor =
      avgWorkload > 0 ? seasonalAdjustment / avgWorkload : 1;

    // 应用节假日效应
    const holidayFactor = isHoliday ? 1 + features.holidayEffect : 1;

    // 应用趋势
    const trendFactor = 1 + features.trend * 0.5; // 趋势影响减半

    // 组合预测
    let predictedWorkload = avgWorkload;
    predictedWorkload *= weeklyFactor;
    predictedWorkload *= monthlyFactor;
    predictedWorkload *= seasonalFactor;
    predictedWorkload *= holidayFactor;
    predictedWorkload *= trendFactor;

    // 计算置信区间（基于历史数据的方差）
    const variance = this.calculateVariance(historicalData);
    const stdDev = Math.sqrt(variance);
    const confidenceLevel = 0.95; // 95%置信区间
    const zScore = 1.96; // 95%置信区间的Z值

    const margin = zScore * stdDev;
    const confidenceInterval = {
      lower: Math.max(0, predictedWorkload - margin),
      upper: predictedWorkload + margin,
    };

    return {
      date: dateStr,
      predictedWorkload: Math.max(0, Math.round(predictedWorkload * 100) / 100),
      confidenceInterval: {
        lower: Math.max(0, Math.round(confidenceInterval.lower * 100) / 100),
        upper: Math.round(confidenceInterval.upper * 100) / 100,
      },
      features: {
        dayOfWeek,
        month,
        quarter,
        isHoliday,
        isWeekend,
      },
    };
  }

  /**
   * 计算历史数据的方差
   */
  private calculateVariance(
    historicalData: HistoricalWorkloadRecord[]
  ): number {
    if (historicalData.length === 0) {
      return 0;
    }

    const values = historicalData.map((r) => r.totalHours);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      values.length;

    return variance;
  }
}

/**
 * 历史工作负载记录
 */
interface HistoricalWorkloadRecord {
  date: string;
  activeEmployees: number;
  totalSchedules: number;
  totalHours: number;
  totalOvertimeHours: number;
  avgHours: number;
  dayOfWeek: number;
  month: number;
  quarter: number;
  isHoliday: boolean;
}

/**
 * 工作负载特征
 */
interface WorkloadFeatures {
  weeklyPattern: Record<number, number>; // 星期几 -> 平均负载
  monthlyPattern: Record<number, number>; // 月份 -> 平均负载
  seasonalPattern: Record<number, number>; // 季度 -> 平均负载
  holidayEffect: number; // 节假日效应（相对于工作日的变化比例）
  trend: number; // 趋势（最近7天相对于前7天的变化比例）
}

export default WorkloadPredictor;

