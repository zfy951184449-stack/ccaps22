import { Request, Response } from 'express';
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
         esp.id AS plan_id,
         esp.employee_id,
         e.employee_code,
         e.employee_name,
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
       LEFT JOIN shift_definitions sd ON esp.shift_id = sd.id
       LEFT JOIN batch_operation_plans bop ON esp.batch_operation_plan_id = bop.id
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
