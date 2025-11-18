import { Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';
import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import HolidayService from '../services/holidayService';
import BatchLifecycleService, { BatchLifecycleError } from '../services/batchLifecycleService';

dayjs.extend(weekOfYear);

interface CalendarOperation {
  operation_plan_id: number;
  batch_id: number;
  batch_code: string;
  batch_name: string;
  batch_color: string;
  operation_code: string;
  operation_name: string;
  stage_name: string;
  planned_start_datetime: string;
  planned_end_datetime: string;
  window_start_datetime: string | null;
  window_end_datetime: string | null;
  operation_date: string;
  start_time: string;
  end_time: string;
  planned_duration: number;
  required_people: number;
  assigned_people: number;
  qualification_requirements: string;
  assignment_status: 'COMPLETE' | 'PARTIAL' | 'UNASSIGNED';
  is_locked?: number;
}

// 获取日视图操作
export const getDayOperations = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    
    const query = `
      SELECT 
        co.*,
        GROUP_CONCAT(
          CONCAT(e.employee_name, '(', e.employee_code, ')')
          SEPARATOR ', '
        ) as assigned_personnel
      FROM v_calendar_operations co
      LEFT JOIN batch_personnel_assignments bpa ON co.operation_plan_id = bpa.batch_operation_plan_id
        AND bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
      LEFT JOIN employees e ON bpa.employee_id = e.id
      WHERE DATE(co.planned_start_datetime) = ?
      GROUP BY co.operation_plan_id
      ORDER BY co.planned_start_datetime
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [date]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching day operations:', error);
    res.status(500).json({ error: 'Failed to fetch day operations' });
  }
};

// 获取周视图操作
export const getWeekOperations = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'Start and end date parameters are required' });
    }
    
    const query = `
      SELECT 
        DATE(planned_start_datetime) as operation_date,
        COUNT(DISTINCT operation_plan_id) as operation_count,
        COUNT(DISTINCT batch_id) as batch_count,
        SUM(required_people) as total_required,
        SUM(assigned_people) as total_assigned,
        GROUP_CONCAT(DISTINCT batch_code COLLATE utf8mb4_unicode_ci) as batch_codes,
        GROUP_CONCAT(DISTINCT batch_color COLLATE utf8mb4_unicode_ci) as batch_colors,
        SUM(CASE WHEN assignment_status COLLATE utf8mb4_unicode_ci = 'COMPLETE' THEN 1 ELSE 0 END) as complete_count,
        SUM(CASE WHEN assignment_status COLLATE utf8mb4_unicode_ci = 'PARTIAL' THEN 1 ELSE 0 END) as partial_count,
        SUM(CASE WHEN assignment_status COLLATE utf8mb4_unicode_ci = 'UNASSIGNED' THEN 1 ELSE 0 END) as unassigned_count
      FROM v_calendar_operations
      WHERE DATE(planned_start_datetime) BETWEEN ? AND ?
      GROUP BY DATE(planned_start_datetime)
      ORDER BY operation_date
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [startDate, endDate]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching week operations:', error);
    res.status(500).json({ error: 'Failed to fetch week operations' });
  }
};

// 获取月视图操作
export const getMonthOperations = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month parameters are required' });
    }
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = dayjs(startDate).endOf('month').format('YYYY-MM-DD');
    
    const query = `
      SELECT 
        DATE(planned_start_datetime) as operation_date,
        COUNT(DISTINCT operation_plan_id) as operation_count,
        GROUP_CONCAT(DISTINCT batch_code) as batch_codes,
        GROUP_CONCAT(DISTINCT batch_color) as batch_colors,
        MAX(CASE WHEN assignment_status = 'UNASSIGNED' THEN 1 ELSE 0 END) as has_unassigned
      FROM v_calendar_operations
      WHERE DATE(planned_start_datetime) BETWEEN ? AND ?
      GROUP BY DATE(planned_start_datetime)
      ORDER BY operation_date
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [startDate, endDate]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching month operations:', error);
    res.status(500).json({ error: 'Failed to fetch month operations' });
  }
};

export const getWorkdayRange = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date 和 end_date 为必填参数' });
    }

    const startDate = dayjs(String(start_date));
    const endDate = dayjs(String(end_date));

    if (!startDate.isValid() || !endDate.isValid()) {
      return res.status(400).json({ error: '无效的日期参数' });
    }

    // 获取日历数据和3倍工资配置
    const [rows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          cw.calendar_date,
          cw.is_workday,
          cw.holiday_name,
          cw.holiday_type,
          cw.source,
          hsc.salary_multiplier,
          hsc.config_source
        FROM calendar_workdays cw
        LEFT JOIN holiday_salary_config hsc ON cw.calendar_date = hsc.calendar_date
          AND hsc.year = YEAR(cw.calendar_date)
          AND hsc.is_active = 1
        WHERE cw.calendar_date BETWEEN ? AND ?
        ORDER BY cw.calendar_date
      `,
      [startDate.format('YYYY-MM-DD'), endDate.format('YYYY-MM-DD')],
    );

    const result = rows.map((row) => {
      const date = dayjs(row.calendar_date);
      const isWeekend = [0, 6].includes(date.day()); // 0=周日, 6=周六
      const isTripleSalary = Number(row.salary_multiplier || 0) >= 3.0;

      return {
        calendar_date: date.format('YYYY-MM-DD'),
        is_workday: Number(row.is_workday ?? 1),
        holiday_name: row.holiday_name ?? null,
        holiday_type: row.holiday_type ?? null,
        source: row.source ?? null,
        is_weekend: isWeekend,
        is_triple_salary: isTripleSalary,
        salary_multiplier: Number(row.salary_multiplier || 0),
        config_source: row.config_source ?? null,
        // 额外的显示信息
        display_info: {
          is_holiday: Boolean(row.holiday_name),
          is_legal_holiday: row.holiday_type === 'LEGAL_HOLIDAY',
          is_makeup_work: row.holiday_type === 'MAKEUP_WORK',
          is_weekend_adjustment: row.holiday_type === 'WEEKEND_ADJUSTMENT',
          requires_triple_salary: isTripleSalary,
          day_of_week: date.day(), // 0=周日, 1=周一, ..., 6=周六
          day_name: ['日', '一', '二', '三', '四', '五', '六'][date.day()]
        }
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Error fetching workday range:', error);
    res.status(500).json({ error: 'Failed to fetch workday information' });
  }
};

// 获取所有已激活批次的操作计划（用于全局甘特视图）
export const getActiveBatchOperations = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT
        bop.id AS operation_plan_id,
        pbp.id AS batch_id,
        pbp.batch_code,
        pbp.batch_name,
        pbp.batch_color,
        pbp.plan_status,
        ps.id AS stage_id,
        ps.start_day AS stage_start_day,
        ps.stage_name,
        o.operation_name,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        CASE
          WHEN sos.window_start_time IS NULL THEN NULL
          ELSE ADDTIME(
            DATE_ADD(
              DATE_ADD(
                pbp.planned_start_date,
                INTERVAL DATEDIFF(DATE(bop.planned_start_datetime), pbp.planned_start_date) DAY
              ),
              INTERVAL COALESCE(sos.window_start_day_offset, 0) DAY
            ),
            SEC_TO_TIME(sos.window_start_time * 3600)
          )
        END AS window_start_datetime,
        CASE
          WHEN sos.window_end_time IS NULL THEN NULL
          ELSE ADDTIME(
            DATE_ADD(
              DATE_ADD(
                pbp.planned_start_date,
                INTERVAL DATEDIFF(DATE(bop.planned_start_datetime), pbp.planned_start_date) DAY
              ),
              INTERVAL COALESCE(sos.window_end_day_offset, 0) DAY
            ),
            SEC_TO_TIME(sos.window_end_time * 3600)
          )
        END AS window_end_datetime,
        bop.planned_duration,
        bop.required_people,
        bop.is_locked,
        IFNULL(ap.assigned_people, 0) AS assigned_people,
        CASE
          WHEN IFNULL(ap.assigned_people, 0) >= bop.required_people THEN 'COMPLETE'
          WHEN IFNULL(ap.assigned_people, 0) > 0 THEN 'PARTIAL'
          ELSE 'UNASSIGNED'
        END AS assignment_status
      FROM production_batch_plans pbp
      JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
      JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      JOIN operations o ON bop.operation_id = o.id
      LEFT JOIN (
        SELECT batch_operation_plan_id, COUNT(DISTINCT employee_id) AS assigned_people
        FROM batch_personnel_assignments
        WHERE assignment_status IN ('PLANNED', 'CONFIRMED')
        GROUP BY batch_operation_plan_id
      ) ap ON ap.batch_operation_plan_id = bop.id
      WHERE pbp.plan_status = 'ACTIVATED'
      ORDER BY bop.planned_start_datetime ASC
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching active batch operations:', error);
    res.status(500).json({ error: 'Failed to fetch active batch operations' });
  }
};

// 获取操作详情
export const getOperationDetail = async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    
    const query = `
      SELECT 
        co.*,
        bop.is_locked,
        GROUP_CONCAT(
          JSON_OBJECT(
            'employee_id', e.id,
            'employee_name', e.employee_name,
            'employee_code', e.employee_code,
            'assignment_status', bpa.assignment_status,
            'role', bpa.role,
            'is_primary', bpa.is_primary
          )
        ) as assigned_personnel_json
      FROM v_calendar_operations co
      LEFT JOIN batch_personnel_assignments bpa ON co.operation_plan_id = bpa.batch_operation_plan_id
      LEFT JOIN employees e ON bpa.employee_id = e.id
      LEFT JOIN batch_operation_plans bop ON bop.id = co.operation_plan_id
      WHERE co.operation_plan_id = ?
      GROUP BY co.operation_plan_id
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [operationId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    const operation = rows[0];
    if (operation.assigned_personnel_json) {
      operation.assigned_personnel = JSON.parse(`[${operation.assigned_personnel_json}]`);
      delete operation.assigned_personnel_json;
    } else {
      operation.assigned_personnel = [];
    }
    
    res.json(operation);
  } catch (error) {
    console.error('Error fetching operation detail:', error);
    res.status(500).json({ error: 'Failed to fetch operation detail' });
  }
};

// 更新激活批次操作的计划时间与人数
export const updateOperationSchedule = async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    const {
      planned_start_datetime: plannedStart,
      planned_end_datetime: plannedEnd,
      required_people: requiredPeopleInput,
    } = req.body || {};

    if (!plannedStart || !plannedEnd) {
      return res.status(400).json({ error: 'planned_start_datetime and planned_end_datetime are required' });
    }

    const start = dayjs(plannedStart);
    const end = dayjs(plannedEnd);

    if (!start.isValid() || !end.isValid()) {
      return res.status(400).json({ error: 'Invalid datetime format' });
    }

    if (!end.isAfter(start)) {
      return res.status(400).json({ error: 'planned_end_datetime must be after planned_start_datetime' });
    }

    let requiredPeople: number | undefined;
    if (requiredPeopleInput !== undefined && requiredPeopleInput !== null) {
      const parsed = Number(requiredPeopleInput);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'required_people must be a positive number' });
      }
      requiredPeople = Math.round(parsed);
    }

    const durationHours = Number((end.diff(start, 'minute') / 60).toFixed(2));

    const params: (string | number)[] = [
      start.format('YYYY-MM-DD HH:mm:ss'),
      end.format('YYYY-MM-DD HH:mm:ss'),
      durationHours,
    ];

    let updateSql = `
      UPDATE batch_operation_plans
      SET planned_start_datetime = ?,
          planned_end_datetime = ?,
          planned_duration = ?
    `;

    if (requiredPeople !== undefined) {
      updateSql += ', required_people = ?';
      params.push(requiredPeople);
    }

    updateSql += ' WHERE id = ?';
    params.push(Number(operationId));

    const [result] = await pool.execute<ResultSetHeader>(updateSql, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Operation plan not found' });
    }

    res.json({ message: 'Operation schedule updated successfully' });
  } catch (error) {
    console.error('Error updating operation schedule:', error);
    res.status(500).json({ error: 'Failed to update operation schedule' });
  }
};

// 获取推荐人员
export const getRecommendedPersonnel = async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;
    
    // 首先获取操作信息
    const [operationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT 
        bop.operation_id,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        o.operation_name
      FROM batch_operation_plans bop
      JOIN operations o ON bop.operation_id = o.id
      WHERE bop.id = ?`,
      [operationId]
    );
    
    if (operationRows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    
    const operation = operationRows[0];
    
    const [requirementCountRows] = await pool.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS total FROM operation_qualification_requirements WHERE operation_id = ?',
      [operation.operation_id]
    );
    const hasRequirements = Number(requirementCountRows[0]?.total || 0) > 0;

    let personnelRows: RowDataPacket[] = [];

    const baseParams = [
      operation.planned_start_datetime,
      operation.planned_start_datetime,
      operation.planned_end_datetime,
      operation.planned_end_datetime,
      operation.planned_start_datetime,
      operation.planned_end_datetime,
      operation.planned_start_datetime,
    ];

    if (hasRequirements) {
      const query = `
      SELECT 
        e.id as employee_id,
        e.employee_name,
        e.employee_code,
        e.department,
        GROUP_CONCAT(
          CONCAT(q.qualification_name, '(', eq.qualification_level, '级)')
          SEPARATOR ', '
        ) as qualifications,
        -- 计算资质匹配分数
        MAX(
          CASE 
            WHEN eq.qualification_level >= oqr.required_level 
            THEN (eq.qualification_level - oqr.required_level + 5) * 10
            ELSE 0
          END
        ) as match_score,
        -- 检查时间冲突
        (
          SELECT COUNT(*)
          FROM batch_personnel_assignments bpa2
          JOIN batch_operation_plans bop2 ON bpa2.batch_operation_plan_id = bop2.id
          WHERE bpa2.employee_id = e.id
            AND bpa2.assignment_status IN ('PLANNED', 'CONFIRMED')
            AND (
              (bop2.planned_start_datetime <= ? AND bop2.planned_end_datetime > ?)
              OR (bop2.planned_start_datetime < ? AND bop2.planned_end_datetime >= ?)
              OR (bop2.planned_start_datetime >= ? AND bop2.planned_end_datetime <= ?)
            )
        ) as conflict_count,
        -- 当前工作负荷（本周）
        (
          SELECT COUNT(*)
          FROM batch_personnel_assignments bpa3
          JOIN batch_operation_plans bop3 ON bpa3.batch_operation_plan_id = bop3.id
          WHERE bpa3.employee_id = e.id
            AND bpa3.assignment_status IN ('PLANNED', 'CONFIRMED')
            AND WEEK(bop3.planned_start_datetime) = WEEK(?)
        ) as weekly_workload
      FROM employees e
      JOIN employee_qualifications eq ON e.id = eq.employee_id
      JOIN operation_qualification_requirements oqr ON eq.qualification_id = oqr.qualification_id
      JOIN qualifications q ON eq.qualification_id = q.id
      WHERE oqr.operation_id = ?
        AND eq.qualification_level >= oqr.required_level
      GROUP BY e.id
      ORDER BY match_score DESC, conflict_count ASC, weekly_workload ASC
      LIMIT 20
    `;
      const [rows] = await pool.execute<RowDataPacket[]>(query, [
        ...baseParams,
        operation.operation_id,
      ]);
      personnelRows = rows;
    } else {
      // 无资质要求时，采用默认候选：所有在职员工，配合冲突/工作量排序
      const fallbackQuery = `
        SELECT
          e.id AS employee_id,
          e.employee_name,
          e.employee_code,
          e.department,
          GROUP_CONCAT(
            CONCAT(q.qualification_name, '(', IFNULL(eq.qualification_level, 0), '级)')
            SEPARATOR ', '
          ) AS qualifications,
          60 AS match_score,
          (
            SELECT COUNT(*)
            FROM batch_personnel_assignments bpa2
            JOIN batch_operation_plans bop2 ON bpa2.batch_operation_plan_id = bop2.id
            WHERE bpa2.employee_id = e.id
              AND bpa2.assignment_status IN ('PLANNED', 'CONFIRMED')
              AND (
                (bop2.planned_start_datetime <= ? AND bop2.planned_end_datetime > ?)
                OR (bop2.planned_start_datetime < ? AND bop2.planned_end_datetime >= ?)
                OR (bop2.planned_start_datetime >= ? AND bop2.planned_end_datetime <= ?)
              )
          ) AS conflict_count,
          (
            SELECT COUNT(*)
            FROM batch_personnel_assignments bpa3
            JOIN batch_operation_plans bop3 ON bpa3.batch_operation_plan_id = bop3.id
            WHERE bpa3.employee_id = e.id
              AND bpa3.assignment_status IN ('PLANNED', 'CONFIRMED')
              AND WEEK(bop3.planned_start_datetime) = WEEK(?)
          ) AS weekly_workload
        FROM employees e
        LEFT JOIN employee_qualifications eq ON e.id = eq.employee_id
        LEFT JOIN qualifications q ON eq.qualification_id = q.id
        WHERE e.employment_status = 'ACTIVE'
        GROUP BY e.id
        ORDER BY conflict_count ASC, weekly_workload ASC, e.employee_code
        LIMIT 20
      `;
      const [rows] = await pool.execute<RowDataPacket[]>(fallbackQuery, baseParams);
      personnelRows = rows;
    }
    
    // 分类推荐等级
    const recommendedPersonnel = personnelRows.map((person: any) => ({
      ...person,
      recommendation: 
        person.conflict_count > 0 ? 'CONFLICT' :
        person.match_score >= 80 ? 'HIGHLY_RECOMMENDED' :
        person.match_score >= 50 ? 'RECOMMENDED' : 'POSSIBLE',
      has_conflict: person.conflict_count > 0
    }));
    
    res.json(recommendedPersonnel);
  } catch (error) {
    console.error('Error fetching recommended personnel:', error);
    res.status(500).json({ error: 'Failed to fetch recommended personnel' });
  }
};

// 分配人员到操作
export const assignPersonnel = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { operationId } = req.params;
    const { employeeIds, role = 'OPERATOR' } = req.body;
    
    if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ error: 'Employee IDs are required' });
    }
    
    // 删除现有分配
    await connection.execute(
      'DELETE FROM batch_personnel_assignments WHERE batch_operation_plan_id = ?',
      [operationId]
    );
    
    // 批量插入新分配
    const values = employeeIds.map((employeeId: number, index: number) => [
      operationId,
      employeeId,
      role,
      index === 0, // 第一个设为主要负责人
      'PLANNED'
    ]);
    
    const insertQuery = `
      INSERT INTO batch_personnel_assignments 
      (batch_operation_plan_id, employee_id, role, is_primary, assignment_status)
      VALUES ?
    `;
    
    await connection.query(insertQuery, [values]);
    
    await connection.commit();
    
    res.json({ 
      message: 'Personnel assigned successfully',
      assigned_count: employeeIds.length 
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error assigning personnel:', error);
    res.status(500).json({ error: 'Failed to assign personnel' });
  } finally {
    connection.release();
  }
};

// 批量自动分配
export const bulkAutoAssign = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { batchId } = req.params;
    
    // 获取所有未分配或部分分配的操作
    const [operations] = await connection.execute<RowDataPacket[]>(
      `SELECT 
        bop.id,
        bop.operation_id,
        bop.required_people,
        bop.planned_start_datetime,
        bop.planned_end_datetime,
        IFNULL(
          (SELECT COUNT(DISTINCT employee_id)
           FROM batch_personnel_assignments
           WHERE batch_operation_plan_id = bop.id
           AND assignment_status IN ('PLANNED', 'CONFIRMED')),
          0
        ) as assigned_count
      FROM batch_operation_plans bop
      WHERE bop.batch_plan_id = ?
      HAVING assigned_count < required_people`,
      [batchId]
    );
    
    let totalAssigned = 0;
    
    for (const op of operations) {
      const needed = op.required_people - op.assigned_count;
      
      // 获取推荐人员（排除已分配的）
      const [recommended] = await connection.execute<RowDataPacket[]>(
        `SELECT DISTINCT e.id
        FROM employees e
        JOIN employee_qualifications eq ON e.id = eq.employee_id
        JOIN operation_qualification_requirements oqr ON eq.qualification_id = oqr.qualification_id
        WHERE oqr.operation_id = ?
          AND eq.qualification_level >= oqr.required_level
          AND e.id NOT IN (
            SELECT employee_id 
            FROM batch_personnel_assignments 
            WHERE batch_operation_plan_id = ?
          )
          AND e.id NOT IN (
            SELECT bpa.employee_id
            FROM batch_personnel_assignments bpa
            JOIN batch_operation_plans bop2 ON bpa.batch_operation_plan_id = bop2.id
            WHERE bpa.assignment_status IN ('PLANNED', 'CONFIRMED')
              AND (
                (bop2.planned_start_datetime <= ? AND bop2.planned_end_datetime > ?)
                OR (bop2.planned_start_datetime < ? AND bop2.planned_end_datetime >= ?)
              )
          )
        ORDER BY RAND()
        LIMIT ?`,
        [
          op.operation_id,
          op.id,
          op.planned_start_datetime,
          op.planned_start_datetime,
          op.planned_end_datetime,
          op.planned_end_datetime,
          needed
        ]
      );
      
      if (recommended.length > 0) {
        const values = recommended.map((emp: any, index: number) => [
          op.id,
          emp.id,
          'OPERATOR',
          index === 0 && op.assigned_count === 0, // 第一个设为主要负责人
          'PLANNED'
        ]);
        
        await connection.query(
          `INSERT INTO batch_personnel_assignments 
          (batch_operation_plan_id, employee_id, role, is_primary, assignment_status)
          VALUES ?`,
          [values]
        );
        
        totalAssigned += recommended.length;
      }
    }
    
    await connection.commit();
    
    res.json({
      message: 'Bulk assignment completed',
      operations_processed: operations.length,
      personnel_assigned: totalAssigned
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error in bulk assignment:', error);
    res.status(500).json({ error: 'Failed to perform bulk assignment' });
  } finally {
    connection.release();
  }
};

// 激活批次
export const activateBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const { color } = req.body;
    const operatorId = (req as any).user?.id ?? null;

    const result = await BatchLifecycleService.activate(Number(batchId), {
      operatorId,
      color: color || null,
    });

    res.json({
      message: '批次激活成功',
      ...result,
    });
  } catch (error: any) {
    console.error('Error activating batch:', error);
    if (error instanceof BatchLifecycleError) {
      const statusCode = error.code === 'BATCH_NOT_FOUND' ? 404 : 400;
      res.status(statusCode).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    if (error.sqlMessage) {
      res.status(400).json({ error: error.sqlMessage });
      return;
    }
    res.status(500).json({ error: 'Failed to activate batch' });
  }
};

// 撤销批次激活
export const deactivateBatch = async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const operatorId = (req as any).user?.id ?? null;

    const result = await BatchLifecycleService.deactivate(Number(batchId), {
      operatorId,
    });

    res.json({
      message: result.status === 'NOOP' ? '批次未处于激活状态' : '批次撤销激活完成',
      ...result,
    });
  } catch (error: any) {
    console.error('Error deactivating batch:', error);
    if (error instanceof BatchLifecycleError) {
      const statusCode =
        error.code === 'BATCH_NOT_FOUND' ? 404 : error.code === 'INVALID_STATUS' ? 400 : 409;
      res.status(statusCode).json({ error: error.message, code: error.code, details: error.details });
      return;
    }
    if (error.sqlMessage) {
      res.status(400).json({ error: error.sqlMessage });
      return;
    }
    res.status(500).json({ error: 'Failed to deactivate batch' });
  }
};

export const importHolidays = async (req: Request, res: Response) => {
  try {
    const { year } = req.body;
    const numericYear = Number(year);
    if (!numericYear || !Number.isFinite(numericYear)) {
      return res.status(400).json({ error: '请提供有效的年份' });
    }

    const result = await HolidayService.importYear(numericYear);
    return res.json(result);
  } catch (error: any) {
    console.error('Error importing holidays:', error);
    return res.status(500).json({ error: error?.message || '节假日数据导入失败' });
  }
};

/**
 * 获取节假日服务缓存统计信息
 */
export const getHolidayCacheStats = async (req: Request, res: Response) => {
  try {
    const stats = HolidayService.getCacheStats();
    return res.json({
      apiCacheSize: stats.apiCacheSize,
      importTasksSize: stats.importTasksSize,
      cacheHitRatio: '未知', // 可以后续实现更详细的统计
      lastCleanup: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error getting cache stats:', error);
    return res.status(500).json({ error: error?.message || '获取缓存统计失败' });
  }
};

/**
 * 手动清理过期缓存
 */
export const cleanupHolidayCache = async (req: Request, res: Response) => {
  try {
    HolidayService.cleanupExpiredCache();
    return res.json({ message: '缓存清理完成' });
  } catch (error: any) {
    console.error('Error cleaning cache:', error);
    return res.status(500).json({ error: error?.message || '缓存清理失败' });
  }
};

/**
 * 预加载未来年份节假日数据
 */
export const preloadHolidayData = async (req: Request, res: Response) => {
  try {
    const { yearsAhead } = req.body;
    const years = Number(yearsAhead) || 2;

    if (years < 0 || years > 5) {
      return res.status(400).json({ error: 'yearsAhead必须在0-5之间' });
    }

    // 异步执行预加载，不阻塞响应
    HolidayService.preloadFutureYears(years).catch(error => {
      console.error('预加载节假日数据失败:', error);
    });

    return res.json({
      message: `已启动预加载未来${years}年节假日数据`,
      yearsAhead: years
    });
  } catch (error: any) {
    console.error('Error preloading holiday data:', error);
    return res.status(500).json({ error: error?.message || '预加载失败' });
  }
};
