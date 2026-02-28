/**
 * 独立操作控制器
 * 处理不属于任何批次的独立操作（如监控班次）
 */

import { Request, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/database';
import dayjs from 'dayjs';
import crypto from 'crypto';

// 简单 UUID 生成器
const generateUUID = (): string => {
    return crypto.randomUUID();
};

// 获取或创建虚拟批次ID
const getIndependentBatchId = async (): Promise<number> => {
    // 先查询是否存在
    const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM production_batch_plans WHERE batch_code = 'INDEPENDENT' LIMIT 1`
    );

    if (rows.length > 0) {
        return rows[0].id;
    }

    // 不存在则自动创建
    const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO production_batch_plans (
            batch_code, batch_name, template_id, plan_status, 
            planned_start_date, planned_end_date
        ) VALUES (
            'INDEPENDENT', '独立操作', NULL, 'ACTIVATED',
            CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR)
        )`
    );

    console.log('Created virtual batch INDEPENDENT with id:', result.insertId);
    return result.insertId;
};

/**
 * 批量创建独立操作
 */
export const batchCreateIndependentOperations = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        const {
            date_range,
            step_days = 1,
            slots,
            share_pairs = []
        } = req.body;

        // 验证输入
        if (!date_range?.start || !date_range?.end || !slots?.length) {
            return res.status(400).json({ error: 'date_range and slots are required' });
        }

        await connection.beginTransaction();

        const batchPlanId = await getIndependentBatchId();
        const generationGroupId = generateUUID();
        const createdOperationIds: number[] = [];

        // 日期范围
        const startDate = dayjs(date_range.start);
        const endDate = dayjs(date_range.end);
        const totalDays = endDate.diff(startDate, 'day') + 1;

        // 按步长遍历每一天
        for (let dayOffset = 0; dayOffset < totalDays; dayOffset += step_days) {
            const baseDate = startDate.add(dayOffset, 'day');

            // 存储当天各时段创建的操作ID（用于创建约束）
            const dayOperationIds: number[] = [];

            // 创建各时段操作
            for (const slot of slots) {
                const slotDayOffset = slot.day_offset || 0;
                const actualDate = baseDate.add(slotDayOffset, 'day');

                // 解析时间
                const [startHour, startMin] = slot.start.split(':').map(Number);
                const [endHour, endMin] = slot.end.split(':').map(Number);

                let plannedStart = actualDate.hour(startHour).minute(startMin).second(0);
                let plannedEnd = actualDate.hour(endHour).minute(endMin).second(0);

                // 如果结束时间在次日
                if (slot.end_next_day || endHour < startHour) {
                    plannedEnd = plannedEnd.add(1, 'day');
                }

                const durationHours = plannedEnd.diff(plannedStart, 'minute') / 60;

                // 插入操作（窗口时间等于计划时间，即无灵活窗口）
                const [result] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO batch_operation_plans (
                        batch_plan_id,
                        template_schedule_id,
                        operation_id,
                        planned_start_datetime,
                        planned_end_datetime,
                        planned_duration,
                        window_start_datetime,
                        window_end_datetime,
                        required_people,
                        is_independent,
                        generation_group_id,
                        notes
                    ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                    [
                        batchPlanId,
                        slot.operation_id,
                        plannedStart.format('YYYY-MM-DD HH:mm:ss'),
                        plannedEnd.format('YYYY-MM-DD HH:mm:ss'),
                        durationHours,
                        plannedStart.format('YYYY-MM-DD HH:mm:ss'),  // window_start = planned_start
                        plannedEnd.format('YYYY-MM-DD HH:mm:ss'),    // window_end = planned_end
                        slot.people || 1,
                        generationGroupId,
                        slot.notes || null
                    ]
                );

                createdOperationIds.push(result.insertId);
                dayOperationIds.push(result.insertId);
            }

            // 创建人员共享约束
            for (const pair of share_pairs) {
                const [fromIdx, toIdx] = pair;
                if (fromIdx < dayOperationIds.length && toIdx < dayOperationIds.length) {
                    const fromOpId = dayOperationIds[fromIdx];
                    const toOpId = dayOperationIds[toIdx];

                    await connection.execute(
                        `INSERT INTO batch_operation_constraints (
                            batch_plan_id,
                            batch_operation_plan_id,
                            predecessor_batch_operation_plan_id,
                            constraint_type,
                            time_lag,
                            constraint_name
                        ) VALUES (?, ?, ?, 1, 0, ?)`,
                        [
                            batchPlanId,
                            toOpId,
                            fromOpId,
                            '人员共享'
                        ]
                    );
                }
            }
        }

        await connection.commit();

        res.json({
            success: true,
            created_count: createdOperationIds.length,
            generation_group_id: generationGroupId,
            operation_plan_ids: createdOperationIds
        });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error creating independent operations:', error);
        res.status(500).json({ error: error.message || 'Failed to create operations' });
    } finally {
        connection.release();
    }
};

/**
 * 获取独立操作列表
 */
export const getIndependentOperations = async (req: Request, res: Response) => {
    try {
        const { start_date, end_date } = req.query;

        let query = `
            SELECT 
                bop.id AS operation_plan_id,
                bop.operation_id,
                o.operation_name,
                o.operation_code,
                bop.planned_start_datetime,
                bop.planned_end_datetime,
                bop.planned_duration,
                bop.required_people,
                bop.generation_group_id,
                bop.notes,
                bop.created_at
            FROM batch_operation_plans bop
            JOIN operations o ON bop.operation_id = o.id
            WHERE bop.is_independent = 1
        `;

        const params: any[] = [];

        if (start_date) {
            query += ' AND bop.planned_start_datetime >= ?';
            params.push(start_date);
        }

        if (end_date) {
            query += ' AND bop.planned_start_datetime <= ?';
            params.push(end_date);
        }

        query += ' ORDER BY bop.planned_start_datetime ASC';

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);

        res.json(rows);
    } catch (error: any) {
        console.error('Error fetching independent operations:', error);
        res.status(500).json({ error: 'Failed to fetch operations' });
    }
};

/**
 * 删除独立操作（按组删除）
 */
export const deleteIndependentOperationsByGroup = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        const { groupId } = req.params;

        if (!groupId) {
            return res.status(400).json({ error: 'groupId is required' });
        }

        await connection.beginTransaction();

        // 先删除相关约束
        await connection.execute(
            `DELETE boc FROM batch_operation_constraints boc
             JOIN batch_operation_plans bop ON boc.batch_operation_plan_id = bop.id
             WHERE bop.generation_group_id = ?`,
            [groupId]
        );

        await connection.execute(
            `DELETE boc FROM batch_operation_constraints boc
             JOIN batch_operation_plans bop ON boc.predecessor_batch_operation_plan_id = bop.id
             WHERE bop.generation_group_id = ?`,
            [groupId]
        );

        // 删除操作
        const [result] = await connection.execute<ResultSetHeader>(
            `DELETE FROM batch_operation_plans WHERE generation_group_id = ?`,
            [groupId]
        );

        await connection.commit();

        res.json({
            success: true,
            deleted_count: result.affectedRows
        });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error deleting independent operations:', error);
        res.status(500).json({ error: 'Failed to delete operations' });
    } finally {
        connection.release();
    }
};

/**
 * 删除单个独立操作
 */
export const deleteIndependentOperation = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 验证是独立操作
        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT is_independent FROM batch_operation_plans WHERE id = ?`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Operation not found' });
        }

        if (!rows[0].is_independent) {
            return res.status(400).json({ error: 'Cannot delete non-independent operation' });
        }

        await pool.execute(
            `DELETE FROM batch_operation_plans WHERE id = ? AND is_independent = 1`,
            [id]
        );

        res.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting independent operation:', error);
        res.status(500).json({ error: 'Failed to delete operation' });
    }
};
