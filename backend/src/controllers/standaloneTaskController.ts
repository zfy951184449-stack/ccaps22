import { Request, Response } from 'express';
import pool from '../config/database';
import dayjs from 'dayjs';
import {
    buildRecurringTaskDates,
    getRecurringWindowDays,
    StandaloneRecurrenceRule,
    validateStandaloneRecurrenceRule,
} from '../services/standaloneTaskRecurrence';

const MYSQL_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
const MYSQL_DATE_FORMAT = 'YYYY-MM-DD';

type TaskType = 'RECURRING' | 'FLEXIBLE' | 'AD_HOC';

interface NormalizedTaskWindow {
    earliestStart: string | null;
    deadline: string;
    durationMinutes: number;
}

const isValidTaskType = (value: unknown): value is TaskType => (
    value === 'RECURRING' || value === 'FLEXIBLE' || value === 'AD_HOC'
);

const parsePositiveInteger = (value: unknown, fallback?: number): number | null => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback ?? null;
    }
    return parsed;
};

const parseRequiredPeople = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') {
        return 1;
    }
    return parsePositiveInteger(value);
};

const formatDateTimeForClient = (value: unknown): string | null => {
    if (!value) return null;
    if (value instanceof Date) {
        const pad2 = (next: number) => next.toString().padStart(2, '0');
        return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
    }

    const text = String(value).trim();
    const match = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::(\d{2}))?)?/);
    if (!match) return text;

    if (!match[2]) return match[1];
    return `${match[1]} ${match[2]}:${match[3] ?? '00'}`;
};

const formatTaskRowForClient = (row: any) => ({
    ...row,
    earliest_start: formatDateTimeForClient(row.earliest_start),
    deadline: formatDateTimeForClient(row.deadline),
});

const normalizeWindowStart = (value: unknown): string => {
    const parsed = dayjs(value as any);
    return parsed.isValid() ? parsed.startOf('day').format(MYSQL_DATETIME_FORMAT) : String(value);
};

const normalizeWindowEnd = (value: unknown): string => {
    const parsed = dayjs(value as any);
    return parsed.isValid() ? parsed.endOf('day').format(MYSQL_DATETIME_FORMAT) : String(value);
};

const normalizeStandaloneTaskWindow = (
    taskType: TaskType,
    earliestStartRaw: unknown,
    deadlineRaw: unknown,
    durationMinutesRaw: unknown,
): { window?: NormalizedTaskWindow; error?: string } => {
    if (taskType === 'RECURRING') {
        const durationMinutes = parsePositiveInteger(durationMinutesRaw);
        if (!durationMinutes) {
            return { error: 'duration_minutes must be a positive integer' };
        }
        return {
            window: {
                earliestStart: null,
                deadline: deadlineRaw ? String(deadlineRaw) : '2099-12-31',
                durationMinutes,
            },
        };
    }

    if (!earliestStartRaw || !deadlineRaw) {
        return { error: 'earliest_start and deadline are required for standalone task instances' };
    }

    const earliestStart = dayjs(earliestStartRaw as any);
    const deadline = dayjs(deadlineRaw as any);
    if (!earliestStart.isValid() || !deadline.isValid()) {
        return { error: 'Invalid earliest_start or deadline' };
    }
    if (!deadline.isAfter(earliestStart)) {
        return { error: 'deadline must be after earliest_start' };
    }

    if (taskType === 'AD_HOC') {
        const durationMinutes = deadline.diff(earliestStart, 'minute');
        return {
            window: {
                earliestStart: earliestStart.format(MYSQL_DATETIME_FORMAT),
                deadline: deadline.format(MYSQL_DATETIME_FORMAT),
                durationMinutes,
            },
        };
    }

    const durationMinutes = parsePositiveInteger(durationMinutesRaw);
    if (!durationMinutes) {
        return { error: 'duration_minutes must be a positive integer' };
    }

    return {
        window: {
            earliestStart: earliestStart.format(MYSQL_DATE_FORMAT),
            deadline: deadline.format(MYSQL_DATE_FORMAT),
            durationMinutes,
        },
    };
};

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
        const { status, type, deadline_before, earliest_start_after, window_start, window_end } = req.query;

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
        if (window_start && window_end) {
            query += ` AND st.earliest_start <= ? AND st.deadline >= ?`;
            params.push(normalizeWindowEnd(window_end), normalizeWindowStart(window_start));
        } else {
            if (deadline_before) {
                query += ` AND st.deadline <= ?`;
                params.push(normalizeWindowEnd(deadline_before));
            }
            if (earliest_start_after) {
                query += ` AND st.earliest_start >= ?`;
                params.push(normalizeWindowStart(earliest_start_after));
            }
        }

        query += ` ORDER BY st.deadline ASC`;

        const [rows] = await pool.execute(query, params) as any;

        res.json(rows.map(formatTaskRowForClient));
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

        const task = formatTaskRowForClient(rows[0]);

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
            allowed_employee_ids,
            related_batch_id,
            trigger_operation_plan_id,
            batch_offset_days,
            operation_id,
            recurrence_rule,
            qualifications // array of { position_number, qualification_id, min_level, is_mandatory }
        } = req.body;

        if (!task_name || !isValidTaskType(task_type)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const requiredPeople = parseRequiredPeople(required_people);
        if (!requiredPeople) {
            await connection.rollback();
            return res.status(400).json({ error: 'required_people must be a positive integer' });
        }

        const { window, error: windowError } = normalizeStandaloneTaskWindow(
            task_type,
            earliest_start,
            deadline,
            duration_minutes,
        );
        if (!window) {
            await connection.rollback();
            return res.status(400).json({ error: windowError || 'Invalid task window' });
        }

        if (task_type === 'RECURRING') {
            const recurrenceError = validateStandaloneRecurrenceRule(recurrence_rule);
            if (recurrenceError) {
                await connection.rollback();
                return res.status(400).json({ error: recurrenceError });
            }
        }

        const task_code = await generateNextTaskCode(connection);

        const [result] = await connection.execute(
            `INSERT INTO standalone_tasks 
       (task_code, task_name, task_type, required_people, duration_minutes, team_id,
        earliest_start, deadline, preferred_shift_ids, allowed_employee_ids, related_batch_id,
        trigger_operation_plan_id, batch_offset_days, operation_id, recurrence_rule)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                task_code, task_name, task_type, requiredPeople, window.durationMinutes,
                team_id || null, window.earliestStart, window.deadline,
                preferred_shift_ids ? JSON.stringify(preferred_shift_ids) : null,
                allowed_employee_ids ? JSON.stringify(allowed_employee_ids) : null,
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
            allowed_employee_ids,
            related_batch_id,
            trigger_operation_plan_id,
            batch_offset_days,
            operation_id,
            recurrence_rule,
            qualifications
        } = req.body;

        if (!task_name || !isValidTaskType(task_type)) {
            await connection.rollback();
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const requiredPeople = parseRequiredPeople(required_people);
        if (!requiredPeople) {
            await connection.rollback();
            return res.status(400).json({ error: 'required_people must be a positive integer' });
        }

        const { window, error: windowError } = normalizeStandaloneTaskWindow(
            task_type,
            earliest_start,
            deadline,
            duration_minutes,
        );
        if (!window) {
            await connection.rollback();
            return res.status(400).json({ error: windowError || 'Invalid task window' });
        }

        if (task_type === 'RECURRING') {
            const recurrenceError = validateStandaloneRecurrenceRule(recurrence_rule);
            if (recurrenceError) {
                await connection.rollback();
                return res.status(400).json({ error: recurrenceError });
            }
        }

        const [result] = await connection.execute(
            `UPDATE standalone_tasks 
       SET task_name = ?, task_type = ?, required_people = ?, duration_minutes = ?, team_id = ?,
           earliest_start = ?, deadline = ?, preferred_shift_ids = ?, allowed_employee_ids = ?, related_batch_id = ?,
           trigger_operation_plan_id = ?, batch_offset_days = ?, operation_id = ?, recurrence_rule = ?
       WHERE id = ?`,
            [
                task_name, task_type, requiredPeople, window.durationMinutes, team_id || null,
                window.earliestStart, window.deadline,
                preferred_shift_ids ? JSON.stringify(preferred_shift_ids) : null,
                allowed_employee_ids ? JSON.stringify(allowed_employee_ids) : null,
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

// 6.1 Batch Delete Tasks
export const batchDeleteTasks = async (req: Request, res: Response) => {
    try {
        const { ids } = req.body; // number[]
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        const placeholders = ids.map(() => '?').join(',');
        const [result] = await pool.execute(
            `DELETE FROM standalone_tasks WHERE id IN (${placeholders})`,
            ids
        ) as any;

        res.json({ message: `Deleted ${result.affectedRows} tasks`, deleted_count: result.affectedRows });
    } catch (error) {
        console.error('Error batch deleting tasks:', error);
        res.status(500).json({ error: 'Failed to batch delete tasks' });
    }
};

// 6.2 Delete all generated instances of a RECURRING template
export const deleteTemplateInstances = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { target_month } = req.body; // optional YYYY-MM

        // First get the template name
        const [rows] = await pool.execute(
            `SELECT task_name FROM standalone_tasks WHERE id = ? AND task_type = 'RECURRING'`,
            [id]
        ) as any;

        if (rows.length === 0) {
            return res.status(404).json({ error: 'RECURRING template not found' });
        }

        const templateName = rows[0].task_name;
        let query = `DELETE FROM standalone_tasks WHERE task_type = 'FLEXIBLE' AND task_name LIKE CONCAT(?, ' (%)')`;
        const params: any[] = [templateName];

        if (target_month && /^\d{4}-\d{2}$/.test(target_month)) {
            query += ` AND task_name LIKE CONCAT(?, ' (', ?, '%)')`;
            params.push(templateName, target_month);
            // Overwrite query to use more precise match
            query = `DELETE FROM standalone_tasks WHERE task_type = 'FLEXIBLE' AND task_name LIKE CONCAT(?, ' (', ?, '%)')`;
            params.length = 0;
            params.push(templateName, target_month);
        }

        const [result] = await pool.execute(query, params) as any;

        res.json({
            message: `Deleted ${result.affectedRows} instances of "${templateName}"`,
            deleted_count: result.affectedRows,
        });
    } catch (error) {
        console.error('Error deleting template instances:', error);
        res.status(500).json({ error: 'Failed to delete template instances' });
    }
};


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
        const { target_month, template_id } = req.body; // e.g. "2026-03"
        if (!target_month || !/^\d{4}-\d{2}$/.test(target_month)) {
            return res.status(400).json({ error: 'Invalid target_month format (YYYY-MM)' });
        }

        const templateId = template_id === undefined || template_id === null || template_id === ''
            ? null
            : Number(template_id);
        if (templateId !== null && (!Number.isInteger(templateId) || templateId <= 0)) {
            return res.status(400).json({ error: 'Invalid template_id' });
        }

        await connection.beginTransaction();

        const recurringParams: any[] = [];
        let recurringQuery = `SELECT * FROM standalone_tasks WHERE task_type = 'RECURRING'`;
        if (templateId !== null) {
            recurringQuery += ` AND id = ?`;
            recurringParams.push(templateId);
        }

        const [recurringTasks] = await connection.execute(recurringQuery, recurringParams) as any[];
        if (templateId !== null && recurringTasks.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'RECURRING template not found' });
        }

        if (recurringTasks.length === 0) {
            await connection.commit();
            return res.json({ message: 'Recurring tasks generated successfully', generated_count: 0 });
        }

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

        let generatedCount = 0;
        for (const rTask of recurringTasks) {
            // [IDEMPOTENCY] Check if instances already exist for this template + month
            const [existingRows] = await connection.execute(
                `SELECT COUNT(*) as cnt FROM standalone_tasks 
                 WHERE task_type = 'FLEXIBLE' 
                   AND task_name LIKE CONCAT(?, ' (', ?, '%)')
                   AND status != 'CANCELLED'`,
                [rTask.task_name, target_month]
            ) as any;
            if (existingRows[0]?.cnt > 0) {
                console.log(`[StandaloneTask] Skipping template "${rTask.task_name}" — ${existingRows[0].cnt} instances already exist for ${target_month}`);
                continue;
            }

            if (!rTask.recurrence_rule) continue;
            let rule: StandaloneRecurrenceRule;
            try {
                rule = typeof rTask.recurrence_rule === 'string'
                    ? JSON.parse(rTask.recurrence_rule)
                    : rTask.recurrence_rule;
            } catch (e) {
                console.warn(`Invalid recurrence rule for task ${rTask.id}`);
                continue;
            }

            // Keep recurring instances deterministic by default: same-day execution window.
            // If business needs a flexible window, pass recurrence_rule.window_days explicitly.
            const windowDays = getRecurringWindowDays(rule);
            const generateDates = buildRecurringTaskDates(rule, target_month);

            // Generate FLEXIBLE instances for each hit
            for (const gDate of generateDates) {
                const earliestStart = gDate;
                const deadline = dayjs(gDate).add(windowDays, 'day').format('YYYY-MM-DD');
                const taskName = `${rTask.task_name} (${gDate})`;
                const taskCode = allocateTaskCode();
                const preferredShiftIds = rTask.preferred_shift_ids
                    ? (typeof rTask.preferred_shift_ids === 'string'
                        ? rTask.preferred_shift_ids
                        : JSON.stringify(rTask.preferred_shift_ids))
                    : null;
                const allowedEmployeeIds = rTask.allowed_employee_ids
                    ? (typeof rTask.allowed_employee_ids === 'string'
                        ? rTask.allowed_employee_ids
                        : JSON.stringify(rTask.allowed_employee_ids))
                    : null;

                const [result] = await connection.execute(
                    `INSERT INTO standalone_tasks 
                    (task_code, task_name, task_type, required_people, duration_minutes, team_id,
                     earliest_start, deadline, preferred_shift_ids, allowed_employee_ids, related_batch_id, operation_id)
                    VALUES (?, ?, 'FLEXIBLE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        taskCode, taskName, rTask.required_people, rTask.duration_minutes,
                        rTask.team_id, earliestStart, deadline,
                        preferredShiftIds, allowedEmployeeIds,
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
