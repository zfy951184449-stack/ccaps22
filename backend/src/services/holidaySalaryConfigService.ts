import dayjs from "dayjs";
import quarterOfYear from "dayjs/plugin/quarterOfYear";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import type { RowDataPacket } from "mysql2/promise";
import pool from "../config/database";
import HolidayService from "./holidayService";

dayjs.extend(quarterOfYear);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

/**
 * 节假日工资类型
 */
export type HolidaySalaryType = "TRIPLE_SALARY" | "DOUBLE_SALARY_OR_REST";

/**
 * 节假日工资配置服务
 * 负责从数据库读取和管理3倍工资配置
 */
export class HolidaySalaryConfigService {
  private static cache: Map<string, boolean> = new Map(); // date -> isTriple
  private static cacheExpiry: Map<number, number> = new Map(); // year -> timestamp

  /**
   * 检查指定日期是否为3倍工资的法定节假日
   */
  static async isTripleSalaryHoliday(date: string): Promise<boolean> {
    const dateObj = dayjs(date);
    const year = dateObj.year();
    const dateStr = dateObj.format("YYYY-MM-DD");

    // 检查缓存
    if (this.cache.has(dateStr)) {
      return this.cache.get(dateStr)!;
    }

    // 从数据库查询
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT calendar_date, salary_multiplier
         FROM holiday_salary_config
         WHERE year = ?
           AND calendar_date = ?
           AND is_active = 1
         LIMIT 1`,
        [year, dateStr]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      if (rowsArray.length > 0) {
        const multiplier = Number(rowsArray[0].salary_multiplier || 0);
        const isTriple = multiplier >= 3.0;
        
        // 更新缓存
        this.cache.set(dateStr, isTriple);
        
        return isTriple;
      }

      // 如果数据库中没有配置，尝试使用规则引擎自动识别
      const isTriple = await this.applyRulesForDate(date);
      
      // 缓存结果
      this.cache.set(dateStr, isTriple);
      
      return isTriple;
    } catch (error) {
      console.error(`Failed to check triple salary holiday for date ${date}:`, error);
      // 如果表不存在，尝试使用规则引擎
      try {
        return await this.applyRulesForDate(date);
      } catch (ruleError) {
        console.error(`Failed to apply rules for date ${date}:`, ruleError);
        return false;
      }
    }
  }

  /**
   * 使用规则引擎识别日期是否为3倍工资
   */
  private static async applyRulesForDate(date: string): Promise<boolean> {
    const dateObj = dayjs(date);
    const year = dateObj.year();
    const month = dateObj.month() + 1; // dayjs month is 0-based
    const day = dateObj.date();

    try {
      // 查询所有启用的规则
      const [rules] = await pool.execute<RowDataPacket[]>(
        `SELECT rule_name, holiday_name, rule_type, rule_config, salary_multiplier
         FROM holiday_salary_rules
         WHERE is_active = 1
         ORDER BY priority ASC`
      );

      const rulesArray = Array.isArray(rules) ? rules : [];
      
      for (const rule of rulesArray) {
        const multiplier = Number(rule.salary_multiplier || 0);
        if (multiplier < 3.0) {
          continue; // 只处理3倍工资规则
        }

        const ruleConfig = typeof rule.rule_config === 'string' 
          ? JSON.parse(rule.rule_config) 
          : rule.rule_config;

        let matches = false;

        switch (rule.rule_type) {
          case 'FIXED_DATE':
            // 固定日期规则：如 {month: 1, day: 1} 或 {month: 10, days: [1, 2, 3]}
            if (ruleConfig.month === month) {
              if (ruleConfig.days && Array.isArray(ruleConfig.days)) {
                matches = ruleConfig.days.includes(day);
              } else if (ruleConfig.day === day) {
                matches = true;
              }
            }
            break;

          case 'RELATIVE_DATE':
            // 相对日期规则：如春节前4天
            if (ruleConfig.holiday_name === '春节') {
              // 查找春节日期（农历正月初一）
              const springFestivalDate = await this.findSpringFestivalDate(year);
              if (springFestivalDate) {
                const daysDiff = dayjs(date).diff(dayjs(springFestivalDate), 'day');
                if (ruleConfig.days && Array.isArray(ruleConfig.days)) {
                  matches = ruleConfig.days.includes(daysDiff);
                }
              }
            }
            break;

          case 'LUNAR_DATE':
            // 农历日期规则：需要转换为公历日期
            // 这里简化处理：从calendar_workdays表中查找对应的节假日
            // 查找所有包含该节假日名称的日期（如"中秋节"可能单独出现，也可能与"国庆节、中秋节"一起出现）
            const holidayName = rule.holiday_name;
            const [holidayRows] = await pool.execute<RowDataPacket[]>(
              `SELECT calendar_date
               FROM calendar_workdays
               WHERE YEAR(calendar_date) = ?
                 AND (holiday_name = ? OR holiday_name LIKE ?)
                 AND holiday_type = 'LEGAL_HOLIDAY'
                 AND is_workday = 0`,
              [year, holidayName, `%${holidayName}%`]
            );
            
            const holidayRowsArray = Array.isArray(holidayRows) ? holidayRows : [];
            // 检查当前日期是否在匹配的日期列表中
            for (const row of holidayRowsArray) {
              const holidayDate = dayjs(row.calendar_date).format("YYYY-MM-DD");
              if (holidayDate === date) {
                matches = true;
                break;
              }
            }
            break;
        }

        if (matches) {
          // 自动保存到数据库
          await this.saveConfigToDatabase(year, date, rule.holiday_name, multiplier, 'RULE_ENGINE', rule.rule_name);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error(`Failed to apply rules for date ${date}:`, error);
      return false;
    }
  }

  /**
   * 保存配置到数据库
   */
  private static async saveConfigToDatabase(
    year: number,
    date: string,
    holidayName: string,
    multiplier: number,
    source: string,
    ruleName: string
  ): Promise<void> {
    try {
      await pool.execute(
        `INSERT INTO holiday_salary_config 
         (year, calendar_date, holiday_name, salary_multiplier, config_source, config_rule, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           holiday_name = VALUES(holiday_name),
           salary_multiplier = VALUES(salary_multiplier),
           config_source = VALUES(config_source),
           config_rule = VALUES(config_rule),
           updated_at = CURRENT_TIMESTAMP`,
        [year, date, holidayName, multiplier, source, ruleName]
      );
    } catch (error) {
      console.error(`Failed to save holiday salary config for ${date}:`, error);
    }
  }

  /**
   * 查找春节日期（农历正月初一对应的公历日期）
   */
  private static async findSpringFestivalDate(year: number): Promise<string | null> {
    try {
      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT calendar_date
         FROM calendar_workdays
         WHERE YEAR(calendar_date) = ?
           AND holiday_name LIKE '%春节%'
           AND holiday_type = 'LEGAL_HOLIDAY'
           AND is_workday = 0
         ORDER BY calendar_date ASC
         LIMIT 1`,
        [year]
      );

      const rowsArray = Array.isArray(rows) ? rows : [];
      if (rowsArray.length > 0) {
        return dayjs(rowsArray[0].calendar_date).format("YYYY-MM-DD");
      }
      return null;
    } catch (error) {
      console.error(`Failed to find spring festival date for year ${year}:`, error);
      return null;
    }
  }

  /**
   * 获取周期内的3倍工资法定节假日列表
   */
  static async getTripleSalaryHolidaysInPeriod(
    periodStart: string | dayjs.Dayjs,
    periodEnd: string | dayjs.Dayjs
  ): Promise<string[]> {
    const start = typeof periodStart === "string" ? dayjs(periodStart) : periodStart;
    const end = typeof periodEnd === "string" ? dayjs(periodEnd) : periodEnd;

    const holidays: string[] = [];
    let current = start;

    // 遍历周期内的每一天，检查是否是3倍工资的法定节假日
    while (current.isSameOrBefore(end)) {
      const dateStr = current.format("YYYY-MM-DD");
      if (await this.isTripleSalaryHoliday(dateStr)) {
        holidays.push(dateStr);
      }
      current = current.add(1, "day");
    }

    return holidays;
  }

  /**
   * 清除缓存（用于数据更新后）
   */
  static clearCache(year?: number): void {
    if (year) {
      // 清除指定年份的缓存
      const yearStr = year.toString();
      const keysToDelete: string[] = [];
      this.cache.forEach((_, key) => {
        if (key.startsWith(yearStr)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.cache.delete(key));
      this.cacheExpiry.delete(year);
    } else {
      this.cache.clear();
      this.cacheExpiry.clear();
    }
  }
}

/**
 * 检查指定日期是否为3倍工资的法定节假日
 * 
 * 根据《全国年节及纪念日放假办法》：
 * - 真正的法定节假日：3倍工资
 * - 调休的休息日：2倍工资或补休
 */
async function isTripleSalaryHoliday(date: string): Promise<boolean> {
  return await HolidaySalaryConfigService.isTripleSalaryHoliday(date);
}

