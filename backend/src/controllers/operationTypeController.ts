import { Request, Response } from 'express';
import pool from '../config/database';

/**
 * 获取所有操作类型
 * GET /api/operation-types
 * Query params: team_id, team_code
 */
export const getAllOperationTypes = async (req: Request, res: Response) => {
    try {
        const { team_id, team_code } = req.query;

        let query = `
      SELECT ot.*, ou.unit_code as team_code, ou.unit_name as team_name
      FROM operation_types ot
      JOIN organization_units ou ON ot.team_id = ou.id
      WHERE ot.is_active = TRUE
    `;
        const params: any[] = [];

        if (team_id) {
            query += ' AND ot.team_id = ?';
            params.push(team_id);
        } else if (team_code) {
            query += ' AND ou.unit_code = ?';
            params.push(team_code);
        }

        query += ' ORDER BY ou.sort_order, ot.display_order';

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching operation types:', error);
        res.status(500).json({ error: 'Failed to fetch operation types' });
    }
};

/**
 * 获取按 Team 分组的操作类型
 * GET /api/operation-types/grouped
 */
export const getOperationTypesGroupedByTeam = async (req: Request, res: Response) => {
    try {
        const [rows] = await pool.execute(`
      SELECT 
        ou.id as team_id, ou.unit_code as team_code, ou.unit_name as team_name,
        ot.id, ot.type_code, ot.type_name, ot.color, ot.display_order
      FROM operation_types ot
      JOIN organization_units ou ON ot.team_id = ou.id
      WHERE ot.is_active = TRUE AND ou.unit_type = 'TEAM'
      ORDER BY ou.sort_order, ot.display_order
    `);

        // 按 team 分组
        const grouped = (rows as any[]).reduce((acc, row) => {
            if (!acc[row.team_code]) {
                acc[row.team_code] = { team_id: row.team_id, team_name: row.team_name, types: [] };
            }
            acc[row.team_code].types.push({
                id: row.id,
                type_code: row.type_code,
                type_name: row.type_name,
                color: row.color,
                display_order: row.display_order
            });
            return acc;
        }, {} as Record<string, any>);

        res.json(grouped);
    } catch (error) {
        console.error('Error fetching grouped operation types:', error);
        res.status(500).json({ error: 'Failed to fetch operation types' });
    }
};

/**
 * 获取单个操作类型
 * GET /api/operation-types/:id
 */
export const getOperationTypeById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.execute(`
      SELECT ot.*, ou.unit_code as team_code, ou.unit_name as team_name
      FROM operation_types ot
      JOIN organization_units ou ON ot.team_id = ou.id
      WHERE ot.id = ?
    `, [id]) as any;

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Operation type not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching operation type:', error);
        res.status(500).json({ error: 'Failed to fetch operation type' });
    }
};

/**
 * 创建新操作类型
 * POST /api/operation-types
 */
export const createOperationType = async (req: Request, res: Response) => {
    try {
        const { type_code, type_name, team_id, color, display_order, category } = req.body;

        if (!type_code || !type_name || !team_id) {
            return res.status(400).json({ error: 'type_code, type_name, and team_id are required' });
        }

        // 检查 type_code 是否已存在
        const [existing] = await pool.execute(
            'SELECT id FROM operation_types WHERE type_code = ?',
            [type_code]
        ) as any;

        if (existing.length > 0) {
            return res.status(409).json({ error: 'Type code already exists' });
        }

        const [result] = await pool.execute(
            `INSERT INTO operation_types (type_code, type_name, team_id, color, category, display_order) 
       VALUES (?, ?, ?, ?, ?, ?)`,
            [type_code, type_name, team_id, color || '#1890ff', category || 'PROCESS', display_order || 0]
        ) as any;

        res.status(201).json({
            id: result.insertId,
            message: 'Operation type created successfully'
        });
    } catch (error) {
        console.error('Error creating operation type:', error);
        res.status(500).json({ error: 'Failed to create operation type' });
    }
};

/**
 * 更新操作类型
 * PUT /api/operation-types/:id
 */
export const updateOperationType = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { type_code, type_name, team_id, color, display_order, category, is_active } = req.body;

        const updates: string[] = [];
        const params: any[] = [];

        if (type_code !== undefined) { updates.push('type_code = ?'); params.push(type_code); }
        if (type_name !== undefined) { updates.push('type_name = ?'); params.push(type_name); }
        if (team_id !== undefined) { updates.push('team_id = ?'); params.push(team_id); }
        if (color !== undefined) { updates.push('color = ?'); params.push(color); }
        if (category !== undefined) { updates.push('category = ?'); params.push(category); }
        if (display_order !== undefined) { updates.push('display_order = ?'); params.push(display_order); }
        if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(id);
        await pool.execute(`UPDATE operation_types SET ${updates.join(', ')} WHERE id = ?`, params);

        res.json({ message: 'Operation type updated successfully' });
    } catch (error) {
        console.error('Error updating operation type:', error);
        res.status(500).json({ error: 'Failed to update operation type' });
    }
};

/**
 * 删除（停用）操作类型
 * DELETE /api/operation-types/:id
 */
export const deleteOperationType = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // 检查是否有关联的 operations
        const [usageCheck] = await pool.execute(
            'SELECT COUNT(*) as count FROM operations WHERE operation_type_id = ?',
            [id]
        ) as any;

        if (usageCheck[0].count > 0) {
            // 软删除
            await pool.execute('UPDATE operation_types SET is_active = FALSE WHERE id = ?', [id]);
            return res.json({ message: 'Operation type deactivated (has associated operations)' });
        }

        // 硬删除
        await pool.execute('DELETE FROM operation_types WHERE id = ?', [id]);
        res.json({ message: 'Operation type deleted successfully' });
    } catch (error) {
        console.error('Error deleting operation type:', error);
        res.status(500).json({ error: 'Failed to delete operation type' });
    }
};
