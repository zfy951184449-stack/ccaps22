import { Request, Response } from 'express';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(quarterOfYear);

import pool from '../config/database';
import { PersonnelSchedule } from '../models/types';

export const getPersonnelSchedules = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, employee_id } = req.query;

    let query = `
      SELECT ps.*, st.shift_name, st.start_time, st.end_time, st.work_hours,
             e.employee_name, e.employee_code
      FROM personnel_schedules ps
      JOIN shift_types st ON ps.shift_type_id = st.id
      JOIN employees e ON ps.employee_id = e.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (start_date) {
      query += ' AND ps.schedule_date >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND ps.schedule_date <= ?';
      params.push(end_date);
    }

    if (employee_id) {
      query += ' AND ps.employee_id = ?';
      params.push(employee_id);
    }

    query += ' ORDER BY ps.schedule_date, ps.employee_id';

    const [rows] = await pool.execute(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error getting personnel schedules:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getShiftCalendarOverview = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, employee_id, department_id, team_id, leader_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date 和 end_date 为必填参数' });
    }

    const params: any[] = [start_date, end_date];
    const filters: string[] = [];

    if (employee_id) {
      filters.push('esp.employee_id = ?');
      params.push(employee_id);
    }

    // Refactored Filter Logic using unit_id
    if (department_id) {
      // Find employees where unit_id matches dept or parent matches dept
      // Assuming 2-level hierarchy: Dept -> Team
      filters.push('(u_unit.id = ? OR u_unit.parent_id = ?)');
      params.push(department_id, department_id);
    }

    if (team_id) {
      filters.push('e.unit_id = ?');
      params.push(team_id);
    }

    if (leader_id) {
      filters.push('EXISTS (SELECT 1 FROM employee_reporting_relations WHERE subordinate_id = e.id AND leader_id = ?)');
      params.push(leader_id);
    }

    const employeeFilter = filters.length > 0 ? ' AND ' + filters.join(' AND ') : '';

    // Refactored Query: Joins organization_units instead of teams
    const [rows] = await pool.execute(
      `SELECT
         esp.id AS plan_id,
         esp.employee_id,
         e.employee_code,
         e.employee_name,
         e.primary_role_id,
         er.role_code AS primary_role_code,
         er.role_name AS primary_role_name,
         e.unit_id AS primary_team_id, -- Return UnitID as TeamID for frontend compat
         u_dept.id AS department_id,    -- Return Dept UnitID as DeptID from hierarchy
         u_unit.unit_name AS team_name, -- Return Unit Name as Team Name
         (SELECT leader_id FROM employee_reporting_relations WHERE subordinate_id = e.id LIMIT 1) AS direct_leader_id,
         esp.plan_date,
         esp.plan_category,
         esp.plan_state,
         esp.plan_hours,
         esp.overtime_hours,
         esp.is_generated,
         esp.is_locked,
         esp.lock_reason,
         esp.locked_at,
         esp.locked_by,
         COALESCE(ssc.special_coverage_count, 0) AS special_coverage_count,
         ssc.special_coverage_codes,
         sd.shift_code,
         sd.shift_name,
         sd.start_time AS shift_start_time,
         sd.end_time AS shift_end_time,
         sd.nominal_hours AS shift_nominal_hours,
         sd.is_cross_day AS shift_is_cross_day,
         bop.id AS operation_plan_id,
         bop.planned_start_datetime AS operation_start,
         bop.planned_end_datetime AS operation_end,
         bop.required_people AS operation_required_people,
         o.operation_code,
         o.operation_name,
         pbp.id AS batch_plan_id,
         pbp.batch_code,
         pbp.batch_name,
         ps.stage_code,
         ps.stage_name
       FROM employee_shift_plans esp
       JOIN employees e ON esp.employee_id = e.id
       LEFT JOIN employee_roles er ON er.id = e.primary_role_id
       LEFT JOIN organization_units u_unit ON u_unit.id = e.unit_id -- Join Unit (Team)
       LEFT JOIN organization_units u_dept ON u_dept.id = u_unit.parent_id -- Join Parent (Dept)
       LEFT JOIN (
         SELECT
           ssoa.shift_plan_id,
           COUNT(*) AS special_coverage_count,
           GROUP_CONCAT(DISTINCT ssw.window_code ORDER BY ssw.window_code SEPARATOR ',') AS special_coverage_codes
         FROM special_shift_occurrence_assignments ssoa
         JOIN special_shift_occurrences sso ON sso.id = ssoa.occurrence_id
         JOIN special_shift_windows ssw ON ssw.id = sso.window_id
         WHERE ssoa.assignment_status <> 'CANCELLED'
         GROUP BY ssoa.shift_plan_id
       ) ssc ON ssc.shift_plan_id = esp.id
       LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
       LEFT JOIN batch_personnel_assignments bpa ON esp.id = bpa.shift_plan_id
       LEFT JOIN batch_operation_plans bop ON bpa.batch_operation_plan_id = bop.id
       LEFT JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
       LEFT JOIN operations o ON bop.operation_id = o.id
       LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
       LEFT JOIN process_stages ps ON sos.stage_id = ps.id
       WHERE esp.plan_date BETWEEN ? AND ?
       ${employeeFilter}
       ORDER BY esp.plan_date, e.employee_code, FIELD(esp.plan_category, 'REST', 'BASE', 'PRODUCTION', 'OVERTIME'), esp.id`
      , params
    );

    res.json(rows);
  } catch (error) {
    console.error('Error getting shift calendar overview:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEmployeeWorkloadMetricsRange = async (req: Request, res: Response) => {
  try {
    const referenceDateInput = (req.query.reference_date as string) || dayjs().format('YYYY-MM-DD');
    const referenceDate = dayjs(referenceDateInput);

    if (!referenceDate.isValid()) {
      return res.status(400).json({ error: '无效的 reference_date 参数' });
    }

    const employeeIdsParam = (req.query.employee_ids as string) || '';
    const employeeIds = employeeIdsParam
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (!employeeIds.length) {
      return res.json([]);
    }

    const quarterStart = referenceDate.startOf('quarter').format('YYYY-MM-DD');
    const quarterEnd = referenceDate.endOf('quarter').format('YYYY-MM-DD');
    const monthStart = referenceDate.startOf('month').format('YYYY-MM-DD');
    const monthEnd = referenceDate.endOf('month').format('YYYY-MM-DD');

    // 折算工时：plan_hours 已经包含了加班费率的折算，不需要再加 overtime_hours
    const totalHoursExpression =
      "CASE WHEN UPPER(esp.plan_category) <> 'REST' THEN COALESCE(esp.plan_hours, 0) ELSE 0 END";
    const shopHoursExpression =
      "CASE WHEN UPPER(esp.plan_category) IN ('PRODUCTION', 'OPERATION', 'OVERTIME') THEN COALESCE(esp.plan_hours, 0) ELSE 0 END";

    const placeholders = employeeIds.map(() => '?').join(',');

    const [rows] = await pool.execute<any[]>(
      `
        SELECT
          esp.employee_id AS employeeId,
          SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN ${totalHoursExpression} ELSE 0 END) AS quarterHours,
          SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN ${shopHoursExpression} ELSE 0 END) AS quarterShopHours,
          SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN ${totalHoursExpression} ELSE 0 END) AS monthHours,
          SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN ${shopHoursExpression} ELSE 0 END) AS monthShopHours
        FROM employee_shift_plans esp
        WHERE esp.plan_date BETWEEN ? AND ?
          AND COALESCE(UPPER(esp.plan_state), '') <> 'VOID'
          AND esp.employee_id IN (${placeholders})
        GROUP BY esp.employee_id
      `,
      [
        quarterStart,
        quarterEnd,
        quarterStart,
        quarterEnd,
        monthStart,
        monthEnd,
        monthStart,
        monthEnd,
        quarterStart,
        quarterEnd,
        ...employeeIds,
      ],
    );

    const metricsMap = new Map<number, {
      quarterHours: number;
      quarterShopHours: number;
      monthHours: number;
      monthShopHours: number;
    }>();

    rows.forEach((row) => {
      const employeeId = Number(row.employeeId);
      metricsMap.set(employeeId, {
        quarterHours: Number(row.quarterHours ?? 0),
        quarterShopHours: Number(row.quarterShopHours ?? 0),
        monthHours: Number(row.monthHours ?? 0),
        monthShopHours: Number(row.monthShopHours ?? 0),
      });
    });

    const [workdayRows] = await pool.execute<any[]>(
      `
        SELECT
          SUM(CASE WHEN calendar_date BETWEEN ? AND ? AND is_workday = 1 THEN 1 ELSE 0 END) AS quarterWorkdays,
          SUM(CASE WHEN calendar_date BETWEEN ? AND ? AND is_workday = 1 THEN 1 ELSE 0 END) AS monthWorkdays
        FROM calendar_workdays
      `,
      [quarterStart, quarterEnd, monthStart, monthEnd],
    );

    const quarterWorkdays = Number(workdayRows?.[0]?.quarterWorkdays ?? 0);
    const monthWorkdays = Number(workdayRows?.[0]?.monthWorkdays ?? 0);
    const fallbackQuarterStandard = quarterWorkdays * 8;
    const fallbackMonthStandard = monthWorkdays * 8;

    const [limitRows] = await pool.execute<any[]>(
      `
        SELECT employee_id, quarter_standard_hours, month_standard_hours, effective_from
        FROM employee_shift_limits
        WHERE employee_id IN (${placeholders})
          AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY employee_id, effective_from DESC
      `,
      [...employeeIds, referenceDate.format('YYYY-MM-DD'), referenceDate.format('YYYY-MM-DD')],
    );

    const limitMap = new Map<number, { quarter?: number | null; month?: number | null }>();
    limitRows.forEach((row) => {
      const employeeId = Number(row.employee_id);
      if (limitMap.has(employeeId)) {
        return;
      }
      limitMap.set(employeeId, {
        quarter: row.quarter_standard_hours !== null ? Number(row.quarter_standard_hours) : null,
        month: row.month_standard_hours !== null ? Number(row.month_standard_hours) : null,
      });
    });

    const results = employeeIds.map((employeeId) => {
      const actual = metricsMap.get(employeeId) || {
        quarterHours: 0,
        quarterShopHours: 0,
        monthHours: 0,
        monthShopHours: 0,
      };
      const limit = limitMap.get(employeeId);
      const quarterStandard =
        limit?.quarter !== null && limit?.quarter !== undefined && limit.quarter > 0
          ? Number(limit.quarter)
          : fallbackQuarterStandard;
      const monthStandard =
        limit?.month !== null && limit?.month !== undefined && limit.month > 0
          ? Number(limit.month)
          : fallbackMonthStandard;

      return {
        employeeId,
        quarterHours: actual.quarterHours,
        quarterShopHours: actual.quarterShopHours,
        monthHours: actual.monthHours,
        monthShopHours: actual.monthShopHours,
        quarterStandardHours: quarterStandard,
        monthStandardHours: monthStandard,
        quarterDeviation: actual.quarterHours - quarterStandard,
        monthDeviation: actual.monthHours - monthStandard,
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error computing employee workload metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPersonnelScheduleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT ps.*, st.shift_name, st.start_time, st.end_time, st.work_hours,
              e.employee_name, e.employee_code
       FROM personnel_schedules ps
       JOIN shift_types st ON ps.shift_type_id = st.id
       JOIN employees e ON ps.employee_id = e.id
       WHERE ps.id = ?`,
      [id]
    );

    const schedules = rows as any[];

    if (schedules.length === 0) {
      return res.status(404).json({ error: 'Personnel schedule not found' });
    }

    res.json(schedules[0]);
  } catch (error) {
    console.error('Error getting personnel schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const createPersonnelSchedule = async (req: Request, res: Response) => {
  try {
    const schedule: PersonnelSchedule = req.body;

    // 检查是否存在冲突
    const conflictCheck = await checkScheduleConflicts(schedule);
    if (conflictCheck.length > 0) {
      return res.status(400).json({
        error: 'Schedule conflicts detected',
        conflicts: conflictCheck
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO personnel_schedules 
       (employee_id, schedule_date, shift_type_id, status, is_overtime, overtime_hours, notes, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schedule.employee_id,
        schedule.schedule_date,
        schedule.shift_type_id,
        schedule.status || 'SCHEDULED',
        schedule.is_overtime || false,
        schedule.overtime_hours || 0,
        schedule.notes,
        schedule.created_by
      ]
    );

    const insertResult = result as any;
    const newSchedule = { ...schedule, id: insertResult.insertId };

    res.status(201).json(newSchedule);
  } catch (error) {
    console.error('Error creating personnel schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updatePersonnelSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schedule: Partial<PersonnelSchedule> = req.body;

    const [result] = await pool.execute(
      `UPDATE personnel_schedules SET 
       shift_type_id = COALESCE(?, shift_type_id),
       actual_start_time = COALESCE(?, actual_start_time),
       actual_end_time = COALESCE(?, actual_end_time),
       actual_work_hours = COALESCE(?, actual_work_hours),
       status = COALESCE(?, status),
       is_overtime = COALESCE(?, is_overtime),
       overtime_hours = COALESCE(?, overtime_hours),
       notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        schedule.shift_type_id,
        schedule.actual_start_time,
        schedule.actual_end_time,
        schedule.actual_work_hours,
        schedule.status,
        schedule.is_overtime,
        schedule.overtime_hours,
        schedule.notes,
        id
      ]
    );

    const updateResult = result as any;

    if (updateResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Personnel schedule not found' });
    }

    res.json({ message: 'Personnel schedule updated successfully' });
  } catch (error) {
    console.error('Error updating personnel schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePersonnelSchedule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute(
      'DELETE FROM personnel_schedules WHERE id = ?',
      [id]
    );

    const deleteResult = result as any;

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ error: 'Personnel schedule not found' });
    }

    res.json({ message: 'Personnel schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting personnel schedule:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 检测排班冲突的辅助函数
async function checkScheduleConflicts(schedule: PersonnelSchedule): Promise<any[]> {
  const conflicts = [];

  try {
    // 检查同一员工同一天是否已有排班
    const [existingSchedules] = await pool.execute(
      'SELECT * FROM personnel_schedules WHERE employee_id = ? AND schedule_date = ? AND status != "CANCELLED"',
      [schedule.employee_id, schedule.schedule_date]
    );

    if ((existingSchedules as any[]).length > 0) {
      conflicts.push({
        type: 'DOUBLE_BOOKING',
        description: '员工在同一天已有排班安排'
      });
    }

    // 检查夜班后休息规则
    const previousDate = new Date(schedule.schedule_date);
    previousDate.setDate(previousDate.getDate() - 1);

    const [previousSchedules] = await pool.execute(
      `SELECT ps.*, st.is_night_shift 
       FROM personnel_schedules ps
       JOIN shift_types st ON ps.shift_type_id = st.id
       WHERE ps.employee_id = ? AND ps.schedule_date = ? AND ps.status != 'CANCELLED'`,
      [schedule.employee_id, previousDate.toISOString().split('T')[0]]
    );

    if ((previousSchedules as any[]).length > 0 && (previousSchedules as any[])[0].is_night_shift) {
      conflicts.push({
        type: 'NIGHT_SHIFT_REST_VIOLATION',
        description: '夜班后需要休息，不能安排班次'
      });
    }

  } catch (error) {
    console.error('Error checking schedule conflicts:', error);
  }

  return conflicts;
}

export const getAvailableEmployees = async (req: Request, res: Response) => {
  try {
    const { date, shift_type_id } = req.query;

    const [rows] = await pool.execute(
      `SELECT e.*, esp.preference_score, esp.is_available
       FROM employees e
       LEFT JOIN employee_shift_preferences esp ON e.id = esp.employee_id AND esp.shift_type_id = ?
       WHERE e.id NOT IN (
         SELECT ps.employee_id 
         FROM personnel_schedules ps 
         WHERE ps.schedule_date = ? AND ps.status != 'CANCELLED'
       )
       ORDER BY esp.preference_score DESC NULLS LAST, e.employee_name`,
      [shift_type_id, date]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error getting available employees:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEmployeeWorkloadMetrics = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, employee_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date 和 end_date 为必填参数' });
    }

    const params: any[] = [start_date, end_date];
    let employeeFilter = '';
    if (employee_id) {
      employeeFilter = ' AND esp.employee_id = ?';
      params.push(employee_id);
    }

    const [rows] = await pool.execute(
      `SELECT
         esp.employee_id,
         e.employee_code,
         e.employee_name,
         COUNT(DISTINCT esp.plan_date) AS work_days,
         SUM(esp.plan_hours) AS total_hours,
         SUM(esp.overtime_hours) AS total_overtime_hours,
         AVG(esp.plan_hours) AS avg_daily_hours
       FROM employee_shift_plans esp
       JOIN employees e ON esp.employee_id = e.id
       WHERE esp.plan_date BETWEEN ? AND ?
       ${employeeFilter}
       GROUP BY esp.employee_id, e.employee_code, e.employee_name
       ORDER BY total_hours DESC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error('Error getting employee workload metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getEmployeeMetrics = async (req: Request, res: Response) => {
  console.log('=== getEmployeeMetrics called ===');
  try {
    const { reference_date, employee_ids } = req.query;
    console.log('Params:', { reference_date, employee_ids });

    // 测试数据库连接
    console.log('Testing database connection...');
    const [testRows] = await pool.execute('SELECT 1 as test');
    console.log('Database connection OK, test result:', testRows);

    if (!reference_date) {
      return res.status(400).json({ error: 'reference_date 为必填参数' });
    }

    const refDate = dayjs(reference_date as string);
    const quarterStart = refDate.startOf('quarter').format('YYYY-MM-DD');
    const quarterEnd = refDate.endOf('quarter').format('YYYY-MM-DD');
    const monthStart = refDate.startOf('month').format('YYYY-MM-DD');
    const monthEnd = refDate.endOf('month').format('YYYY-MM-DD');

    const employeeIds = employee_ids ? (employee_ids as string).split(',').map(id => parseInt(id.trim())) : [];

    let employeeFilter = '';
    const params: any[] = [quarterStart, quarterEnd, monthStart, monthEnd];

    if (employeeIds.length > 0) {
      employeeFilter = ` AND esp.employee_id IN (${employeeIds.map(() => '?').join(',')})`;
      params.push(...employeeIds);
    }

    // 计算季度和月度工时
    const [rows] = await pool.execute(
      `SELECT
         esp.employee_id,
         -- 季度总工时
         COALESCE(SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN esp.plan_hours END), 0) AS quarterHours,
         -- 季度车间工时 (batch_operation_plan_id > 0)
         COALESCE(SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? AND esp.batch_operation_plan_id > 0 THEN esp.plan_hours END), 0) AS quarterShopHours,
         -- 月度总工时
         COALESCE(SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? THEN esp.plan_hours END), 0) AS monthHours,
         -- 月度车间工时 (batch_operation_plan_id > 0)
         COALESCE(SUM(CASE WHEN esp.plan_date BETWEEN ? AND ? AND esp.batch_operation_plan_id > 0 THEN esp.plan_hours END), 0) AS monthShopHours
       FROM employee_shift_plans esp
       WHERE (esp.plan_date BETWEEN ? AND ? OR esp.plan_date BETWEEN ? AND ?)
       ${employeeFilter}
       GROUP BY esp.employee_id`,
      params
    );

    // 计算标准工时 (工作日数 × 8小时)
    const quarterWorkingDays = await calculateWorkingDaysFromCalendar(quarterStart, quarterEnd);
    const monthWorkingDays = await calculateWorkingDaysFromCalendar(monthStart, monthEnd);
    const quarterStandardHours = quarterWorkingDays * 8;
    const monthStandardHours = monthWorkingDays * 8;

    const result = (rows as any[]).map(row => ({
      employeeId: row.employee_id,
      quarterHours: Number(row.quarterHours),
      quarterShopHours: Number(row.quarterShopHours),
      quarterStandardHours,
      monthHours: Number(row.monthHours),
      monthShopHours: Number(row.monthShopHours),
      monthStandardHours
    }));

    // 如果没有实际数据，返回带有标准工时的空数据
    if (result.length === 0 && employeeIds.length > 0) {
      return employeeIds.map(employeeId => ({
        employeeId,
        quarterHours: 0,
        quarterShopHours: 0,
        quarterStandardHours,
        monthHours: 0,
        monthShopHours: 0,
        monthStandardHours
      }));
    }

    res.json(result);
  } catch (error) {
    console.error('Error getting employee metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 辅助函数：从日历表计算工作日数
async function calculateWorkingDaysFromCalendar(startDate: string, endDate: string): Promise<number> {
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS working_days
       FROM calendar_workdays
       WHERE calendar_date BETWEEN ? AND ?
         AND is_workday = 1`,
      [startDate, endDate]
    );

    const rowsArray = Array.isArray(rows) ? rows : [];
    return rowsArray.length > 0 ? Number((rowsArray[0] as any).working_days || 0) : 0;
  } catch (error) {
    console.error("Failed to calculate working days from calendar:", error);
    // 如果查询失败，使用简单的天数估算（排除周末）
    const start = dayjs(startDate);
    const end = dayjs(endDate);
    let workingDays = 0;
    let current = start;

    while (current.isSameOrBefore(end)) {
      // 周一到周五为工作日 (day() 返回 0-6，0为周日，1为周一)
      if (current.day() >= 1 && current.day() <= 5) {
        workingDays++;
      }
      current = current.add(1, 'day');
    }

    return workingDays;
  }
}

export const deleteMonthlySchedule = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }

    const yearNum = Number(year);
    const monthNum = Number(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ error: 'Invalid year or month' });
    }

    // Calculate month start and end dates
    const monthStart = dayjs(`${yearNum}-${monthNum.toString().padStart(2, '0')}-01`).startOf('month');
    const monthEnd = monthStart.endOf('month');

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Delete batch_personnel_assignments for shift plans in this month
      const [deleteAssignments] = await connection.execute(
        `DELETE bpa FROM batch_personnel_assignments bpa
         JOIN employee_shift_plans esp ON bpa.shift_plan_id = esp.id
         WHERE esp.plan_date BETWEEN ? AND ?`,
        [monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD')]
      );

      // Delete employee_shift_plans for this month
      const [deleteShiftPlans] = await connection.execute(
        `DELETE FROM employee_shift_plans
         WHERE plan_date BETWEEN ? AND ?`,
        [monthStart.format('YYYY-MM-DD'), monthEnd.format('YYYY-MM-DD')]
      );

      await connection.commit();

      const deletedAssignments = (deleteAssignments as any).affectedRows || 0;
      const deletedShiftPlans = (deleteShiftPlans as any).affectedRows || 0;

      res.json({
        success: true,
        deletedShiftPlans,
        deletedAssignments,
        message: `Deleted ${deletedShiftPlans} shift plans and ${deletedAssignments} assignments for ${year}-${month}`
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error deleting monthly schedule:', error);
    res.status(500).json({ error: 'Failed to delete monthly schedule' });
  }
};
