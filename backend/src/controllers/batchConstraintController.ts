/**
 * Batch Constraint Controller
 * 
 * 批次约束 CRUD 操作
 */

import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';

// 获取批次操作的约束
export const getBatchOperationConstraints = async (req: Request, res: Response) => {
    try {
        const { operationPlanId } = req.params;
        const id = Number(operationPlanId);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid operation plan id' });
        }

        // 前置约束（当前操作依赖的）
        const predecessorQuery = `
            SELECT 
                boc.id AS constraint_id,
                boc.predecessor_batch_operation_plan_id AS related_schedule_id,
                o.operation_name AS related_operation_name,
                o.operation_code AS related_operation_code,
                boc.constraint_type,
                boc.time_lag AS lag_time,
                boc.lag_type,
                boc.lag_min,
                boc.lag_max,
                boc.share_mode,
                boc.constraint_level,
                'predecessor' AS relation_type
            FROM batch_operation_constraints boc
            JOIN batch_operation_plans bop ON boc.predecessor_batch_operation_plan_id = bop.id
            JOIN operations o ON bop.operation_id = o.id
            WHERE boc.batch_operation_plan_id = ?
        `;

        // 后续约束（依赖当前操作的）
        const successorQuery = `
            SELECT 
                boc.id AS constraint_id,
                boc.batch_operation_plan_id AS related_schedule_id,
                o.operation_name AS related_operation_name,
                o.operation_code AS related_operation_code,
                boc.constraint_type,
                boc.time_lag AS lag_time,
                boc.lag_type,
                boc.lag_min,
                boc.lag_max,
                boc.share_mode,
                boc.constraint_level,
                'successor' AS relation_type
            FROM batch_operation_constraints boc
            JOIN batch_operation_plans bop ON boc.batch_operation_plan_id = bop.id
            JOIN operations o ON bop.operation_id = o.id
            WHERE boc.predecessor_batch_operation_plan_id = ?
        `;

        const [predecessors] = await pool.execute<RowDataPacket[]>(predecessorQuery, [id]);
        const [successors] = await pool.execute<RowDataPacket[]>(successorQuery, [id]);

        res.json({ predecessors, successors });
    } catch (error) {
        console.error('Error fetching batch operation constraints:', error);
        res.status(500).json({ error: 'Failed to fetch batch operation constraints' });
    }
};

// 创建批次约束
export const createBatchConstraint = async (req: Request, res: Response) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const {
            batch_plan_id,
            from_operation_plan_id,
            to_operation_plan_id,
            constraint_type,
            constraint_level = 1,
            lag_time = 0,
            lag_type = 'FIXED',
            lag_min = 0,
            lag_max = null,
            share_mode = 'NONE',
            constraint_name,
            description
        } = req.body;

        // 检查循环依赖
        const [existing] = await connection.execute<RowDataPacket[]>(
            'SELECT 1 FROM batch_operation_constraints WHERE batch_operation_plan_id = ? AND predecessor_batch_operation_plan_id = ?',
            [to_operation_plan_id, from_operation_plan_id]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Would create circular dependency' });
        }

        const insertQuery = `
            INSERT INTO batch_operation_constraints (
                batch_plan_id,
                batch_operation_plan_id,
                predecessor_batch_operation_plan_id,
                constraint_type,
                constraint_level,
                time_lag,
                lag_type,
                lag_min,
                lag_max,
                share_mode,
                constraint_name,
                description
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result]: any = await connection.execute(insertQuery, [
            batch_plan_id,
            from_operation_plan_id,
            to_operation_plan_id,
            constraint_type,
            constraint_level,
            lag_time,
            lag_type,
            lag_min,
            lag_max,
            share_mode,
            constraint_name || null,
            description || null
        ]);

        await connection.commit();
        res.status(201).json({
            id: result.insertId,
            message: 'Batch constraint created successfully'
        });
    } catch (error: any) {
        await connection.rollback();
        console.error('Error creating batch constraint:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Constraint already exists' });
        } else {
            res.status(500).json({ error: 'Failed to create batch constraint' });
        }
    } finally {
        connection.release();
    }
};

// 更新批次约束
export const updateBatchConstraint = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const {
            constraint_type,
            constraint_level,
            lag_time,
            lag_type,
            lag_min,
            lag_max,
            share_mode,
            constraint_name,
            description
        } = req.body;

        const updateQuery = `
            UPDATE batch_operation_constraints 
            SET constraint_type = ?,
                constraint_level = ?,
                time_lag = ?,
                lag_type = ?,
                lag_min = ?,
                lag_max = ?,
                share_mode = ?,
                constraint_name = ?,
                description = ?
            WHERE id = ?
        `;

        const [result]: any = await pool.execute(updateQuery, [
            constraint_type,
            constraint_level || 1,
            lag_time || 0,
            lag_type || 'FIXED',
            lag_min || 0,
            lag_max || null,
            share_mode || 'NONE',
            constraint_name || null,
            description || null,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Constraint not found' });
        }

        res.json({ message: 'Batch constraint updated successfully' });
    } catch (error) {
        console.error('Error updating batch constraint:', error);
        res.status(500).json({ error: 'Failed to update batch constraint' });
    }
};

// 删除批次约束
export const deleteBatchConstraint = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const [result]: any = await pool.execute(
            'DELETE FROM batch_operation_constraints WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Constraint not found' });
        }

        res.json({ message: 'Batch constraint deleted successfully' });
    } catch (error) {
        console.error('Error deleting batch constraint:', error);
        res.status(500).json({ error: 'Failed to delete batch constraint' });
    }
};

// 获取批次可用操作列表（用于创建约束时选择）
export const getBatchAvailableOperations = async (req: Request, res: Response) => {
    try {
        const { batchPlanId } = req.params;
        const { excludeOperationPlanId } = req.query;

        let query = `
            SELECT 
                bop.id AS operation_plan_id,
                o.operation_name,
                o.operation_code,
                ps.stage_name,
                bop.planned_start_datetime,
                bop.planned_end_datetime
            FROM batch_operation_plans bop
            JOIN operations o ON bop.operation_id = o.id
            LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
            LEFT JOIN process_stages ps ON sos.stage_id = ps.id
            WHERE bop.batch_plan_id = ?
        `;

        const params: any[] = [batchPlanId];

        if (excludeOperationPlanId) {
            query += ' AND bop.id != ?';
            params.push(excludeOperationPlanId);
        }

        query += ' ORDER BY bop.planned_start_datetime';

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching batch available operations:', error);
        res.status(500).json({ error: 'Failed to fetch batch available operations' });
    }
};

// 搜索批次操作（支持跨批次）
export const searchBatchOperations = async (req: Request, res: Response) => {
    try {
        const { q, excludeOperationPlanId, batchId, stageId } = req.query;

        // Base query
        let query = `
            SELECT 
                bop.id AS operation_plan_id,
                o.operation_name,
                o.operation_code,
                ps.stage_name,
                bop.planned_start_datetime,
                pbp.batch_code,
                pbp.batch_name,
                pbp.id AS batch_id,   -- Added for frontend reference
                ps.id AS stage_id     -- Added for frontend reference
            FROM batch_operation_plans bop
            JOIN operations o ON bop.operation_id = o.id
            JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
            LEFT JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
            LEFT JOIN process_stages ps ON sos.stage_id = ps.id
            WHERE 1=1
        `;

        const params: any[] = [];

        // Filter by Batch
        if (batchId) {
            query += ' AND pbp.id = ?';
            params.push(batchId);
        }

        // Filter by Stage
        if (stageId) {
            query += ' AND ps.id = ?';
            params.push(stageId);
        }

        // Filter by Search Term (Optional if browsing via tree)
        if (q && String(q).trim().length > 0) {
            const searchTerm = `%${String(q).trim()}%`;
            query += ' AND (o.operation_name LIKE ? OR o.operation_code LIKE ? OR pbp.batch_code LIKE ?)';
            params.push(searchTerm, searchTerm, searchTerm);
        }

        // Exclude self
        if (excludeOperationPlanId) {
            query += ' AND bop.id != ?';
            params.push(excludeOperationPlanId);
        }

        // Ensure active batches mostly
        // query += " AND pbp.plan_status IN ('DRAFT', 'ACTIVATED', 'PLANNED')";

        query += ' ORDER BY pbp.batch_code DESC, bop.planned_start_datetime ASC LIMIT 100';

        const [rows] = await pool.execute<RowDataPacket[]>(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error searching batch operations:', error);
        res.status(500).json({ error: 'Failed to search batch operations' });
    }
};

// 获取批次和阶段层级树（用于侧边栏筛选）
export const getBatchOperationHierarchy = async (req: Request, res: Response) => {
    try {
        // Fetch active batches and their stages
        const query = `
            SELECT DISTINCT
                pbp.id AS batch_id,
                pbp.batch_code,
                pbp.batch_name,
                ps.id AS stage_id,
                ps.stage_name,
                ps.id AS stage_seq -- approximation for ordering
            FROM production_batch_plans pbp
            JOIN batch_operation_plans bop ON pbp.id = bop.batch_plan_id
            JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
            JOIN process_stages ps ON sos.stage_id = ps.id
            WHERE pbp.plan_status IN ('DRAFT', 'ACTIVATED', 'PLANNED')
            ORDER BY pbp.batch_code DESC, ps.id ASC
        `;

        const [rows] = await pool.execute<RowDataPacket[]>(query);

        // Transform to Tree
        const batchMap = new Map<number, any>();

        rows.forEach(row => {
            if (!batchMap.has(row.batch_id)) {
                batchMap.set(row.batch_id, {
                    key: `batch-${row.batch_id}`,
                    title: `${row.batch_code} ${row.batch_name}`,
                    isLeaf: false,
                    type: 'batch',
                    id: row.batch_id,
                    children: []
                });
            }

            const batch = batchMap.get(row.batch_id);
            // Check if stage already exists (one stage usually appears once per batch, but multiple ops might link to it, DISTINCT solves row dupes but logic here is safe)
            if (row.stage_id && !batch.children.some((c: any) => c.id === row.stage_id)) {
                batch.children.push({
                    key: `batch-${row.batch_id}-stage-${row.stage_id}`,
                    title: row.stage_name,
                    isLeaf: true,
                    type: 'stage',
                    id: row.stage_id,
                    batchId: row.batch_id
                });
            }
        });

        res.json(Array.from(batchMap.values()));
    } catch (error) {
        console.error('Error fetching batch hierarchy:', error);
        res.status(500).json({ error: 'Failed to fetch batch hierarchy' });
    }
};

