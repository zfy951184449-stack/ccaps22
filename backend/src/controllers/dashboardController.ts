/**
 * Dashboard Controller
 * 
 * 提供调度中心仪表盘所需的数据聚合API
 */

import { Request, Response } from 'express';
import pool from '../config/database';
import { RowDataPacket } from 'mysql2';
import dayjs from 'dayjs';

/**
 * 获取人力供需曲线数据
 * GET /api/dashboard/manpower-curve
 * 
 * Query Params:
 *   - year_month: 月份，格式 YYYY-MM (必填)
 *   - department_id: 部门ID (可选)
 *   - team_id: 团队ID (可选)
 *   - shift_id: 班次ID (可选，按班次筛选)
 */
export const getManpowerCurve = async (req: Request, res: Response) => {
    try {
        const { year_month, department_id, team_id, shift_id } = req.query;

        if (!year_month) {
            return res.status(400).json({ error: 'year_month 为必填参数，格式: YYYY-MM' });
        }

        const monthStart = dayjs(year_month as string).startOf('month');
        const monthEnd = dayjs(year_month as string).endOf('month');

        if (!monthStart.isValid()) {
            return res.status(400).json({ error: '无效的 year_month 格式' });
        }

        const startDate = monthStart.format('YYYY-MM-DD');
        const endDate = monthEnd.format('YYYY-MM-DD');

        // 获取真实的 team_id（从 organization_units 的 metadata 中查找）
        let realTeamId: number | null = null;
        let realDeptId: number | null = null;

        if (team_id) {
            const [unitRows] = await pool.execute<RowDataPacket[]>(
                `SELECT metadata FROM organization_units WHERE id = ? AND unit_type = 'TEAM'`,
                [team_id]
            );
            if (unitRows.length > 0 && unitRows[0].metadata) {
                const metadata = typeof unitRows[0].metadata === 'string'
                    ? JSON.parse(unitRows[0].metadata)
                    : unitRows[0].metadata;
                realTeamId = metadata.teamId || null;
            }
            // 如果没有 metadata，尝试直接使用 team_id（可能是旧数据）
            if (!realTeamId) {
                realTeamId = Number(team_id);
            }
        }

        if (department_id && !team_id) {
            const [unitRows] = await pool.execute<RowDataPacket[]>(
                `SELECT metadata FROM organization_units WHERE id = ? AND unit_type = 'DEPARTMENT'`,
                [department_id]
            );
            if (unitRows.length > 0 && unitRows[0].metadata) {
                const metadata = typeof unitRows[0].metadata === 'string'
                    ? JSON.parse(unitRows[0].metadata)
                    : unitRows[0].metadata;
                realDeptId = metadata.departmentId || null;
            }
            if (!realDeptId) {
                realDeptId = Number(department_id);
            }
        }

        // 1. 获取团队总人数
        const employeeParams: any[] = [];
        let employeeFilter = "e.employment_status = 'ACTIVE'";

        if (realTeamId) {
            employeeFilter += ' AND e.primary_team_id = ?';
            employeeParams.push(realTeamId);
        } else if (realDeptId) {
            employeeFilter += ' AND e.department_id = ?';
            employeeParams.push(realDeptId);
        }

        const [headcountRows] = await pool.execute<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM employees e WHERE ${employeeFilter}`,
            employeeParams
        );
        const totalHeadcount = Number(headcountRows[0]?.total || 0);

        // 2. 获取每日可用人数（上班员工，非 REST）
        const availableParams: any[] = [startDate, endDate];
        let availableFilter = '';

        if (realTeamId) {
            availableFilter += ' AND e.primary_team_id = ?';
            availableParams.push(realTeamId);
        } else if (realDeptId) {
            availableFilter += ' AND e.department_id = ?';
            availableParams.push(realDeptId);
        }

        // 班次筛选逻辑优化：
        // - 如果指定了班次，只统计该班次类型的员工
        // - 如果未指定班次，统计所有非 REST 的员工
        let categoryFilter = "AND esp.plan_category != 'REST'";
        if (shift_id) {
            availableFilter += ' AND esp.shift_id = ?';
            availableParams.push(shift_id);
            // 指定班次时，不再额外排除 REST（因为工作班次不会有 REST 类别）
            categoryFilter = '';
        }

        const [availableRows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
         DATE_FORMAT(esp.plan_date, '%Y-%m-%d') as date,
         COUNT(DISTINCT esp.employee_id) as available_count
       FROM employee_shift_plans esp
       JOIN employees e ON esp.employee_id = e.id
       WHERE esp.plan_date BETWEEN ? AND ?
         ${categoryFilter}
         AND e.employment_status = 'ACTIVE'
         ${availableFilter}
       GROUP BY esp.plan_date
       ORDER BY esp.plan_date`,
            availableParams
        );

        // 3. 获取每日需求人数（峰值模式：每小时最大同时需求）
        // 使用批次操作计划的时间范围计算
        const demandParams: any[] = [startDate, endDate, startDate, endDate];
        let demandFilter = '';

        // 如果指定了 team_id 或 department_id，需要关联已分配的员工来筛选
        // 这里简化处理：需求人数按全部操作统计，不按团队筛选
        // 因为操作本身不属于某个团队，而是由多个团队的人员共同完成

        const [demandRows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
         dates.date,
         COALESCE(MAX(hourly_demand.hour_demand), 0) as demand_count
       FROM (
         SELECT DISTINCT DATE_FORMAT(d.date, '%Y-%m-%d') as date
         FROM (
           SELECT DATE_ADD(?, INTERVAL seq DAY) as date
           FROM (
             SELECT 0 as seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 
             UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
             UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11
             UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15
             UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
             UNION SELECT 20 UNION SELECT 21 UNION SELECT 22 UNION SELECT 23
             UNION SELECT 24 UNION SELECT 25 UNION SELECT 26 UNION SELECT 27
             UNION SELECT 28 UNION SELECT 29 UNION SELECT 30
           ) seq_table
         ) d
         WHERE d.date <= ?
       ) dates
       LEFT JOIN (
         SELECT 
           DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d') as date,
           DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d %H:00:00') as hour_bucket,
           SUM(bop.required_people) as hour_demand
         FROM batch_operation_plans bop
         JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
         WHERE pbp.plan_status = 'ACTIVATED'
           AND bop.planned_start_datetime >= ?
           AND bop.planned_start_datetime <= DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d'), 
                  DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d %H:00:00')
       ) hourly_demand ON dates.date = hourly_demand.date
       GROUP BY dates.date
       ORDER BY dates.date`,
            demandParams
        );

        // 4. 获取节假日数据（关联salary_multiplier区分2倍/3倍工资）
        const [holidayRows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
               DATE_FORMAT(cw.calendar_date, '%Y-%m-%d') as date,
               cw.is_workday,
               cw.holiday_type,
               cw.holiday_name,
               hsc.salary_multiplier
             FROM calendar_workdays cw
             LEFT JOIN holiday_salary_config hsc 
               ON cw.calendar_date = hsc.calendar_date 
               AND hsc.is_active = 1
             WHERE cw.calendar_date BETWEEN ? AND ?`,
            [startDate, endDate]
        );

        const holidayMap = new Map<string, { is_workday: boolean; holiday_type: string; holiday_name: string | null; salary_multiplier: number | null }>();
        for (const row of holidayRows) {
            holidayMap.set(row.date, {
                is_workday: Boolean(row.is_workday),
                holiday_type: row.holiday_type || 'WORKDAY',
                holiday_name: row.holiday_name || null,
                salary_multiplier: row.salary_multiplier ? Number(row.salary_multiplier) : null,
            });
        }

        // 5. 获取按班次和操作状态分组的每日可用人数
        const [shiftBreakdownRows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
               DATE_FORMAT(esp.plan_date, '%Y-%m-%d') as date,
               sd.shift_code,
               sd.shift_name,
               CASE WHEN esp.batch_operation_plan_id IS NOT NULL THEN 1 ELSE 0 END as has_operation,
               COUNT(DISTINCT esp.employee_id) as count
             FROM employee_shift_plans esp
             JOIN employees e ON esp.employee_id = e.id
             JOIN shift_definitions sd ON esp.shift_id = sd.id
             WHERE esp.plan_date BETWEEN ? AND ?
               AND esp.plan_category != 'REST'
               AND e.employment_status = 'ACTIVE'
               ${availableFilter}
             GROUP BY esp.plan_date, sd.shift_code, sd.shift_name, 
                      CASE WHEN esp.batch_operation_plan_id IS NOT NULL THEN 1 ELSE 0 END
             ORDER BY esp.plan_date, sd.nominal_hours ASC`,
            availableParams
        );

        // 构建班次分组Map
        const shiftBreakdownMap = new Map<string, Array<{ shift_code: string; shift_name: string; has_operation: boolean; count: number }>>();
        for (const row of shiftBreakdownRows) {
            const date = row.date;
            if (!shiftBreakdownMap.has(date)) {
                shiftBreakdownMap.set(date, []);
            }
            shiftBreakdownMap.get(date)!.push({
                shift_code: row.shift_code,
                shift_name: row.shift_name,
                has_operation: Boolean(row.has_operation),
                count: Number(row.count),
            });
        }

        // 6. 合并数据
        const availableMap = new Map<string, number>();
        for (const row of availableRows) {
            availableMap.set(row.date, Number(row.available_count));
        }

        const demandMap = new Map<string, number>();
        for (const row of demandRows) {
            demandMap.set(row.date, Number(row.demand_count));
        }

        // 生成所有日期的数据
        const dailyData: any[] = [];
        let currentDate = monthStart;
        let totalGap = 0;
        let gapDays = 0;
        let maxGap = 0;
        let maxGapDate = '';

        while (currentDate.isBefore(monthEnd) || currentDate.isSame(monthEnd, 'day')) {
            const dateStr = currentDate.format('YYYY-MM-DD');
            const available = availableMap.get(dateStr) || 0;
            const demand = demandMap.get(dateStr) || 0;
            const gap = Math.max(0, demand - available);
            const holidayInfo = holidayMap.get(dateStr);

            if (gap > 0) {
                totalGap += gap;
                gapDays += 1;
                if (gap > maxGap) {
                    maxGap = gap;
                    maxGapDate = dateStr;
                }
            }

            dailyData.push({
                date: dateStr,
                available_count: available,
                demand_count: demand,
                gap: gap,
                is_weekend: currentDate.day() === 0 || currentDate.day() === 6,
                is_workday: holidayInfo?.is_workday ?? (currentDate.day() !== 0 && currentDate.day() !== 6),
                holiday_type: holidayInfo?.holiday_type ?? 'WORKDAY',
                holiday_name: holidayInfo?.holiday_name ?? null,
                salary_multiplier: holidayInfo?.salary_multiplier ?? null,
                shift_breakdown: shiftBreakdownMap.get(dateStr) || [],
            });

            currentDate = currentDate.add(1, 'day');
        }

        // 7. 计算汇总指标
        const daysWithData = dailyData.filter(d => d.available_count > 0 || d.demand_count > 0).length;
        const avgGap = gapDays > 0 ? (totalGap / gapDays).toFixed(1) : '0';
        const totalAvailable = dailyData.reduce((sum, d) => sum + d.available_count, 0);
        const totalDemand = dailyData.reduce((sum, d) => sum + d.demand_count, 0);
        const sufficiencyRate = totalDemand > 0
            ? Math.min(100, Math.round((totalAvailable / totalDemand) * 100))
            : 100;

        res.json({
            total_headcount: totalHeadcount,
            daily_data: dailyData,
            summary: {
                avg_gap: avgGap,
                max_gap: maxGap,
                max_gap_date: maxGapDate,
                sufficiency_rate: sufficiencyRate,
                gap_days: gapDays,
            },
        });
    } catch (error) {
        console.error('Error getting manpower curve:', error);
        res.status(500).json({ error: 'Failed to get manpower curve data' });
    }
};

/**
 * 获取班次定义列表（用于筛选器）
 * GET /api/dashboard/shifts
 */
export const getShiftOptions = async (_req: Request, res: Response) => {
    try {
        // 只返回工作班次，排除休息类型
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, shift_code, shift_name 
       FROM shift_definitions 
       WHERE is_active = 1 
         AND shift_code NOT IN ('REST', 'rest', 'OFF')
       ORDER BY shift_name`
        );
        res.json(rows);
    } catch (error) {
        console.error('Error getting shift options:', error);
        res.status(500).json({ error: 'Failed to get shift options' });
    }
};

/**
 * 获取工时需求曲线数据
 * GET /api/dashboard/work-hours-curve
 * 
 * Query Params:
 *   - year_month: 月份，格式 YYYY-MM (日视图必填)
 *   - granularity: 'day' | 'month', 默认 'day'
 *   - start_month: 起始月份 YYYY-MM (月视图必填)
 *   - end_month: 结束月份 YYYY-MM (月视图必填)
 */
export const getWorkHoursCurve = async (req: Request, res: Response) => {
    try {
        const { year_month, granularity = 'day', start_month, end_month } = req.query;

        // ================= 日视图 =================
        if (granularity === 'day') {
            if (!year_month) {
                return res.status(400).json({ error: 'year_month 为必填参数，格式: YYYY-MM' });
            }

            const monthStart = dayjs(year_month as string).startOf('month');
            const monthEnd = dayjs(year_month as string).endOf('month');

            if (!monthStart.isValid()) {
                return res.status(400).json({ error: '无效的 year_month 格式' });
            }

            const startDate = monthStart.format('YYYY-MM-DD');
            const endDate = monthEnd.add(1, 'day').format('YYYY-MM-DD');

            // 按批次分组统计每日工时
            const [batchHoursRows] = await pool.execute<RowDataPacket[]>(
                `SELECT 
                   DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d') as date,
                   pbp.id as batch_id,
                   pbp.batch_code,
                   SUM(bop.planned_duration * bop.required_people) as work_hours
                 FROM batch_operation_plans bop
                 JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                 WHERE pbp.plan_status = 'ACTIVATED'
                   AND bop.planned_start_datetime >= ? 
                   AND bop.planned_start_datetime < ?
                 GROUP BY DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d'), 
                          pbp.id, pbp.batch_code
                 ORDER BY date, batch_code`,
                [startDate, endDate]
            );

            // 构建数据结构
            const dailyData: any[] = [];
            const totalByDate = new Map<string, number>();
            const batchSet = new Map<number, string>();

            for (const row of batchHoursRows) {
                const hours = Number(row.work_hours) || 0;
                dailyData.push({
                    date: row.date,
                    batch_id: row.batch_id,
                    batch_code: row.batch_code,
                    work_hours: hours,
                });

                const current = totalByDate.get(row.date) || 0;
                totalByDate.set(row.date, current + hours);

                if (!batchSet.has(row.batch_id)) {
                    batchSet.set(row.batch_id, row.batch_code);
                }
            }

            const totalDailyData = Array.from(totalByDate.entries()).map(([date, hours]) => ({
                date,
                work_hours: hours,
            }));

            const totalHours = totalDailyData.reduce((sum, d) => sum + d.work_hours, 0);
            const peakDay = totalDailyData.reduce((max, d) => d.work_hours > max.work_hours ? d : max, { date: '', work_hours: 0 });

            const batches = Array.from(batchSet.entries()).map(([id, code]) => ({
                batch_id: id,
                batch_code: code,
            }));

            return res.json({
                granularity: 'day',
                daily_data: dailyData,
                total_by_date: totalDailyData,
                batches,
                summary: {
                    total_hours: Math.round(totalHours * 10) / 10,
                    avg_daily_hours: totalDailyData.length > 0
                        ? Math.round(totalHours / totalDailyData.length * 10) / 10
                        : 0,
                    peak_hours: Math.round(peakDay.work_hours * 10) / 10,
                    peak_date: peakDay.date,
                    batch_count: batches.length,
                },
            });
        }

        // ================= 月视图 =================
        if (granularity === 'month') {

            if (!start_month || !end_month) {
                return res.status(400).json({ error: 'month 模式需要 start_month 和 end_month 参数' });
            }

            const rangeStart = dayjs(start_month as string).startOf('month');
            const rangeEnd = dayjs(end_month as string).endOf('month');

            if (!rangeStart.isValid() || !rangeEnd.isValid()) {
                return res.status(400).json({ error: '无效的月份格式' });
            }

            const startDate = rangeStart.format('YYYY-MM-DD');
            const endDate = rangeEnd.add(1, 'day').format('YYYY-MM-DD');

            // 1. 按月+批次分组统计工时
            const [monthlyBatchRows] = await pool.execute<RowDataPacket[]>(
                `SELECT 
                   DATE_FORMAT(bop.planned_start_datetime, '%Y-%m') as ym,
                   pbp.batch_code,
                   SUM(bop.planned_duration * bop.required_people) as work_hours
                 FROM batch_operation_plans bop
                 JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                 WHERE pbp.plan_status = 'ACTIVATED'
                   AND bop.planned_start_datetime >= ? 
                   AND bop.planned_start_datetime < ?
                 GROUP BY DATE_FORMAT(bop.planned_start_datetime, '%Y-%m'), pbp.batch_code
                 ORDER BY ym, pbp.batch_code`,
                [startDate, endDate]
            );

            // 2. 计算每日工时，用于找每月峰值
            const [dailyHoursRows] = await pool.execute<RowDataPacket[]>(
                `SELECT 
                   DATE_FORMAT(bop.planned_start_datetime, '%Y-%m') as ym,
                   DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d') as dt,
                   SUM(bop.planned_duration * bop.required_people) as daily_hours
                 FROM batch_operation_plans bop
                 JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
                 WHERE pbp.plan_status = 'ACTIVATED'
                   AND bop.planned_start_datetime >= ?
                   AND bop.planned_start_datetime < ?
                 GROUP BY DATE_FORMAT(bop.planned_start_datetime, '%Y-%m'), DATE_FORMAT(bop.planned_start_datetime, '%Y-%m-%d')
                 ORDER BY ym, daily_hours DESC`,
                [startDate, endDate]
            );

            // 找每月峰值
            const peakByMonth = new Map<string, { hours: number; date: string }>();
            for (const row of dailyHoursRows) {
                const ym = row.ym;
                if (!peakByMonth.has(ym)) {
                    peakByMonth.set(ym, {
                        hours: Number(row.daily_hours) || 0,
                        date: row.dt,
                    });
                }
            }

            // 3. 获取员工总人数 (用于计算人均)
            const [employeeCountRows] = await pool.execute<RowDataPacket[]>(
                `SELECT COUNT(*) as total FROM employees WHERE employment_status = 'ACTIVE'`
            );
            const totalEmployees = Number(employeeCountRows[0]?.total || 1);

            // 4. 构建月视图数据
            const monthlyDataMap = new Map<string, { total: number; batches: any[]; peak: number; peakDate: string }>();

            // 初始化所有月份
            let currentMonth = rangeStart;
            while (currentMonth.isBefore(rangeEnd) || currentMonth.isSame(rangeEnd, 'month')) {
                const ym = currentMonth.format('YYYY-MM');
                monthlyDataMap.set(ym, { total: 0, batches: [], peak: 0, peakDate: '' });
                currentMonth = currentMonth.add(1, 'month');
            }

            // 填充批次数据
            for (const row of monthlyBatchRows) {
                const data = monthlyDataMap.get(row.ym);
                if (data) {
                    const hours = Math.round(Number(row.work_hours) * 10) / 10;
                    data.batches.push({
                        batch_code: row.batch_code,
                        work_hours: hours,
                    });
                    data.total += hours;
                }
            }

            // 填充峰值数据
            for (const [ym, peak] of peakByMonth) {
                const data = monthlyDataMap.get(ym);
                if (data) {
                    data.peak = Math.round(peak.hours * 10) / 10;
                    data.peakDate = peak.date;
                }
            }

            // 构建返回数据
            const monthlyData = Array.from(monthlyDataMap.entries()).map(([ym, data]) => ({
                year_month: ym,
                month_label: dayjs(ym).format('M月'),
                total_hours: Math.round(data.total * 10) / 10,
                hours_per_person: Math.round(data.total / totalEmployees * 10) / 10,
                peak_daily_hours: data.peak,
                peak_date: data.peakDate,
                batch_breakdown: data.batches,
            }));

            // 计算汇总
            const grandTotal = monthlyData.reduce((sum, m) => sum + m.total_hours, 0);
            const monthsWithData = monthlyData.filter(m => m.total_hours > 0);
            const monthCount = monthsWithData.length || 1;

            // 月人均工时均值 = 各月人均工时之和 / 有数据的月份数
            const sumPerCapita = monthsWithData.reduce((sum, m) => sum + m.hours_per_person, 0);
            const avgHoursPerPerson = Math.round(sumPerCapita / monthCount * 10) / 10;

            return res.json({
                granularity: 'month',
                monthly_data: monthlyData,
                summary: {
                    total_hours: Math.round(grandTotal * 10) / 10,
                    avg_monthly_hours: Math.round(grandTotal / monthCount * 10) / 10,
                    avg_hours_per_person: avgHoursPerPerson,
                    total_employees: totalEmployees,
                },
            });

        }

        return res.status(400).json({ error: 'granularity 参数必须为 day 或 month' });

    } catch (error: any) {
        console.error('Error getting work hours curve:', error?.message || error);
        console.error('Error stack:', error?.stack);
        res.status(500).json({ error: 'Failed to get work hours curve data' });
    }
};

/**
 * 获取每日操作人员分配数据
 * GET /api/dashboard/daily-assignments
 * 
 * Query Params:
 *   - date: 日期，格式 YYYY-MM-DD (必填)
 */
export const getDailyAssignments = async (req: Request, res: Response) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'date 为必填参数，格式: YYYY-MM-DD' });
        }

        const queryDate = dayjs(date as string);
        if (!queryDate.isValid()) {
            return res.status(400).json({ error: '无效的 date 格式' });
        }

        const dateStr = queryDate.format('YYYY-MM-DD');

        // 查询指定日期有操作的批次及其人员分配（包含阶段信息）
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
                pbp.id as batch_id,
                pbp.batch_code,
                ps.id as stage_id,
                ps.stage_name,
                bop.id as operation_plan_id,
                o.operation_name,
                TIME_FORMAT(bop.planned_start_datetime, '%H:%i') as start_time,
                TIME_FORMAT(bop.planned_end_datetime, '%H:%i') as end_time,
                bop.required_people,
                bpa.position_number,
                e.employee_name
             FROM batch_operation_plans bop
             JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
             JOIN operations o ON bop.operation_id = o.id
             JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
             JOIN process_stages ps ON sos.stage_id = ps.id
             LEFT JOIN batch_personnel_assignments bpa ON bop.id = bpa.batch_operation_plan_id
             LEFT JOIN employees e ON bpa.employee_id = e.id
             WHERE pbp.plan_status = 'ACTIVATED'
               AND DATE(bop.planned_start_datetime) = ?
             ORDER BY pbp.batch_code, ps.id, bop.planned_start_datetime, bpa.position_number`,
            [dateStr]
        );

        // 按批次 → 阶段 → 操作聚合数据
        interface OperationData {
            operation_plan_id: number;
            operation_name: string;
            start_time: string;
            end_time: string;
            required_people: number;
            assignments: { position: number; employee_name: string | null }[];
        }

        interface StageData {
            stage_id: number;
            stage_name: string;
            operations: Map<number, OperationData>;
        }

        interface BatchDataMap {
            batch_id: number;
            batch_code: string;
            stages: Map<number, StageData>;
        }

        const batchMap = new Map<number, BatchDataMap>();

        for (const row of rows) {
            // 获取或创建批次
            if (!batchMap.has(row.batch_id)) {
                batchMap.set(row.batch_id, {
                    batch_id: row.batch_id,
                    batch_code: row.batch_code,
                    stages: new Map(),
                });
            }
            const batch = batchMap.get(row.batch_id)!;

            // 获取或创建阶段
            if (!batch.stages.has(row.stage_id)) {
                batch.stages.set(row.stage_id, {
                    stage_id: row.stage_id,
                    stage_name: row.stage_name,
                    operations: new Map(),
                });
            }
            const stage = batch.stages.get(row.stage_id)!;

            // 获取或创建操作
            if (!stage.operations.has(row.operation_plan_id)) {
                stage.operations.set(row.operation_plan_id, {
                    operation_plan_id: row.operation_plan_id,
                    operation_name: row.operation_name,
                    start_time: row.start_time,
                    end_time: row.end_time,
                    required_people: row.required_people,
                    assignments: [],
                });
            }
            const operation = stage.operations.get(row.operation_plan_id)!;

            // 添加人员分配（如果有）
            if (row.position_number != null) {
                operation.assignments.push({
                    position: row.position_number,
                    employee_name: row.employee_name,
                });
            }
        }

        // 转换为响应格式
        const batches = Array.from(batchMap.values()).map(batch => ({
            batch_id: batch.batch_id,
            batch_code: batch.batch_code,
            stages: Array.from(batch.stages.values()).map(stage => ({
                stage_id: stage.stage_id,
                stage_name: stage.stage_name,
                operations: Array.from(stage.operations.values()).map(op => {
                    // 确保所有位置都有数据
                    const assignmentMap = new Map(op.assignments.map(a => [a.position, a.employee_name]));
                    const fullAssignments = [];
                    for (let i = 1; i <= op.required_people; i++) {
                        fullAssignments.push({
                            position: i,
                            employee_name: assignmentMap.get(i) || null,
                        });
                    }
                    return {
                        ...op,
                        assignments: fullAssignments,
                    };
                }),
            })),
        }));

        res.json({
            date: dateStr,
            batches,
        });

    } catch (error: any) {
        console.error('Error getting daily assignments:', error?.message || error);
        res.status(500).json({ error: 'Failed to get daily assignments data' });
    }
};
