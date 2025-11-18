import dayjs from "dayjs";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../../config/database";

/**
 * 员工适应性评分结果
 */
export interface EmployeeSuitabilityScore {
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  suitabilityScore: number; // 0-1之间的适应性评分
  confidence: number; // 置信度 0-1
  factors: {
    skillMatch: number; // 技能匹配度
    historicalPerformance: number; // 历史表现
    fatigueLevel: number; // 疲劳度（越低越好）
    preferenceMatch: number; // 偏好匹配度
    workTimeSystemCompatibility?: number; // 工时制兼容性（新增）
  };
  explanation: string[]; // 评分解释
}

/**
 * 员工适应性预测请求
 */
export interface SuitabilityPredictionRequest {
  employeeId: number;
  operationId: number;
  operationPlanId: number;
  operationName: string;
  requiredQualifications: Array<{ qualificationId: number; minLevel: number }>;
  startTime: string;
  endTime: string;
  shiftCode?: string;
  currentSchedule?: Array<{
    date: string;
    hours: number;
    shiftCode?: string;
  }>;
}

/**
 * 员工适应性预测模型
 * 
 * 预测员工对特定操作和班次的适应性
 * 考虑技能匹配、历史表现、疲劳度、偏好等因素
 */
export class EmployeeSuitabilityPredictor {
  /**
   * 预测员工对特定操作的适应性
   */
  async predictSuitability(
    request: SuitabilityPredictionRequest
  ): Promise<EmployeeSuitabilityScore> {
    // 1. 加载员工数据
    const employeeData = await this.loadEmployeeData(request.employeeId);
    if (!employeeData) {
      throw new Error(`Employee ${request.employeeId} not found`);
    }

    // 2. 计算技能匹配度
    const skillMatch = this.calculateSkillMatch(
      employeeData.qualifications,
      request.requiredQualifications
    );

    // 3. 计算历史表现
    const historicalPerformance = await this.calculateHistoricalPerformance(
      request.employeeId,
      request.operationId
    );

    // 4. 计算疲劳度
    const fatigueLevel = this.calculateFatigueLevel(
      request.employeeId,
      request.currentSchedule || []
    );

    // 5. 计算偏好匹配度
    const preferenceMatch = await this.calculatePreferenceMatch(
      request.employeeId,
      request.shiftCode
    );

    // 6. 计算工时制兼容性（新增）
    const workTimeSystemCompatibility = await this.calculateWorkTimeSystemCompatibility(
      request.employeeId,
      request.startTime,
      request.currentSchedule || []
    );

    // 7. 综合评分
    const suitabilityScore = this.combineScores({
      skillMatch,
      historicalPerformance,
      fatigueLevel,
      preferenceMatch,
      workTimeSystemCompatibility,
    });

    // 8. 计算置信度
    const confidence = this.calculateConfidence({
      skillMatch,
      historicalPerformance,
      preferenceMatch,
    });

    // 9. 生成解释
    const explanation = this.generateExplanation({
      skillMatch,
      historicalPerformance,
      fatigueLevel,
      preferenceMatch,
      workTimeSystemCompatibility,
    });

    return {
      employeeId: request.employeeId,
      employeeCode: employeeData.employeeCode,
      employeeName: employeeData.employeeName,
      suitabilityScore,
      confidence,
      factors: {
        skillMatch,
        historicalPerformance,
        fatigueLevel,
        preferenceMatch,
        workTimeSystemCompatibility,
      },
      explanation,
    };
  }

  /**
   * 加载员工数据
   */
  private async loadEmployeeData(employeeId: number): Promise<{
    employeeCode: string;
    employeeName: string;
    qualifications: Array<{ qualificationId: number; qualificationLevel: number }>;
  } | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          e.employee_code AS employeeCode,
          e.employee_name AS employeeName
         FROM employees e
         WHERE e.id = ? AND e.employment_status = 'ACTIVE'`,
        [employeeId]
      );

      if (rows.length === 0) {
        return null;
      }

      // 加载资质
      const [qualRows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          qualification_id AS qualificationId,
          qualification_level AS qualificationLevel
         FROM employee_qualifications
         WHERE employee_id = ?`,
        [employeeId]
      );

      return {
        employeeCode: String(rows[0].employeeCode),
        employeeName: String(rows[0].employeeName),
        qualifications: qualRows.map((row) => ({
          qualificationId: Number(row.qualificationId),
          qualificationLevel: Number(row.qualificationLevel || 0),
        })),
      };
    } catch (error) {
      console.error("Failed to load employee data:", error);
      return null;
    }
  }

  /**
   * 计算技能匹配度
   */
  private calculateSkillMatch(
    employeeQualifications: Array<{ qualificationId: number; qualificationLevel: number }>,
    requiredQualifications: Array<{ qualificationId: number; minLevel: number }>
  ): number {
    if (requiredQualifications.length === 0) {
      return 1.0; // 无要求，完全匹配
    }

    let totalScore = 0;
    let matchCount = 0;

    for (const requirement of requiredQualifications) {
      const employeeQual = employeeQualifications.find(
        (q) => q.qualificationId === requirement.qualificationId
      );

      if (!employeeQual) {
        return 0; // 缺少必需资质，完全不合格
      }

      if (employeeQual.qualificationLevel >= requirement.minLevel) {
        // 满足要求，计算超额奖励
        const excessBonus = Math.min(
          0.2,
          (employeeQual.qualificationLevel - requirement.minLevel) * 0.1
        );
        totalScore += 1.0 + excessBonus;
        matchCount++;
      } else {
        return 0; // 资质等级不足
      }
    }

    return matchCount > 0 ? totalScore / requiredQualifications.length : 0;
  }

  /**
   * 计算历史表现
   */
  private async calculateHistoricalPerformance(
    employeeId: number,
    operationId: number
  ): Promise<number> {
    try {
      // 查询员工对该操作的历史分配次数
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT COUNT(*) as count
         FROM batch_personnel_assignments bpa
         JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
         WHERE bpa.employee_id = ? 
           AND bop.operation_id = ?
           AND bpa.assigned_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
        [employeeId, operationId]
      );

      const count = Number(rows[0]?.count || 0);

      // 有历史记录表示有经验，给予加分
      // 经验越多，评分越高（但有上限）
      return Math.min(1.0, 0.5 + count * 0.05);
    } catch (error) {
      console.error("Failed to calculate historical performance:", error);
      return 0.5; // 默认中等评分
    }
  }

  /**
   * 计算疲劳度
   */
  private calculateFatigueLevel(
    employeeId: number,
    currentSchedule: Array<{ date: string; hours: number; shiftCode?: string }>
  ): number {
    if (currentSchedule.length === 0) {
      return 0; // 无当前排班，无疲劳
    }

    // 计算最近7天的工时
    const recent7Days = currentSchedule
      .filter((s) => {
        const scheduleDate = dayjs(s.date);
        const daysDiff = dayjs().diff(scheduleDate, "day");
        return daysDiff >= 0 && daysDiff < 7;
      })
      .reduce((sum, s) => sum + s.hours, 0);

    // 计算连续工作天数
    const sortedSchedule = [...currentSchedule]
      .map((s) => dayjs(s.date))
      .sort((a, b) => a.diff(b));

    let consecutiveDays = 0;
    let lastDate: dayjs.Dayjs | null = null;

    for (const date of sortedSchedule) {
      if (lastDate === null) {
        consecutiveDays = 1;
        lastDate = date;
      } else if (date.diff(lastDate, "day") === 1) {
        consecutiveDays++;
        lastDate = date;
      } else {
        consecutiveDays = 1;
        lastDate = date;
      }
    }

    // 疲劳度计算：工时越高、连续天数越多，疲劳度越高
    const weeklyHoursPenalty = Math.min(1.0, recent7Days / 60); // 60小时为满负荷
    const consecutiveDaysPenalty = Math.min(1.0, consecutiveDays / 7); // 7天为上限

    return (weeklyHoursPenalty * 0.6 + consecutiveDaysPenalty * 0.4);
  }

  /**
   * 计算偏好匹配度
   */
  private async calculatePreferenceMatch(
    employeeId: number,
    shiftCode?: string
  ): Promise<number> {
    if (!shiftCode) {
      return 0.5; // 无班次信息，中等评分
    }

    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT 
          esp.preference_score AS preferenceScore,
          esp.is_available AS isAvailable
         FROM employee_shift_preferences esp
         JOIN shift_definitions sd ON esp.shift_type_id = sd.id
         WHERE esp.employee_id = ? 
           AND sd.shift_code = ?
           AND esp.is_available = TRUE`,
        [employeeId, shiftCode.toUpperCase()]
      );

      if (rows.length === 0) {
        return 0.5; // 无偏好记录，中等评分
      }

      const score = Number(rows[0].preferenceScore || 0);
      // 将 -10 到 10 的评分转换为 0 到 1
      return (score + 10) / 20;
    } catch (error) {
      console.error("Failed to calculate preference match:", error);
      return 0.5;
    }
  }

  /**
   * 计算工时制兼容性（新增）
   * 注意：此功能需要数据库迁移添加work_time_system_type等字段后才完全生效
   */
  private async calculateWorkTimeSystemCompatibility(
    employeeId: number,
    operationStartTime: string,
    currentSchedule: Array<{ date: string; hours: number }>
  ): Promise<number> {
    try {
      // 查询员工的工时制类型
      // 注意：字段可能不存在（需要数据库迁移），使用动态SQL处理
      let query = `SELECT 
        quarter_standard_hours,
        month_standard_hours,
        max_daily_hours,
        max_consecutive_days
       FROM employee_shift_limits
       WHERE employee_id = ?
         AND effective_from <= CURDATE()
         AND (effective_to IS NULL OR effective_to >= CURDATE())
       ORDER BY effective_from DESC
       LIMIT 1`;

      // 尝试查询综合工时制字段（如果存在）
      try {
        const [testRows] = await pool.execute<RowDataPacket[]>(
          `SELECT COLUMN_NAME 
           FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'employee_shift_limits' 
             AND COLUMN_NAME IN ('work_time_system_type', 'comprehensive_period', 'comprehensive_target_hours')`
        );
        
        const testRowsArray = Array.isArray(testRows) ? testRows : [];
        const hasWorkTimeSystemFields = testRowsArray.length > 0;
        
        if (hasWorkTimeSystemFields) {
          query = `SELECT 
            work_time_system_type,
            comprehensive_period,
            comprehensive_target_hours,
            quarter_standard_hours,
            month_standard_hours
           FROM employee_shift_limits
           WHERE employee_id = ?
             AND effective_from <= CURDATE()
             AND (effective_to IS NULL OR effective_to >= CURDATE())
           ORDER BY effective_from DESC
           LIMIT 1`;
        }
      } catch {
        // 字段不存在，使用基础查询
      }

      const [rows] = await pool.execute<RowDataPacket[]>(query, [employeeId]);

      if (rows.length === 0) {
        return 1.0; // 无特殊工时制配置，默认兼容
      }

      // 检查是否有综合工时制字段
      const workTimeSystem = (rows[0] as any).work_time_system_type;
      const period = (rows[0] as any).comprehensive_period;
      const targetHours = Number((rows[0] as any).comprehensive_target_hours || 0);

      // 如果字段不存在或为空，使用标准工时制逻辑
      if (!workTimeSystem || workTimeSystem === 'STANDARD') {
        // 使用季度标准工时作为参考（如果有）
        const quarterHours = Number(rows[0].quarter_standard_hours || 0);
        if (quarterHours > 0) {
          // 简单检查：如果当前计划工时接近季度上限，稍微降低兼容性
          const currentQuarterHours = currentSchedule.reduce((sum, s) => sum + s.hours, 0);
          const utilizationRate = currentQuarterHours / quarterHours;
          if (utilizationRate >= 0.9) {
            return 0.8; // 轻微降低
          }
        }
        return 1.0;
      }

      // 如果是综合工时制，需要检查周期累计工时
      if (workTimeSystem === 'COMPREHENSIVE' && period && targetHours > 0) {
        const operationDate = dayjs(operationStartTime).format("YYYY-MM-DD");
        
        // 计算当前周期的累计工时
        const periodStart = this.getPeriodStart(operationDate, period);
        const periodEnd = this.getPeriodEnd(operationDate, period);
        
        const periodHours = currentSchedule
          .filter((s) => {
            const scheduleDate = dayjs(s.date);
            return scheduleDate.isSameOrAfter(periodStart) && scheduleDate.isSameOrBefore(periodEnd);
          })
          .reduce((sum, s) => sum + s.hours, 0);

        // 如果周期工时接近上限，降低兼容性
        const utilizationRate = periodHours / targetHours;
        if (utilizationRate >= 0.9) {
          return 0.3; // 接近上限，兼容性低
        } else if (utilizationRate >= 0.7) {
          return 0.6; // 较高使用率，兼容性中等
        } else {
          return 1.0; // 还有余量，兼容性高
        }
      }

      // 不定时工作制，默认兼容
      return 1.0;
    } catch (error) {
      console.error("Failed to calculate work time system compatibility:", error);
      return 1.0; // 出错时默认兼容
    }
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
  private combineScores(factors: {
    skillMatch: number;
    historicalPerformance: number;
    fatigueLevel: number;
    preferenceMatch: number;
    workTimeSystemCompatibility?: number;
  }): number {
    // 权重配置
    const weights = {
      skillMatch: 0.35, // 技能匹配最重要
      historicalPerformance: 0.20,
      fatigueLevel: 0.20, // 疲劳度（越低越好，所以用1-疲劳度）
      preferenceMatch: 0.15,
      workTimeSystemCompatibility: 0.10, // 工时制兼容性
    };

    // 疲劳度是负向指标，需要反转
    const fatigueScore = 1 - factors.fatigueLevel;
    
    // 工时制兼容性（如果没有则默认为1.0）
    const wtCompatibility = factors.workTimeSystemCompatibility ?? 1.0;

    let totalScore = 0;
    totalScore += weights.skillMatch * factors.skillMatch;
    totalScore += weights.historicalPerformance * factors.historicalPerformance;
    totalScore += weights.fatigueLevel * fatigueScore;
    totalScore += weights.preferenceMatch * factors.preferenceMatch;
    totalScore += weights.workTimeSystemCompatibility * wtCompatibility;

    return Math.max(0, Math.min(1, totalScore));
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(factors: {
    skillMatch: number;
    historicalPerformance: number;
    preferenceMatch: number;
  }): number {
    // 置信度基于数据的完整性
    // 有历史记录、有偏好数据时置信度更高
    let confidence = 0.5; // 基础置信度

    if (factors.skillMatch > 0) {
      confidence += 0.2; // 有技能匹配数据
    }

    if (factors.historicalPerformance > 0.5) {
      confidence += 0.2; // 有历史表现数据
    }

    if (factors.preferenceMatch !== 0.5) {
      confidence += 0.1; // 有明确的偏好数据
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * 生成解释
   */
  private generateExplanation(factors: {
    skillMatch: number;
    historicalPerformance: number;
    fatigueLevel: number;
    preferenceMatch: number;
    workTimeSystemCompatibility?: number;
  }): string[] {
    const explanations: string[] = [];

    if (factors.skillMatch >= 0.8) {
      explanations.push("技能匹配度高");
    } else if (factors.skillMatch >= 0.6) {
      explanations.push("技能匹配度中等");
    } else if (factors.skillMatch > 0) {
      explanations.push("技能匹配度较低");
    } else {
      explanations.push("技能不匹配");
    }

    if (factors.historicalPerformance >= 0.7) {
      explanations.push("有丰富的历史经验");
    } else if (factors.historicalPerformance >= 0.5) {
      explanations.push("有一定历史经验");
    } else {
      explanations.push("历史经验较少");
    }

    if (factors.fatigueLevel <= 0.3) {
      explanations.push("疲劳度较低");
    } else if (factors.fatigueLevel <= 0.6) {
      explanations.push("疲劳度中等");
    } else {
      explanations.push("疲劳度较高");
    }

    if (factors.preferenceMatch >= 0.7) {
      explanations.push("符合员工偏好");
    } else if (factors.preferenceMatch <= 0.3) {
      explanations.push("不符合员工偏好");
    }

    if (factors.workTimeSystemCompatibility !== undefined) {
      if (factors.workTimeSystemCompatibility >= 0.8) {
        explanations.push("工时制兼容性良好");
      } else if (factors.workTimeSystemCompatibility <= 0.5) {
        explanations.push("工时制兼容性较差（周期工时接近上限）");
      }
    }

    return explanations;
  }
}

export default EmployeeSuitabilityPredictor;

