import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { runConstraintValidation } from '../services/constraintValidationService';

// 获取模板的所有约束
export const getTemplateConstraints = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const query = `
      SELECT 
        oc.id AS constraint_id,
        oc.schedule_id AS from_schedule_id,
        sos1.operation_id AS from_operation_id,
        op1.operation_name AS from_operation_name,
        op1.operation_code AS from_operation_code,
        oc.predecessor_schedule_id AS to_schedule_id,
        sos2.operation_id AS to_operation_id,
        op2.operation_name AS to_operation_name,
        op2.operation_code AS to_operation_code,
        oc.constraint_type,
        CASE oc.constraint_type
            WHEN 1 THEN 'FS'
            WHEN 2 THEN 'SS'
            WHEN 3 THEN 'FF'
            WHEN 4 THEN 'SF'
        END AS constraint_type_name,
        oc.constraint_level,
        oc.time_lag AS lag_time,
        oc.share_personnel,
        oc.constraint_name,
        oc.description,
        ps1.stage_name AS from_stage,
        ps2.stage_name AS to_stage
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
      JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
      JOIN operations op1 ON sos1.operation_id = op1.id
      JOIN operations op2 ON sos2.operation_id = op2.id
      JOIN process_stages ps1 ON sos1.stage_id = ps1.id
      JOIN process_stages ps2 ON sos2.stage_id = ps2.id
      WHERE ps1.template_id = ?
      ORDER BY ps1.stage_order, sos1.operation_order
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [templateId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching template constraints:', error);
    res.status(500).json({ error: 'Failed to fetch constraints' });
  }
};

// 获取特定操作的约束
export const getOperationConstraints = async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    
    // 前置约束（当前操作依赖的）
    const predecessorQuery = `
      SELECT 
        oc.id AS constraint_id,
        oc.predecessor_schedule_id AS related_schedule_id,
        op.operation_name AS related_operation_name,
        op.operation_code AS related_operation_code,
        oc.constraint_type,
        oc.time_lag AS lag_time,
        oc.share_personnel,
        oc.constraint_level,
        oc.constraint_name,
        oc.description,
        'predecessor' AS relation_type
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos ON oc.predecessor_schedule_id = sos.id
      JOIN operations op ON sos.operation_id = op.id
      WHERE oc.schedule_id = ?
    `;
    
    // 后续约束（依赖当前操作的）
    const successorQuery = `
      SELECT 
        oc.id AS constraint_id,
        oc.schedule_id AS related_schedule_id,
        op.operation_name AS related_operation_name,
        op.operation_code AS related_operation_code,
        oc.constraint_type,
        oc.time_lag AS lag_time,
        oc.share_personnel,
        oc.constraint_level,
        oc.constraint_name,
        oc.description,
        'successor' AS relation_type
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos ON oc.schedule_id = sos.id
      JOIN operations op ON sos.operation_id = op.id
      WHERE oc.predecessor_schedule_id = ?
    `;
    
    const [predecessors] = await pool.execute<RowDataPacket[]>(predecessorQuery, [scheduleId]);
    const [successors] = await pool.execute<RowDataPacket[]>(successorQuery, [scheduleId]);
    
    res.json({
      predecessors,
      successors
    });
  } catch (error) {
    console.error('Error fetching operation constraints:', error);
    res.status(500).json({ error: 'Failed to fetch operation constraints' });
  }
};

// 创建约束
export const createConstraint = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      from_schedule_id,
      to_schedule_id,
      constraint_type,
      constraint_level = 1,
      lag_time = 0,
      share_personnel = false,
      constraint_name,
      description
    } = req.body;

    const normalizedLag = Number.isFinite(Number(lag_time)) ? Number(lag_time) : 0;
    const normalizedLevel = Number.isFinite(Number(constraint_level)) ? Number(constraint_level) : 1;
    const shareFlag = share_personnel ? 1 : 0;
    
    // 检查循环依赖
    const [existing] = await connection.execute<RowDataPacket[]>(
      'SELECT 1 FROM operation_constraints WHERE schedule_id = ? AND predecessor_schedule_id = ?',
      [to_schedule_id, from_schedule_id]
    );
    
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Would create circular dependency' });
    }
    
    // 插入约束 - 使用现有表结构
    const insertQuery = `
      INSERT INTO operation_constraints (
        schedule_id,
        predecessor_schedule_id,
        constraint_type,
        constraint_level,
        time_lag,
        share_personnel,
        constraint_name,
        description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result]: any = await connection.execute(insertQuery, [
      from_schedule_id,
      to_schedule_id,
      constraint_type,
      normalizedLevel,
      normalizedLag,
      shareFlag,
      constraint_name || null,
      description || null
    ]);
    
    await connection.commit();
    res.status(201).json({ 
      id: result.insertId, 
      message: 'Constraint created successfully' 
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error creating constraint:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Constraint already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create constraint' });
    }
  } finally {
    connection.release();
  }
};

// 更新约束
export const updateConstraint = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      constraint_type,
      constraint_level,
      lag_time,
      share_personnel,
      constraint_name,
      description
    } = req.body;

    const normalizedLag = Number.isFinite(Number(lag_time)) ? Number(lag_time) : 0;
    const normalizedLevel = Number.isFinite(Number(constraint_level)) ? Number(constraint_level) : 1;
    const shareFlag = share_personnel ? 1 : 0;
    
    const updateQuery = `
      UPDATE operation_constraints 
      SET constraint_type = ?,
          constraint_level = ?,
          time_lag = ?,
          share_personnel = ?,
          constraint_name = ?,
          description = ?
      WHERE id = ?
    `;
    
    const [result]: any = await pool.execute(updateQuery, [
      constraint_type,
      normalizedLevel,
      normalizedLag,
      shareFlag,
      constraint_name || null,
      description || null,
      id
    ]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Constraint not found' });
    }
    
    res.json({ message: 'Constraint updated successfully' });
  } catch (error) {
    console.error('Error updating constraint:', error);
    res.status(500).json({ error: 'Failed to update constraint' });
  }
};

// 删除约束
export const deleteConstraint = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const [result]: any = await pool.execute(
      'DELETE FROM operation_constraints WHERE id = ?',
      [id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Constraint not found' });
    }
    
    res.json({ message: 'Constraint deleted successfully' });
  } catch (error) {
    console.error('Error deleting constraint:', error);
    res.status(500).json({ error: 'Failed to delete constraint' });
  }
};

// 获取模板的所有约束关系（用于甘特图显示）
export const getTemplateConstraintsForGantt = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const query = `
      SELECT 
        oc.id as constraint_id,
        oc.schedule_id as from_schedule_id,
        sos1.operation_id as from_operation_id,
        op1.operation_name as from_operation_name,
        op1.operation_code as from_operation_code,
        oc.predecessor_schedule_id as to_schedule_id,
        sos2.operation_id as to_operation_id,
        op2.operation_name as to_operation_name,
        op2.operation_code as to_operation_code,
        oc.constraint_type,
        oc.time_lag as lag_time,
        oc.share_personnel,
        oc.constraint_level,
        oc.constraint_name,
        ps1.stage_name as from_stage_name,
        ps2.stage_name as to_stage_name,
        sos1.operation_day as from_operation_day,
        sos1.recommended_time as from_recommended_time,
        sos2.operation_day as to_operation_day,
        sos2.recommended_time as to_recommended_time,
        ps1.start_day as from_stage_start_day,
        ps2.start_day as to_stage_start_day
      FROM operation_constraints oc
      JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
      JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
      JOIN operations op1 ON sos1.operation_id = op1.id
      JOIN operations op2 ON sos2.operation_id = op2.id
      JOIN process_stages ps1 ON sos1.stage_id = ps1.id
      JOIN process_stages ps2 ON sos2.stage_id = ps2.id
      WHERE ps1.template_id = ? AND ps2.template_id = ?
      ORDER BY ps1.stage_order, sos1.operation_order
    `;
    
    const [constraints] = await pool.execute<RowDataPacket[]>(query, [templateId, templateId]);
    res.json(constraints);
  } catch (error) {
    console.error('Error fetching template constraints:', error);
    res.status(500).json({ error: 'Failed to fetch template constraints' });
  }
};

export const getBatchConstraintsForGantt = async (req: Request, res: Response) => {
  try {
    const { batchPlanId } = req.params;
    const id = Number(batchPlanId);

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid batch plan id' });
    }

    const query = `
      SELECT
        boc.id AS constraint_id,
        boc.batch_plan_id,
        boc.batch_operation_plan_id,
        boc.predecessor_batch_operation_plan_id,
        boc.constraint_type,
        boc.time_lag,
        boc.constraint_level,
        boc.share_personnel,
        boc.constraint_name,
        boc.description,
        bop_current.template_schedule_id AS current_template_schedule_id,
        bop_predecessor.template_schedule_id AS predecessor_template_schedule_id,
        ps_current.stage_name AS current_stage_name,
        ps_predecessor.stage_name AS predecessor_stage_name
      FROM batch_operation_constraints boc
      JOIN batch_operation_plans bop_current ON boc.batch_operation_plan_id = bop_current.id
      JOIN batch_operation_plans bop_predecessor ON boc.predecessor_batch_operation_plan_id = bop_predecessor.id
      JOIN stage_operation_schedules sos_current ON bop_current.template_schedule_id = sos_current.id
      JOIN stage_operation_schedules sos_predecessor ON bop_predecessor.template_schedule_id = sos_predecessor.id
      JOIN process_stages ps_current ON sos_current.stage_id = ps_current.id
      JOIN process_stages ps_predecessor ON sos_predecessor.stage_id = ps_predecessor.id
      WHERE boc.batch_plan_id = ?
      ORDER BY boc.batch_operation_plan_id, boc.predecessor_batch_operation_plan_id
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(query, [id]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching batch constraints:', error);
    res.status(500).json({ error: 'Failed to fetch batch constraints' });
  }
};

// 获取可用的操作列表（用于创建约束时选择）
export const getAvailableOperations = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const query = `
      SELECT 
        sos.id AS schedule_id,
        sos.operation_id,
        op.operation_name,
        op.operation_code,
        ps.stage_name,
        ps.stage_order,
        sos.operation_order,
        sos.operation_day,
        sos.recommended_time
      FROM stage_operation_schedules sos
      JOIN operations op ON sos.operation_id = op.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      WHERE ps.template_id = ?
      ORDER BY ps.stage_order, sos.operation_order
    `;
    
    const [rows] = await pool.execute<RowDataPacket[]>(query, [templateId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching available operations:', error);
    res.status(500).json({ error: 'Failed to fetch available operations' });
  }
};

export const validateTemplateConstraints = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const id = Number(templateId);

    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const result = await runConstraintValidation(id);
    return res.json(result);
  } catch (error) {
    console.error('Error validating template constraints:', error);
    return res.status(500).json({ error: 'Failed to validate constraints' });
  }
};
