/**
 * V3 数据组装器
 * 
 * 从数据库查询数据并转换为 V3 求解器契约格式。
 * 完全独立于 V2 的 DataAssembler。
 */

import { RowDataPacket } from 'mysql2';
import pool from '../../config/database';
import dayjs from 'dayjs';

interface V3AssembleParams {
    startDate: string;
    endDate: string;
    batchIds?: number[];
    config?: any;
}

interface V3SolverRequest {
    operations: V3Operation[];
    employees: V3Employee[];
    shift_types: V3ShiftType[];
    calendar_days: V3CalendarDay[];
    share_groups: V3ShareGroup[];
    boundary_states: V3BoundaryState[];
    config: any;
    run_id?: string;
    window_start: string;
    window_end: string;
}

interface V3Operation {
    id: number;
    batch_id: number;
    operation_name: string;
    required_people: number;
    planned_start: string;
    planned_end: string;
    duration_minutes: number;
    required_qualifications: number[];
    share_group_id: number | null;
    priority: string;
}

interface V3Employee {
    id: number;
    name: string;
    employee_code: string;
    role: string;
    qualifications: number[];
    unavailable_periods: { start_date: string; end_date: string }[];
}

interface V3ShiftType {
    id: number;
    shift_code: string;
    shift_name: string;
    start_time: string;
    end_time: string;
    work_hours: number;
    is_night_shift: boolean;
}

interface V3CalendarDay {
    date: string;
    is_workday: boolean;
    is_triple_pay: boolean;
}

interface V3ShareGroup {
    id: number;
    group_name: string;
    group_type: string;
    operation_ids: number[];
}

interface V3BoundaryState {
    employee_id: number;
    last_work_date: string | null;
    consecutive_work_days: number;
    last_night_shift_date: string | null;
    accumulated_hours: number;
}

export class DataAssemblerV3 {
    /**
     * 组装 V3 求解器请求数据
     */
    static async assemble(params: V3AssembleParams): Promise<V3SolverRequest> {
        const { startDate, endDate, batchIds, config } = params;

        // 并行查询所有数据
        const [
            operations,
            employees,
            shiftTypes,
            calendarDays,
            shareGroups,
            boundaryStates,
        ] = await Promise.all([
            this.fetchOperations(startDate, endDate, batchIds),
            this.fetchEmployees(startDate, endDate),
            this.fetchShiftTypes(),
            this.fetchCalendarDays(startDate, endDate),
            this.fetchShareGroups(startDate, endDate),
            this.fetchBoundaryStates(startDate),
        ]);

        return {
            operations,
            employees,
            shift_types: shiftTypes,
            calendar_days: calendarDays,
            share_groups: shareGroups,
            boundary_states: boundaryStates,
            config: config || {},
            window_start: startDate,
            window_end: endDate,
        };
    }

    /**
     * 查询操作数据
     */
    private static async fetchOperations(
        startDate: string,
        endDate: string,
        batchIds?: number[]
    ): Promise<V3Operation[]> {
        let sql = `
      SELECT 
        bop.id,
        bop.batch_plan_id as batch_id,
        o.operation_name,
        bop.required_people,
        bop.planned_start_datetime as planned_start,
        bop.planned_end_datetime as planned_end,
        TIMESTAMPDIFF(MINUTE, bop.planned_start_datetime, bop.planned_end_datetime) as duration_minutes,
        (SELECT bsgm.group_id FROM batch_share_group_members bsgm WHERE bsgm.batch_operation_plan_id = bop.id LIMIT 1) as share_group_id,
        'NORMAL' as priority
      FROM batch_operation_plans bop
      JOIN operations o ON bop.operation_id = o.id
      JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      WHERE pbp.plan_status = 'ACTIVATED'
        AND bop.planned_start_datetime >= ?
        AND bop.planned_start_datetime < DATE_ADD(?, INTERVAL 1 DAY)
    `;

        const values: any[] = [startDate, endDate];

        if (batchIds && batchIds.length > 0) {
            sql += ` AND pbp.id IN (${batchIds.map(() => '?').join(',')})`;
            values.push(...batchIds);
        }

        sql += ' ORDER BY bop.planned_start_datetime';

        const [rows] = await pool.execute<RowDataPacket[]>(sql, values);

        // 查询资质要求
        const operationIds = rows.map(r => r.id);
        const qualificationMap = await this.fetchOperationQualifications(operationIds);

        return rows.map(row => ({
            id: row.id,
            batch_id: row.batch_id,
            operation_name: row.operation_name,
            required_people: row.required_people || 1,
            planned_start: row.planned_start?.toISOString?.() || row.planned_start,
            planned_end: row.planned_end?.toISOString?.() || row.planned_end,
            duration_minutes: row.duration_minutes || 60,
            required_qualifications: qualificationMap.get(row.id) || [],
            share_group_id: row.share_group_id,
            priority: row.priority || 'NORMAL',
        }));
    }

    /**
     * 查询操作资质要求
     */
    private static async fetchOperationQualifications(
        operationIds: number[]
    ): Promise<Map<number, number[]>> {
        if (operationIds.length === 0) return new Map();

        // Query qualification requirements via batch_operation_plans -> operation_id
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT bop.id as batch_operation_plan_id, oqr.qualification_id 
       FROM batch_operation_plans bop
       JOIN operation_qualification_requirements oqr ON bop.operation_id = oqr.operation_id
       WHERE bop.id IN (${operationIds.map(() => '?').join(',')})`,
            operationIds
        );

        const map = new Map<number, number[]>();
        for (const row of rows) {
            if (!map.has(row.batch_operation_plan_id)) {
                map.set(row.batch_operation_plan_id, []);
            }
            map.get(row.batch_operation_plan_id)!.push(row.qualification_id);
        }
        return map;
    }

    /**
     * 查询员工数据
     */
    private static async fetchEmployees(startDate: string, endDate: string): Promise<V3Employee[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT e.id, e.employee_name as name, e.employee_code, COALESCE(r.role_code, 'FRONTLINE') as role
       FROM employees e
       LEFT JOIN employee_roles r ON r.id = e.primary_role_id`
        );

        // 查询员工资质
        const employeeIds = rows.map(r => r.id);
        const [qualificationMap, unavailableMap] = await Promise.all([
            this.fetchEmployeeQualifications(employeeIds),
            this.fetchEmployeeUnavailability(employeeIds, startDate, endDate),
        ]);

        return rows.map(row => ({
            id: row.id,
            name: row.name,
            employee_code: row.employee_code,
            role: row.role || 'OPERATOR',
            qualifications: qualificationMap.get(row.id) || [],
            unavailable_periods: unavailableMap.get(row.id) || [],
        }));
    }

    /**
     * 查询员工不可用时间段
     */
    private static async fetchEmployeeUnavailability(
        employeeIds: number[],
        startDate: string,
        endDate: string
    ): Promise<Map<number, { start_date: string; end_date: string }[]>> {
        if (employeeIds.length === 0) return new Map();

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT
                employee_id,
                start_datetime,
                end_datetime
             FROM employee_unavailability
             WHERE start_datetime <= ? 
               AND end_datetime >= ?
               AND employee_id IN (${employeeIds.map(() => '?').join(',')})`,
            [endDate + ' 23:59:59', startDate + ' 00:00:00', ...employeeIds]
        );

        const map = new Map<number, { start_date: string; end_date: string }[]>();
        for (const row of rows) {
            const empId = row.employee_id;
            if (!map.has(empId)) {
                map.set(empId, []);
            }
            map.get(empId)!.push({
                start_date: dayjs(row.start_datetime).format('YYYY-MM-DDTHH:mm:ss'),
                end_date: dayjs(row.end_datetime).format('YYYY-MM-DDTHH:mm:ss'),
            });
        }
        return map;
    }

    /**
     * 查询员工资质
     */
    private static async fetchEmployeeQualifications(
        employeeIds: number[]
    ): Promise<Map<number, number[]>> {
        if (employeeIds.length === 0) return new Map();

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT employee_id, qualification_id
       FROM employee_qualifications
       WHERE employee_id IN (${employeeIds.map(() => '?').join(',')})`,
            employeeIds
        );

        const map = new Map<number, number[]>();
        for (const row of rows) {
            if (!map.has(row.employee_id)) {
                map.set(row.employee_id, []);
            }
            map.get(row.employee_id)!.push(row.qualification_id);
        }
        return map;
    }

    /**
     * 查询班次类型
     */
    private static async fetchShiftTypes(): Promise<V3ShiftType[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, shift_code, shift_name, start_time, end_time, 
              nominal_hours as work_hours, is_night_shift
       FROM shift_definitions`
        );

        return rows.map(row => ({
            id: row.id,
            shift_code: row.shift_code,
            shift_name: row.shift_name,
            start_time: row.start_time,
            end_time: row.end_time,
            work_hours: parseFloat(row.work_hours) || 8,
            is_night_shift: !!row.is_night_shift,
        }));
    }

    /**
     * 查询日历数据
     */
    private static async fetchCalendarDays(
        startDate: string,
        endDate: string
    ): Promise<V3CalendarDay[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
         DATE_FORMAT(cw.calendar_date, '%Y-%m-%d') as date,
         cw.is_workday,
         COALESCE(hsc.salary_multiplier >= 3, 0) as is_triple_pay
       FROM calendar_workdays cw
       LEFT JOIN holiday_salary_config hsc 
         ON cw.calendar_date = hsc.calendar_date
       WHERE cw.calendar_date >= ? AND cw.calendar_date <= ?
       ORDER BY cw.calendar_date`,
            [startDate, endDate]
        );

        return rows.map(row => ({
            date: row.date,
            is_workday: !!row.is_workday,
            is_triple_pay: !!row.is_triple_pay,
        }));
    }

    /**
     * 查询共享组
     */
    private static async fetchShareGroups(
        startDate: string,
        endDate: string
    ): Promise<V3ShareGroup[]> {
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT DISTINCT bsg.id, bsg.group_name
       FROM batch_share_groups bsg
       JOIN batch_share_group_members bsgm ON bsg.id = bsgm.group_id
       JOIN batch_operation_plans bop ON bsgm.batch_operation_plan_id = bop.id
       WHERE bop.planned_start_datetime >= ? 
         AND bop.planned_start_datetime < DATE_ADD(?, INTERVAL 1 DAY)`,
            [startDate, endDate]
        );

        // 获取每个共享组的操作 ID
        const result: V3ShareGroup[] = [];
        for (const row of rows) {
            const [members] = await pool.execute<RowDataPacket[]>(
                `SELECT batch_operation_plan_id 
         FROM batch_share_group_members 
         WHERE group_id = ?`,
                [row.id]
            );

            result.push({
                id: row.id,
                group_name: row.group_name,
                group_type: 'SAME_TEAM',  // Default value
                operation_ids: members.map(m => m.batch_operation_plan_id),
            });
        }

        return result;
    }

    /**
     * 查询边界状态 (用于跨日约束)
     */
    private static async fetchBoundaryStates(
        startDate: string
    ): Promise<V3BoundaryState[]> {
        // 查询 startDate 之前的最近工作记录
        const lookbackDays = 14;
        const lookbackDate = new Date(startDate);
        lookbackDate.setDate(lookbackDate.getDate() - lookbackDays);
        const lookbackStr = lookbackDate.toISOString().split('T')[0];

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT 
         esp.employee_id,
         MAX(esp.plan_date) as last_work_date,
         SUM(esp.plan_hours) as accumulated_hours
       FROM employee_shift_plans esp
       WHERE esp.plan_date >= ? AND esp.plan_date < ?
         AND esp.plan_category IN ('BASE', 'PRODUCTION', 'OVERTIME')
       GROUP BY esp.employee_id`,
            [lookbackStr, startDate]
        );

        return rows.map(row => ({
            employee_id: row.employee_id,
            last_work_date: row.last_work_date ? new Date(row.last_work_date).toISOString().split('T')[0] : null,
            consecutive_work_days: 0, // TODO: 计算连续工作天数
            last_night_shift_date: null, // TODO: 查询最近夜班日期
            accumulated_hours: parseFloat(row.accumulated_hours) || 0,
        }));
    }
}
