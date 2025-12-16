/**
 * 数据组装服务
 * 
 * 从数据库组装求解器所需的输入数据 (SolverRequest)
 */

import pool from '../../config/database';
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import {
  SolverRequest,
  OperationDemand,
  EmployeeProfile,
  EmployeeQualification,
  QualificationRequirement,
  PositionQualification,
  CalendarDay,
  ShiftDefinition,
  SharedPreference,
  SharedPreferenceMember,
  LockedOperation,
  LockedShift,
  HistoricalShift,
  EmployeeUnavailability,
  SolverConfig,
  SchedulingWindow,
  DEFAULT_SOLVER_CONFIG,
  PlanCategory,
} from '../../types/schedulingV2';

dayjs.extend(isSameOrBefore);

/**
 * 数据组装选项
 */
export interface AssembleOptions {
  batchIds: number[];
  window: SchedulingWindow;
  config?: Partial<SolverConfig>;
  requestId?: string;
}

/**
 * 数据组装服务
 */
export class DataAssembler {
  /**
   * 组装完整的求解器请求
   */
  static async assemble(options: AssembleOptions): Promise<SolverRequest> {
    const { batchIds, window, config } = options;
    const requestId = options.requestId || `solve-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 合并配置（需要先获取以便确定历史班次天数）
    const mergedConfig: SolverConfig = {
      ...DEFAULT_SOLVER_CONFIG,
      ...config,
    };

    // 并行获取所有数据
    const [
      operationDemands,
      employeeProfiles,
      calendar,
      shiftDefinitions,
      sharedPreferences,
      lockedOperations,
      lockedShifts,
      employeeUnavailability,
      historicalShifts,
    ] = await Promise.all([
      this.fetchOperationDemands(batchIds),
      this.fetchEmployeeProfiles(),
      this.fetchCalendar(window.start_date, window.end_date),
      this.fetchShiftDefinitions(),
      this.fetchSharedPreferences(batchIds),
      this.fetchLockedOperations(batchIds),
      this.fetchLockedShifts(window.start_date, window.end_date),
      this.fetchEmployeeUnavailability(window.start_date, window.end_date),
      this.fetchHistoricalShifts(
        window.start_date,
        Math.max(mergedConfig.max_consecutive_workdays, mergedConfig.night_rest_soft_days)
      ),
    ]);

    return {
      request_id: requestId,
      window,
      operation_demands: operationDemands,
      employee_profiles: employeeProfiles,
      calendar,
      shift_definitions: shiftDefinitions,
      config: mergedConfig,
      shared_preferences: sharedPreferences,
      locked_operations: lockedOperations,
      locked_shifts: lockedShifts,
      employee_unavailability: employeeUnavailability,
      historical_shifts: historicalShifts,
      target_batch_ids: batchIds,
    };
  }

  /**
   * 获取操作需求
   */
  static async fetchOperationDemands(batchIds: number[]): Promise<OperationDemand[]> {
    if (batchIds.length === 0) return [];

    const placeholders = batchIds.map(() => '?').join(',');
    const query = `
      SELECT
        bop.id AS operation_plan_id,
        pbp.id AS batch_id,
        pbp.batch_code,
        bop.operation_id,
        o.operation_code,
        o.operation_name,
        ps.id AS stage_id,
        COALESCE(ps.stage_name, '独立操作') AS stage_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        bop.planned_duration,
        bop.required_people,
        bop.is_locked,
        bop.is_independent,
        sos.window_start_time,
        sos.window_end_time,
        sos.window_start_day_offset,
        sos.window_end_day_offset,
        bop.window_start_datetime AS direct_window_start,
        bop.window_end_datetime AS direct_window_end
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      JOIN operations o ON bop.operation_id = o.id
      LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      LEFT JOIN process_stages ps ON sos.stage_id = ps.id
      WHERE pbp.id IN (${placeholders})
        AND pbp.plan_status = 'ACTIVATED'
      ORDER BY bop.planned_start_datetime ASC
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, batchIds);

    // 获取每个操作的资质需求
    const operationIds = rows.map(r => r.operation_id);
    const qualifications = await this.fetchOperationQualifications(operationIds);

    return rows.map(row => {
      const opQuals = qualifications.get(row.operation_id) || [];

      // 计算操作时间窗口
      // 普通操作：窗口开始 = 计划开始日期 + offset天 + 窗口开始时间
      // 独立操作：直接使用 window_start_datetime 和 window_end_datetime
      let windowStart: string | null = null;
      let windowEnd: string | null = null;

      // 独立操作使用直接存储的窗口时间
      if (row.direct_window_start) {
        windowStart = dayjs(row.direct_window_start).format('YYYY-MM-DDTHH:mm:ss');
      } else if (row.window_start_time && row.window_start_day_offset !== null) {
        const baseDate = dayjs(row.planned_start_datetime).startOf('day');
        const offsetDays = Number(row.window_start_day_offset) || 0;
        const timeStr = String(row.window_start_time).substring(0, 8); // HH:mm:ss
        windowStart = baseDate.add(offsetDays, 'day').format('YYYY-MM-DD') + 'T' + timeStr;
      }

      if (row.direct_window_end) {
        windowEnd = dayjs(row.direct_window_end).format('YYYY-MM-DDTHH:mm:ss');
      } else if (row.window_end_time && row.window_end_day_offset !== null) {
        const baseDate = dayjs(row.planned_end_datetime).startOf('day');
        const offsetDays = Number(row.window_end_day_offset) || 0;
        const timeStr = String(row.window_end_time).substring(0, 8); // HH:mm:ss
        windowEnd = baseDate.add(offsetDays, 'day').format('YYYY-MM-DD') + 'T' + timeStr;
      }

      return {
        operation_plan_id: row.operation_plan_id,
        batch_id: row.batch_id,
        batch_code: row.batch_code,
        operation_id: row.operation_id,
        operation_code: row.operation_code,
        operation_name: row.operation_name,
        stage_id: row.stage_id,
        stage_name: row.stage_name,
        planned_start: dayjs(row.planned_start_datetime).format('YYYY-MM-DDTHH:mm:ss'),
        planned_end: dayjs(row.planned_end_datetime).format('YYYY-MM-DDTHH:mm:ss'),
        planned_duration_minutes: Math.round((Number(row.planned_duration) || 0) * 60), // 小时转分钟
        required_people: Number(row.required_people) || 1,
        position_qualifications: opQuals,
        window_start: windowStart,
        window_end: windowEnd,
        is_locked: Boolean(row.is_locked),
      };
    });
  }

  /**
   * 获取操作的资质需求（按岗位分组）
   * 
   * 返回每个操作的岗位资质需求列表。
   * 每个岗位有独立的资质要求，求解器需要为每个岗位匹配满足要求的不同员工。
   */
  private static async fetchOperationQualifications(
    operationIds: number[]
  ): Promise<Map<number, PositionQualification[]>> {
    if (operationIds.length === 0) return new Map();

    const uniqueIds = [...new Set(operationIds)];
    const placeholders = uniqueIds.map(() => '?').join(',');

    // 获取所有资质需求，包含岗位编号
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT operation_id, position_number, qualification_id, min_level
       FROM operation_qualification_requirements
       WHERE operation_id IN (${placeholders})
         AND is_mandatory = 1
       ORDER BY operation_id, position_number, qualification_id`,
      uniqueIds
    );

    // 按 (operation_id, position_number) 分组
    const result = new Map<number, PositionQualification[]>();
    const positionMap = new Map<string, QualificationRequirement[]>(); // key: "opId-posNum"

    for (const row of rows) {
      const opId = row.operation_id;
      const posNum = row.position_number;
      const key = `${opId}-${posNum}`;

      if (!positionMap.has(key)) {
        positionMap.set(key, []);
      }
      positionMap.get(key)!.push({
        qualification_id: Number(row.qualification_id),
        min_level: Number(row.min_level) || 1,
      });
    }

    // 转换为按操作分组的岗位资质列表
    for (const [key, quals] of positionMap.entries()) {
      const [opIdStr, posNumStr] = key.split('-');
      const opId = Number(opIdStr);
      const posNum = Number(posNumStr);

      if (!result.has(opId)) {
        result.set(opId, []);
      }
      result.get(opId)!.push({
        position_number: posNum,
        qualifications: quals,
      });
    }

    // 按岗位编号排序
    for (const [opId, positions] of result.entries()) {
      positions.sort((a, b) => a.position_number - b.position_number);
    }

    return result;
  }

  /**
   * 获取员工档案
   */
  static async fetchEmployeeProfiles(): Promise<EmployeeProfile[]> {
    const [employees] = await pool.execute<RowDataPacket[]>(`
      SELECT
        e.id AS employee_id,
        e.employee_code,
        e.employee_name,
        e.org_role,
        e.department_id,
        e.primary_team_id AS team_id
      FROM employees e
      WHERE e.employment_status = 'ACTIVE'
      ORDER BY e.employee_code
    `);

    // 获取员工资质 (qualifications 表只有 id 和 qualification_name)
    const [qualifications] = await pool.execute<RowDataPacket[]>(`
      SELECT
        eq.employee_id,
        eq.qualification_id,
        q.qualification_name,
        eq.qualification_level AS level
      FROM employee_qualifications eq
      JOIN qualifications q ON eq.qualification_id = q.id
    `);

    // 按员工分组资质
    const qualMap = new Map<number, EmployeeQualification[]>();
    for (const q of qualifications) {
      if (!qualMap.has(q.employee_id)) {
        qualMap.set(q.employee_id, []);
      }
      qualMap.get(q.employee_id)!.push({
        qualification_id: q.qualification_id,
        qualification_code: `Q${q.qualification_id}`, // 自动生成 code
        qualification_name: q.qualification_name,
        level: q.level,
      });
    }

    return employees.map(e => ({
      employee_id: e.employee_id,
      employee_code: e.employee_code,
      employee_name: e.employee_name,
      org_role: e.org_role || 'FRONTLINE',
      department_id: e.department_id,
      team_id: e.team_id,
      qualifications: qualMap.get(e.employee_id) || [],
    }));
  }

  /**
   * 获取日历信息
   */
  static async fetchCalendar(startDate: string, endDate: string): Promise<CalendarDay[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        cw.calendar_date,
        cw.is_workday,
        cw.holiday_name,
        cw.holiday_type,
        hsc.salary_multiplier
       FROM calendar_workdays cw
       LEFT JOIN holiday_salary_config hsc ON cw.calendar_date = hsc.calendar_date
         AND hsc.year = YEAR(cw.calendar_date)
         AND hsc.is_active = 1
       WHERE cw.calendar_date BETWEEN ? AND ?
       ORDER BY cw.calendar_date`,
      [startDate, endDate]
    );

    // 生成完整的日期范围
    const result: CalendarDay[] = [];
    const start = dayjs(startDate);
    const end = dayjs(endDate);

    // 将数据库数据转为 Map
    const dbData = new Map<string, RowDataPacket>();
    for (const row of rows) {
      const dateKey = dayjs(row.calendar_date).format('YYYY-MM-DD');
      dbData.set(dateKey, row);
    }

    let current = start;
    while (current.isSameOrBefore(end, 'day')) {
      const dateKey = current.format('YYYY-MM-DD');
      const row = dbData.get(dateKey);

      if (row) {
        const isTripleSalary = Number(row.salary_multiplier || 0) >= 3.0;
        result.push({
          date: dateKey,
          is_workday: Boolean(row.is_workday),
          is_triple_salary: isTripleSalary,
          holiday_name: row.holiday_name || null,
          holiday_type: row.holiday_type || null,
          standard_hours: 8,
        });
      } else {
        // 数据库无记录，使用默认值（周一到周五为工作日）
        const dayOfWeek = current.day();
        const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5;
        result.push({
          date: dateKey,
          is_workday: isWorkday,
          is_triple_salary: false,
          holiday_name: null,
          holiday_type: null,
          standard_hours: 8,
        });
      }

      current = current.add(1, 'day');
    }

    return result;
  }

  /**
   * 获取班次定义
   */
  static async fetchShiftDefinitions(): Promise<ShiftDefinition[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        id AS shift_id,
        shift_code,
        shift_name,
        start_time,
        end_time,
        nominal_hours,
        is_cross_day,
        is_night_shift
      FROM shift_definitions
      WHERE is_active = 1
      ORDER BY nominal_hours ASC, shift_code ASC
    `);

    return rows.map((row, index) => ({
      shift_id: row.shift_id,
      shift_code: row.shift_code,
      shift_name: row.shift_name,
      start_time: row.start_time,
      end_time: row.end_time,
      nominal_hours: Number(row.nominal_hours),
      is_cross_day: Boolean(row.is_cross_day),
      is_night_shift: Boolean(row.is_night_shift), // 使用专门的 is_night_shift 列
      priority: index, // 按工时排序的优先级
    }));
  }

  /**
   * 获取共享组配置
   * 
   * 支持两种共享配置方式（按优先级）：
   * 1. batch_share_groups + batch_share_group_members（批次级别，新版，最高优先级）
   * 2. operation_share_group_relations + personnel_share_groups（模板级别）
   */
  static async fetchSharedPreferences(batchIds: number[]): Promise<SharedPreference[]> {
    if (batchIds.length === 0) return [];

    const placeholders = batchIds.map(() => '?').join(',');
    const result: SharedPreference[] = [];

    // ===== 方式1: 从 batch_share_groups + batch_share_group_members 获取（新版，最高优先级） =====
    const [rows0] = await pool.execute<RowDataPacket[]>(
      `SELECT
        bsg.id AS group_id,
        bsg.group_code,
        bsg.group_name,
        bsg.share_mode,
        bsgm.batch_operation_plan_id,
        bop.required_people
       FROM batch_share_groups bsg
       JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
       JOIN batch_operation_plans bop ON bsgm.batch_operation_plan_id = bop.id
       WHERE bsg.batch_plan_id IN (${placeholders})`,
      batchIds
    );

    // 按共享组分组（方式1）
    const groupMap0 = new Map<number, { name: string; mode: string; members: SharedPreferenceMember[] }>();
    for (const row of rows0) {
      const groupId = row.group_id;
      if (!groupMap0.has(groupId)) {
        groupMap0.set(groupId, {
          name: row.group_name || row.group_code || `Group-${groupId}`,
          mode: row.share_mode || 'SAME_TEAM',
          members: [],
        });
      }
      groupMap0.get(groupId)!.members.push({
        operation_plan_id: Number(row.batch_operation_plan_id),
        required_people: Number(row.required_people) || 1,
      });
    }

    for (const [groupId, data] of groupMap0.entries()) {
      if (data.members.length >= 2) {
        result.push({
          share_group_id: `batch-${groupId}`,
          share_group_name: data.name,
          share_mode: data.mode as 'SAME_TEAM' | 'DIFFERENT',
          members: data.members,
        });
      }
    }

    console.log(`[DataAssembler] 从 batch_share_groups 读取到 ${groupMap0.size} 个共享组`);

    // ===== 方式2: 从 personnel_share_group_members 和 personnel_share_groups 获取（新版） =====
    const [rows1] = await pool.execute<RowDataPacket[]>(
      `SELECT
        bop.id AS operation_plan_id,
        bop.required_people,
        psgm.group_id AS share_group_id,
        psg.group_code,
        psg.group_name,
        psg.share_mode
       FROM batch_operation_plans bop
       JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       LEFT JOIN personnel_share_group_members psgm ON sos.id = psgm.schedule_id
       LEFT JOIN personnel_share_groups psg ON psgm.group_id = psg.id
       WHERE pbp.id IN (${placeholders})
         AND psgm.group_id IS NOT NULL`,
      batchIds
    );

    // 按共享组分组（方式2）
    const groupMap1 = new Map<number, { name: string; mode: string; members: SharedPreferenceMember[] }>();
    for (const row of rows1) {
      const groupId = row.share_group_id;
      if (!groupId) continue;

      if (!groupMap1.has(groupId)) {
        groupMap1.set(groupId, {
          name: row.group_name || row.group_code || `Group-${groupId}`,
          mode: row.share_mode || 'SAME_TEAM',
          members: [],
        });
      }
      groupMap1.get(groupId)!.members.push({
        operation_plan_id: Number(row.operation_plan_id),
        required_people: Number(row.required_people) || 1,
      });
    }

    for (const [groupId, data] of groupMap1.entries()) {
      if (data.members.length >= 2) {
        result.push({
          share_group_id: `template-${groupId}`,
          share_group_name: data.name,
          share_mode: data.mode as 'SAME_TEAM' | 'DIFFERENT',
          members: data.members,
        });
      }
    }

    // ===== 方式3: 从 batch_operation_constraints.share_personnel 获取（旧版兼容） =====
    // 已废弃：不再支持旧版 share_personnel 字段，所有数据应迁移至 personnel_share_groups

    console.log(`[DataAssembler] 共享组总数: ${result.length}`);
    return result;
  }

  /**
   * 获取锁定的操作分配
   */
  static async fetchLockedOperations(batchIds: number[]): Promise<LockedOperation[]> {
    if (batchIds.length === 0) return [];

    const placeholders = batchIds.map(() => '?').join(',');
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        bpa.batch_operation_plan_id AS operation_plan_id,
        bpa.employee_id
       FROM batch_personnel_assignments bpa
       JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       WHERE pbp.id IN (${placeholders})
         AND bpa.is_locked = 1
         AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')`,
      batchIds
    );

    // 按操作分组员工
    const opMap = new Map<number, number[]>();
    for (const row of rows) {
      if (!opMap.has(row.operation_plan_id)) {
        opMap.set(row.operation_plan_id, []);
      }
      opMap.get(row.operation_plan_id)!.push(row.employee_id);
    }

    return Array.from(opMap.entries()).map(([opId, empIds]) => ({
      operation_plan_id: opId,
      enforced_employee_ids: empIds,
    }));
  }

  /**
   * 获取锁定的班次
   */
  static async fetchLockedShifts(startDate: string, endDate: string): Promise<LockedShift[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        employee_id,
        plan_date,
        plan_category,
        shift_id
       FROM employee_shift_plans
       WHERE plan_date BETWEEN ? AND ?
         AND is_locked = 1`,
      [startDate, endDate]
    );

    // 映射 plan_category: PRODUCTION/BASE -> WORK, REST -> REST
    const mapCategory = (cat: string): PlanCategory => {
      if (cat === 'REST') return 'REST';
      return 'WORK'; // PRODUCTION, BASE, OVERTIME 都算 WORK
    };

    return rows.map(row => ({
      employee_id: row.employee_id,
      date: dayjs(row.plan_date).format('YYYY-MM-DD'),
      plan_category: mapCategory(row.plan_category),
      shift_id: row.shift_id,
    }));
  }

  /**
   * 获取员工不可用时间段
   * 查询 employee_unavailability 表获取员工请假/调休数据
   */
  static async fetchEmployeeUnavailability(
    startDate: string,
    endDate: string
  ): Promise<EmployeeUnavailability[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        eu.employee_id,
        eu.start_datetime,
        eu.end_datetime,
        eu.reason_code,
        eu.reason_label
       FROM employee_unavailability eu
       WHERE eu.start_datetime <= ? 
         AND eu.end_datetime >= ?
       ORDER BY eu.employee_id, eu.start_datetime`,
      [endDate + ' 23:59:59', startDate + ' 00:00:00']
    );

    return rows.map(row => ({
      employee_id: Number(row.employee_id),
      start_datetime: dayjs(row.start_datetime).format('YYYY-MM-DDTHH:mm:ss'),
      end_datetime: dayjs(row.end_datetime).format('YYYY-MM-DDTHH:mm:ss'),
      reason_code: row.reason_code || null,
      reason_label: row.reason_label || null,
    }));
  }

  /**
   * 获取历史班次（用于连续工作约束和夜班休息约束的边界检查）
   * 
   * 获取求解区间开始日期之前 N 天的班次数据
   * N = max(max_consecutive_workdays, night_rest_soft_days)
   * 
   * @param windowStartDate 求解区间开始日期
   * @param lookbackDays 向前查看的天数
   */
  static async fetchHistoricalShifts(
    windowStartDate: string,
    lookbackDays: number = 6
  ): Promise<HistoricalShift[]> {
    // 计算历史班次查询的日期范围
    // 例如：求解区间从 2月1日开始，lookbackDays=6，则查询 1月26日-1月31日
    const historyEndDate = dayjs(windowStartDate).subtract(1, 'day').format('YYYY-MM-DD');
    const historyStartDate = dayjs(windowStartDate).subtract(lookbackDays, 'day').format('YYYY-MM-DD');

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
        esp.employee_id,
        esp.plan_date,
        esp.plan_category,
        COALESCE(sd.is_night_shift, 0) AS is_night_shift
       FROM employee_shift_plans esp
       LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
       WHERE esp.plan_date BETWEEN ? AND ?
       ORDER BY esp.employee_id, esp.plan_date`,
      [historyStartDate, historyEndDate]
    );

    // PRODUCTION 和 BASE 算作上班，其他（REST, OVERTIME, LEAVE）不算上班
    const isWorkCategory = (cat: string): boolean => {
      return cat === 'PRODUCTION' || cat === 'BASE';
    };

    return rows.map(row => ({
      employee_id: row.employee_id,
      date: dayjs(row.plan_date).format('YYYY-MM-DD'),
      is_work: isWorkCategory(row.plan_category),
      is_night: Boolean(row.is_night_shift),
    }));
  }
}
