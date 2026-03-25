import { Request, Response } from 'express';
import pool from '../config/database';
import dayjs from 'dayjs';

// Generate the next task code
const generateNextTaskCode = async (
    executor: { execute: (sql: string, params?: any[]) => Promise<any> } = pool
): Promise<string> => {
    const [rows] = await executor.execute(
        'SELECT task_code FROM standalone_tasks ORDER BY task_code DESC LIMIT 1'
    ) as any;

    if (rows.length === 0) {
        return 'ST-00001';
    }

    const lastCode = rows[0].task_code;
    const lastNumber = parseInt(lastCode.split('-')[1]);
    const nextNumber = lastNumber + 1;

    return `ST-${nextNumber.toString().padStart(5, '0')}`;
};

// 1. Get List of Tasks
export const getAllTasks = async (req: Request, res: Response) => {
    try {
        const { status, type, deadline_before, earliest_start_after } = req.query;

        let query = `
      SELECT st.*, ou.unit_name as team_name
      FROM standalone_tasks st
      LEFT JOIN organization_units ou ON st.team_id = ou.id
      WHERE 1=1
    `;
        const params: any[] = [];

        if (status) {
            query += ` AND st.status = ?`;
            params.push(status);
        }
        if (type) {
            query += ` AND st.task_type = ?`;
            params.push(type);
        }
        if (deadline_before) {
            query += ` AND st.deadline <= ?`;
            params.push(deadline_before);
        }
        if (earliest_start_after) {
            query += ` AND st.earliest_start >= ?`;
            params.push(earliest_start_after);
        }

        query += ` ORDER BY st.deadline ASC`;

        const [rows] = await pool.execute(query, params) as any;

        res.json(rows);
    } catch (error) {
        console.error('Error fetching standalone tasks:', error);
        res.status(500).json({ error: 'Failed to fetch standalone tasks' });
    }
};

// 2. Get Task by ID (including qualifications)
export const getTaskById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.execute(
            `SELECT st.*, ou.unit_name as team_name
       FROM standalone_tasks st
       LEFT JOIN organization_units ou ON st.team_id = ou.id
       WHERE st.id = ?`,
            [id]
        ) as any;

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Standalone task not found' });
        }

        const task = rows[0];

        // Fetch qualifications
        const [qualRows] = await pool.execute(
            `SELECT stq.*, q.qualification_name 
       FROM standalone_task_qualifications stq
       JOIN qualifications q ON stq.qualification_id = q.id
       WHERE stq.task_id = ?`,
            [id]
        ) as any;

        task.qualifications = qualRows;

        res.json(task);
    } catch (error) {
        console.error('Error fetching standalone task:', error);
        res.status(500).json({ error: 'Failed to fetch standalone task' });
    }
};

// 3. Create Task
export const createTask = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const {
            task_name,
            task_type,
            required_people,
            duration_minutes,
            team_id,
            earliest_start,
            deadline,
            preferred_shift_ids,
            related_batch_id,
            trigger_operation_plan_id,
            batch_offset_days,
            operation_id,
            recurrence_rule,
            qualifications // array of { position_number, qualification_id, min_level, is_mandatory }
        } = req.body;

        if (!task_name || !task_type || !duration_minutes || !deadline) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const task_code = await generateNextTaskCode(connection);

        const [result] = await connection.execute(
            `INSERT INTO standalone_tasks 
       (task_code, task_name, task_type, required_people, duration_minutes, team_id,
        earliest_start, deadline, preferred_shift_ids, related_batch_id, 
        trigger_operation_plan_id, batch_offset_days, operation_id, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task_code, task_name, task_type, required_people || 1, duration_minutes,
                team_id || null, earliest_start || null, deadline,
                preferred_shift_ids ? JSON.stringify(preferred_shift_ids) : null,
                related_batch_id || null, trigger_operation_plan_id || null, batch_offset_days !== undefined ? batch_offset_days : 7,
                operation_id || null,
                recurrence_rule ? JSON.stringify(recurrence_rule) : null
            ]
        ) as any;

        const newTaskId = result.insertId;

        // Insert qualifications if provided
        if (qualifications && qualifications.length > 0) {
            for (const qual of qualifications) {
                await connection.execute(
                    `INSERT INTO standalone_task_qualifications 
           (task_id, position_number, qualification_id, min_level, is_mandatory)
           VALUES (?, ?, ?, ?, ?)`,
                    [newTaskId, qual.position_number || 1, qual.qualification_id, qual.min_level || 1, qual.is_mandatory !== false]
                );
            }
        }

        await connection.commit();
        res.status(201).json({ id: newTaskId, task_code, message: 'Standalone task created successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error creating standalone task:', error);
        res.status(500).json({ error: 'Failed to create standalone task' });
    } finally {
        connection.release();
    }
};

// 4. Update Task
export const updateTask = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { id } = req.params;
        const {
            task_name,
            task_type,
            required_people,
            duration_minutes,
            team_id,
            earliest_start,
            deadline,
            preferred_shift_ids,
            related_batch_id,
            trigger_operation_plan_id,
            batch_offset_days,
            operation_id,
            recurrence_rule,
            qualifications
        } = req.body;

        const [result] = await connection.execute(
            `UPDATE standalone_tasks 
       SET task_name = ?, task_type = ?, required_people = ?, duration_minutes = ?, team_id = ?,
           earliest_start = ?, deadline = ?, preferred_shift_ids = ?, related_batch_id = ?, 
           trigger_operation_plan_id = ?, batch_offset_days = ?, operation_id = ?, recurrence_rule = ?
       WHERE id = ?`,
            [
                task_name, task_type, required_people, duration_minutes, team_id || null,
                earliest_start || null, deadline,
                preferred_shift_ids ? JSON.stringify(preferred_shift_ids) : null,
                related_batch_id || null, trigger_operation_plan_id || null, batch_offset_days !== undefined ? batch_offset_days : 7,
                operation_id || null, recurrence_rule ? JSON.stringify(recurrence_rule) : null,
                id
            ]
        ) as any;

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Standalone task not found' });
        }

        // Update qualifications
        if (qualifications !== undefined) {
            // First delete existing
            await connection.execute('DELETE FROM standalone_task_qualifications WHERE task_id = ?', [id]);

            // Then insert new ones
            for (const qual of qualifications) {
                await connection.execute(
                    `INSERT INTO standalone_task_qualifications 
           (task_id, position_number, qualification_id, min_level, is_mandatory)
           VALUES (?, ?, ?, ?, ?)`,
                    [id, qual.position_number || 1, qual.qualification_id, qual.min_level || 1, qual.is_mandatory !== false]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Standalone task updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating standalone task:', error);
        res.status(500).json({ error: 'Failed to update standalone task' });
    } finally {
        connection.release();
    }
};

// 5. Delete Task
export const deleteTask = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute('DELETE FROM standalone_tasks WHERE id = ?', [id]) as any;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Standalone task not found' });
        }

        res.json({ message: 'Standalone task deleted successfully' });
    } catch (error) {
        console.error('Error deleting standalone task:', error);
        res.status(500).json({ error: 'Failed to delete standalone task' });
    }
};

// 6. Complete Task
export const completeTask = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [result] = await pool.execute(
            "UPDATE standalone_tasks SET status = 'COMPLETED' WHERE id = ?",
            [id]
        ) as any;

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Standalone task not found' });
        }

        res.json({ message: 'Standalone task marked as completed' });
    } catch (error) {
        console.error('Error completing standalone task:', error);
        res.status(500).json({ error: 'Failed to complete standalone task' });
    }
};

export const generateRecurringTasks = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();
    try {
        const { target_month } = req.body; // e.g. "2026-03"
        if (!target_month || !/^\d{4}-\d{2}$/.test(target_month)) {
            return res.status(400).json({ error: 'Invalid target_month format (YYYY-MM)' });
        }

        await connection.beginTransaction();

        // Generate task codes within the same transaction/connection so each newly
        // inserted instance advances the sequence and does not reuse stale values.
        const [codeRows] = await connection.execute(
            'SELECT task_code FROM standalone_tasks ORDER BY task_code DESC LIMIT 1 FOR UPDATE'
        ) as any;
        let nextTaskNumber = 1;
        if (codeRows.length > 0) {
            const lastCode = String(codeRows[0].task_code || '');
            const parsed = parseInt(lastCode.split('-')[1], 10);
            if (!Number.isNaN(parsed)) {
                nextTaskNumber = parsed + 1;
            }
        }
        const allocateTaskCode = (): string => {
            const taskCode = `ST-${nextTaskNumber.toString().padStart(5, '0')}`;
            nextTaskNumber += 1;
            return taskCode;
        };

        // 1. Fetch all recurring tasks
        const [recurringTasks] = await connection.execute(
            `SELECT * FROM standalone_tasks WHERE task_type = 'RECURRING'`
        ) as any[];

        let generatedCount = 0;
        const startOfMonth = dayjs(`${target_month}-01`);
        const daysInMonth = startOfMonth.daysInMonth();

        for (const rTask of recurringTasks) {
            if (!rTask.recurrence_rule) continue;
            let rule;
            try {
                rule = typeof rTask.recurrence_rule === 'string'
                    ? JSON.parse(rTask.recurrence_rule)
                    : rTask.recurrence_rule;
            } catch (e) {
                console.warn(`Invalid recurrence rule for task ${rTask.id}`);
                continue;
            }

            const freq = rule.freq || 'WEEKLY';
            const intervalRaw = Number(rule.interval);
            const interval = Number.isFinite(intervalRaw) && intervalRaw > 0 ? Math.floor(intervalRaw) : 1;
            // Keep recurring instances deterministic by default: same-day execution window.
            // If business needs a flexible window, pass recurrence_rule.window_days explicitly.
            const windowDaysRaw = Number(rule.window_days ?? rule.windowDays);
            const windowDays = Number.isFinite(windowDaysRaw) && windowDaysRaw >= 0
                ? Math.floor(windowDaysRaw)
                : 0;
            const targetDays = new Set(rule.days || []);

            const generateDates: string[] = [];

            // Simple generator logic for standard patterns
            for (let day = 1; day <= daysInMonth; day++) {
                const currentDate = startOfMonth.date(day);
                let hit = false;

                if (freq === 'WEEKLY') {
                    // dayjs day(): 0 (Sun) - 6 (Sat)
                    // rule days: 1 (Mon) - 7 (Sun)
                    let djsDay: number = currentDate.day();
                    if (djsDay === 0) djsDay = 7;
                    if (targetDays.has(djsDay)) hit = true;
                } else if (freq === 'MONTHLY') {
                    if (targetDays.has(day)) hit = true;
                } else if (freq === 'DAILY') {
                    // naive check interval
                    if (day % interval === 0) hit = true;
                }

                if (hit) {
                    generateDates.push(currentDate.format('YYYY-MM-DD'));
                }
            }

            // Generate FLEXIBLE instances for each hit
            for (const gDate of generateDates) {
                const earliestStart = gDate;
                const deadline = dayjs(gDate).add(windowDays, 'day').format('YYYY-MM-DD');
                const taskName = `${rTask.task_name} (${gDate})`;
                const taskCode = allocateTaskCode();

                const [result] = await connection.execute(
                    `INSERT INTO standalone_tasks 
                    (task_code, task_name, task_type, required_people, duration_minutes, team_id,
                     earliest_start, deadline, preferred_shift_ids, related_batch_id, operation_id)
                    VALUES (?, ?, 'FLEXIBLE', ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        taskCode, taskName, rTask.required_people, rTask.duration_minutes,
                        rTask.team_id, earliestStart, deadline,
                        rTask.preferred_shift_ids ? JSON.stringify(rTask.preferred_shift_ids) : null,
                        rTask.related_batch_id, rTask.operation_id
                    ]
                ) as any;

                const newTaskId = result.insertId;

                // Copy qualifications
                const [qualRows] = await connection.execute(
                    `SELECT position_number, qualification_id, min_level, is_mandatory
                     FROM standalone_task_qualifications WHERE task_id = ?`,
                    [rTask.id]
                ) as any[];

                for (const qual of qualRows) {
                    await connection.execute(
                        `INSERT INTO standalone_task_qualifications 
                         (task_id, position_number, qualification_id, min_level, is_mandatory)
                         VALUES (?, ?, ?, ?, ?)`,
                        [newTaskId, qual.position_number, qual.qualification_id, qual.min_level, qual.is_mandatory]
                    );
                }
                generatedCount++;
            }
        }

        await connection.commit();
        res.json({ message: 'Recurring tasks generated successfully', generated_count: generatedCount });
    } catch (error) {
        await connection.rollback();
        console.error('Error generating recurring tasks:', error);
        res.status(500).json({ error: 'Failed to generate recurring tasks' });
    } finally {
        connection.release();
    }
};

// 8. Get Assignments (for Gantt view)
export const getAssignments = async (req: Request, res: Response) => {
    try {
        const { month } = req.query; // YYYY-MM
        let startDate: string, endDate: string;

        if (month && typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
            startDate = dayjs(month).startOf('month').format('YYYY-MM-DD');
            endDate = dayjs(month).endOf('month').format('YYYY-MM-DD');
        } else {
            startDate = dayjs().startOf('month').format('YYYY-MM-DD');
            endDate = dayjs().endOf('month').format('YYYY-MM-DD');
        }

        const [rows] = await pool.execute(
            `SELECT sta.*, e.employee_name, sd.shift_name, sd.start_time, sd.end_time
             FROM standalone_task_assignments sta
             LEFT JOIN employees e ON sta.employee_id = e.id
             LEFT JOIN shift_definitions sd ON sta.assigned_shift_id = sd.id
             WHERE sta.assigned_date BETWEEN ? AND ?`,
            [startDate, endDate]
        ) as any;

        res.json(rows);
    } catch (error) {
        console.error('Error fetching assignments:', error);
        res.status(500).json({ error: 'Failed to fetch assignments' });
    }
};
