import { Request, Response } from 'express';
import pool from '../config/database';
import { updateTemplateTotalDays } from './processTemplateController';

// 获取阶段的所有操作安排
export const getStageOperations = async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    
    const [operations] = await pool.execute(`
      SELECT 
        sos.*,
        o.operation_code,
        o.operation_name,
        o.standard_time,
        o.required_people,
        o.description as operation_description
      FROM stage_operation_schedules sos
      JOIN operations o ON sos.operation_id = o.id
      WHERE sos.stage_id = ?
      ORDER BY sos.operation_day, sos.operation_order
    `, [stageId]);
    
    res.json(operations);
  } catch (error) {
    console.error('Error fetching stage operations:', error);
    res.status(500).json({ error: 'Failed to fetch stage operations' });
  }
};

// 添加操作到阶段
export const addOperationToStage = async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    const { 
      operation_id, 
      operation_day, 
      recommended_time, 
      window_start_time, 
      window_end_time, 
      operation_order 
    } = req.body;
    
    console.log('Received request body:', req.body);
    
    if (!operation_id || operation_day === undefined || recommended_time === undefined) {
      console.log('Missing required fields:', { operation_id, operation_day, recommended_time });
      return res.status(400).json({ 
        error: 'Missing required fields',
        received: { operation_id, operation_day, recommended_time }
      });
    }
    
    // 验证时间范围
    if (recommended_time < 0 || recommended_time > 23.9) {
      return res.status(400).json({ error: 'Recommended time must be between 0.0 and 23.9' });
    }
    
    if (window_start_time !== undefined && window_end_time !== undefined) {
      if (window_start_time >= window_end_time) {
        return res.status(400).json({ error: 'Window start time must be before end time' });
      }
    }
    
    // 如果没有提供operation_order，获取最大值+1
    let finalOrder = operation_order;
    if (!finalOrder) {
      const [maxOrder] = await pool.execute(
        'SELECT MAX(operation_order) as max_order FROM stage_operation_schedules WHERE stage_id = ?',
        [stageId]
      ) as any;
      finalOrder = (maxOrder[0].max_order || 0) + 1;
    }
    
    const [result] = await pool.execute(
      `INSERT INTO stage_operation_schedules 
       (stage_id, operation_id, operation_day, recommended_time, window_start_time, window_end_time, operation_order) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        stageId, 
        operation_id, 
        operation_day, 
        recommended_time, 
        window_start_time || recommended_time - 2, 
        window_end_time || recommended_time + 2, 
        finalOrder
      ]
    ) as any;
    
    // 获取模版ID并更新总天数
    const [stageInfo] = await pool.execute(
      'SELECT template_id FROM process_stages WHERE id = ?',
      [stageId]
    ) as any;
    
    if (stageInfo.length > 0) {
      await updateTemplateTotalDays(stageInfo[0].template_id);
    }
    
    res.status(201).json({
      id: result.insertId,
      message: 'Operation added to stage successfully'
    });
  } catch (error) {
    console.error('Error adding operation to stage:', error);
    res.status(500).json({ error: 'Failed to add operation to stage' });
  }
};

// 更新阶段操作安排
export const updateStageOperation = async (req: Request, res: Response) => {
  try {
    const { scheduleId } = req.params;
    const { 
      operation_day, 
      recommended_time, 
      window_start_time, 
      window_end_time, 
      operation_order 
    } = req.body;
    
    console.log('updateStageOperation called with:');
    console.log('- scheduleId:', scheduleId);
    console.log('- req.body:', req.body);
    
    // 验证时间范围
    if (recommended_time !== undefined) {
      if (recommended_time < 0 || recommended_time > 23.9) {
        return res.status(400).json({ error: 'Recommended time must be between 0.0 and 23.9' });
      }
    }
    
    if (window_start_time !== undefined && window_end_time !== undefined) {
      if (window_start_time >= window_end_time) {
        return res.status(400).json({ error: 'Window start time must be before end time' });
      }
    }
    
    // 构建动态更新语句，只更新提供的字段
    const updates = [];
    const params = [];
    
    if (operation_day !== undefined) {
      updates.push('operation_day = ?');
      params.push(operation_day);
    }
    if (recommended_time !== undefined) {
      updates.push('recommended_time = ?');
      params.push(recommended_time);
    }
    if (window_start_time !== undefined) {
      updates.push('window_start_time = ?');
      params.push(window_start_time);
    }
    if (window_end_time !== undefined) {
      updates.push('window_end_time = ?');
      params.push(window_end_time);
    }
    if (operation_order !== undefined) {
      updates.push('operation_order = ?');
      params.push(operation_order);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    params.push(scheduleId); // WHERE 条件的参数
    
    const sql = `UPDATE stage_operation_schedules SET ${updates.join(', ')} WHERE id = ?`;
    
    console.log('Executing UPDATE with SQL:', sql);
    console.log('Executing UPDATE with params:', params);
    
    const [result] = await pool.execute(sql, params) as any;
    
    console.log('UPDATE result:', result);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    res.json({ message: 'Schedule updated successfully' });
  } catch (error) {
    console.error('Error updating stage operation:', error);
    res.status(500).json({ error: 'Failed to update stage operation' });
  }
};

// 删除阶段操作安排
export const removeOperationFromStage = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { scheduleId } = req.params;
    
    await connection.beginTransaction();
    
    // 先获取操作和阶段信息
    const [scheduleInfo] = await connection.execute(`
      SELECT 
        sos.stage_id,
        sos.operation_id,
        o.operation_name,
        ps.stage_name
      FROM stage_operation_schedules sos
      JOIN operations o ON sos.operation_id = o.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      WHERE sos.id = ?
    `, [scheduleId]) as any;
    
    if (scheduleInfo.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Schedule not found' });
    }
    
    const stageId = scheduleInfo[0].stage_id;
    const operationName = scheduleInfo[0].operation_name;
    const stageName = scheduleInfo[0].stage_name;
    
    // 检查是否有批次使用了该操作
    const [usageCheck] = await connection.execute(`
      SELECT COUNT(DISTINCT bop.batch_plan_id) as batch_count,
             GROUP_CONCAT(DISTINCT pbp.batch_code) as batch_codes
      FROM batch_operation_plans bop
      JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      WHERE bop.template_schedule_id = ?
      LIMIT 10
    `, [scheduleId]) as any;
    
    const batchCount = usageCheck[0].batch_count;
    const batchCodes = usageCheck[0].batch_codes;
    
    if (batchCount > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete operation that is used by existing batches',
        details: {
          message: `操作"${operationName}"（阶段"${stageName}"）正在被 ${batchCount} 个批次使用，无法删除`,
          batch_count: batchCount,
          batch_codes: batchCodes?.split(',').slice(0, 5), // 最多显示5个批次代码
          suggestion: batchCount > 5 ? `还有${batchCount - 5}个其他批次...` : null
        }
      });
    }
    
    const [result] = await connection.execute(
      'DELETE FROM stage_operation_schedules WHERE id = ?',
      [scheduleId]
    ) as any;
    
    // 获取模版ID并更新总天数
    const [stageInfo] = await connection.execute(
      'SELECT template_id FROM process_stages WHERE id = ?',
      [stageId]
    ) as any;
    
    if (stageInfo.length > 0) {
      await updateTemplateTotalDays(stageInfo[0].template_id, connection);
    }
    
    await connection.commit();
    res.json({ message: 'Operation removed from stage successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error removing operation from stage:', error);
    res.status(500).json({ error: 'Failed to remove operation from stage' });
  } finally {
    connection.release();
  }
};

// 批量添加操作到阶段
export const batchAddOperations = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { stageId } = req.params;
    const { operations } = req.body; // Array of operation schedules
    
    await connection.beginTransaction();
    
    for (const op of operations) {
      // 如果没有提供operation_order，获取最大值+1
      let finalOrder = op.operation_order;
      if (!finalOrder) {
        const [maxOrder] = await connection.execute(
          'SELECT MAX(operation_order) as max_order FROM stage_operation_schedules WHERE stage_id = ? AND operation_day = ?',
          [stageId, op.operation_day]
        ) as any;
        finalOrder = (maxOrder[0].max_order || 0) + 1;
      }
      
      await connection.execute(
        `INSERT INTO stage_operation_schedules 
         (stage_id, operation_id, operation_day, recommended_time, window_start_time, window_end_time, operation_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          stageId,
          op.operation_id,
          op.operation_day,
          op.recommended_time,
          op.window_start_time || op.recommended_time - 2,
          op.window_end_time || op.recommended_time + 2,
          finalOrder
        ]
      );
    }
    
    // 获取模版ID并更新总天数
    const [stageInfo] = await connection.execute(
      'SELECT template_id FROM process_stages WHERE id = ?',
      [stageId]
    ) as any;
    
    if (stageInfo.length > 0) {
      await updateTemplateTotalDays(stageInfo[0].template_id, connection);
    }
    
    await connection.commit();
    res.status(201).json({ message: 'Operations added successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error batch adding operations:', error);
    res.status(500).json({ error: 'Failed to add operations' });
  } finally {
    connection.release();
  }
};

// 重新排序阶段内的操作
export const reorderStageOperations = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { stageId } = req.params;
    const { operations } = req.body; // Array of { id, operation_order }
    
    await connection.beginTransaction();
    
    for (const op of operations) {
      await connection.execute(
        'UPDATE stage_operation_schedules SET operation_order = ? WHERE id = ? AND stage_id = ?',
        [op.operation_order, op.id, stageId]
      );
    }
    
    await connection.commit();
    res.json({ message: 'Operations reordered successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error reordering operations:', error);
    res.status(500).json({ error: 'Failed to reorder operations' });
  } finally {
    connection.release();
  }
};

// 获取可用的操作列表（用于选择）
export const getAvailableOperations = async (req: Request, res: Response) => {
  try {
    const [operations] = await pool.execute(`
      SELECT 
        id,
        operation_code,
        operation_name,
        standard_time,
        required_people
      FROM operations
      ORDER BY operation_code
    `);
    
    res.json(operations);
  } catch (error) {
    console.error('Error fetching available operations:', error);
    res.status(500).json({ error: 'Failed to fetch available operations' });
  }
};