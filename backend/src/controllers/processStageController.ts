import { Request, Response } from 'express';
import pool from '../config/database';
import { updateTemplateTotalDays } from './processTemplateController';

// 生成阶段编码
const generateStageCode = async (templateId: number): Promise<string> => {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) as count FROM process_stages WHERE template_id = ?',
    [templateId]
  ) as any;
  
  const count = rows[0].count + 1;
  return `PS-${count.toString().padStart(3, '0')}`;
};

// 获取模版的所有阶段
export const getTemplateStages = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    
    const [stages] = await pool.execute(`
      SELECT 
        ps.*,
        COUNT(DISTINCT sos.id) as operation_count,
        MIN(sos.operation_day) as min_day,
        MAX(sos.operation_day) as max_day
      FROM process_stages ps
      LEFT JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
      WHERE ps.template_id = ?
      GROUP BY ps.id
      ORDER BY ps.stage_order
    `, [templateId]);
    
    res.json(stages);
  } catch (error) {
    console.error('Error fetching stages:', error);
    res.status(500).json({ error: 'Failed to fetch stages' });
  }
};

// 创建新阶段
export const createStage = async (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const { stage_name, stage_order, start_day, description } = req.body;
    
    if (!stage_name) {
      return res.status(400).json({ error: 'Stage name is required' });
    }
    
    // 生成阶段编码
    const stage_code = await generateStageCode(parseInt(templateId));
    
    // 如果没有提供stage_order，获取最大值+1
    let finalOrder = stage_order;
    if (!finalOrder) {
      const [maxOrder] = await pool.execute(
        'SELECT MAX(stage_order) as max_order FROM process_stages WHERE template_id = ?',
        [templateId]
      ) as any;
      finalOrder = (maxOrder[0].max_order || 0) + 1;
    }
    
    const [result] = await pool.execute(
      'INSERT INTO process_stages (template_id, stage_code, stage_name, stage_order, start_day, description) VALUES (?, ?, ?, ?, ?, ?)',
      [templateId, stage_code, stage_name, finalOrder, start_day || 1, description || null]
    ) as any;
    
    // 更新模版的总天数
    await updateTemplateTotalDays(parseInt(templateId));
    
    res.status(201).json({
      id: result.insertId,
      template_id: templateId,
      stage_code,
      stage_name,
      stage_order: finalOrder,
      start_day: start_day || 1,
      description
    });
  } catch (error) {
    console.error('Error creating stage:', error);
    res.status(500).json({ error: 'Failed to create stage' });
  }
};

// 更新阶段
export const updateStage = async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    const updates = req.body;
    
    // 先获取template_id和当前信息
    const [stageInfo] = await pool.execute(
      'SELECT * FROM process_stages WHERE id = ?',
      [stageId]
    ) as any;
    
    if (stageInfo.length === 0) {
      return res.status(404).json({ error: 'Stage not found' });
    }
    
    const currentStage = stageInfo[0];
    
    // 构建更新的字段和值
    const fieldsToUpdate = [];
    const values = [];
    
    if (updates.stage_name !== undefined) {
      fieldsToUpdate.push('stage_name = ?');
      values.push(updates.stage_name);
    }
    
    if (updates.stage_order !== undefined) {
      fieldsToUpdate.push('stage_order = ?');
      values.push(updates.stage_order);
    }
    
    if (updates.start_day !== undefined) {
      fieldsToUpdate.push('start_day = ?');
      values.push(updates.start_day);
    }
    
    if (updates.description !== undefined) {
      fieldsToUpdate.push('description = ?');
      values.push(updates.description || null);
    }
    
    // 如果没有要更新的字段，直接返回
    if (fieldsToUpdate.length === 0) {
      return res.json({ message: 'No fields to update' });
    }
    
    // 添加WHERE条件的参数
    values.push(stageId);
    
    const [result] = await pool.execute(
      `UPDATE process_stages SET ${fieldsToUpdate.join(', ')} WHERE id = ?`,
      values
    ) as any;
    
    // 更新模版的总天数
    await updateTemplateTotalDays(currentStage.template_id);
    
    res.json({ message: 'Stage updated successfully' });
  } catch (error) {
    console.error('Error updating stage:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
};

// 删除阶段
export const deleteStage = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { stageId } = req.params;
    
    await connection.beginTransaction();
    
    // 先获取template_id和stage_name
    const [stageInfo] = await connection.execute(
      'SELECT template_id, stage_name FROM process_stages WHERE id = ?',
      [stageId]
    ) as any;
    
    if (stageInfo.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Stage not found' });
    }
    
    const templateId = stageInfo[0].template_id;
    const stageName = stageInfo[0].stage_name;
    
    // 检查是否有批次使用了该阶段的操作
    const [usageCheck] = await connection.execute(`
      SELECT COUNT(DISTINCT bop.batch_plan_id) as batch_count,
             GROUP_CONCAT(DISTINCT pbp.batch_code) as batch_codes
      FROM batch_operation_plans bop
      JOIN stage_operation_schedules sos ON bop.template_schedule_id = sos.id
      JOIN production_batch_plans pbp ON bop.batch_plan_id = pbp.id
      WHERE sos.stage_id = ?
      LIMIT 10
    `, [stageId]) as any;
    
    const batchCount = usageCheck[0].batch_count;
    const batchCodes = usageCheck[0].batch_codes;
    
    if (batchCount > 0) {
      await connection.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete stage that is used by existing batches',
        details: {
          message: `阶段"${stageName}"正在被 ${batchCount} 个批次使用，无法删除`,
          batch_count: batchCount,
          batch_codes: batchCodes?.split(',').slice(0, 5), // 最多显示5个批次代码
          suggestion: batchCount > 5 ? `还有${batchCount - 5}个其他批次...` : null
        }
      });
    }
    
    // 删除该阶段的所有操作安排
    await connection.execute(
      'DELETE FROM stage_operation_schedules WHERE stage_id = ?',
      [stageId]
    );
    
    // 删除阶段
    await connection.execute(
      'DELETE FROM process_stages WHERE id = ?',
      [stageId]
    );
    
    // 更新模版的总天数
    await updateTemplateTotalDays(templateId, connection);
    
    await connection.commit();
    res.json({ message: 'Stage deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting stage:', error);
    res.status(500).json({ error: 'Failed to delete stage' });
  } finally {
    connection.release();
  }
};

// 重新排序阶段
export const reorderStages = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { templateId } = req.params;
    const { stages } = req.body; // Array of { id, stage_order }
    
    await connection.beginTransaction();
    
    for (const stage of stages) {
      await connection.execute(
        'UPDATE process_stages SET stage_order = ? WHERE id = ? AND template_id = ?',
        [stage.stage_order, stage.id, templateId]
      );
    }
    
    await connection.commit();
    res.json({ message: 'Stages reordered successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error reordering stages:', error);
    res.status(500).json({ error: 'Failed to reorder stages' });
  } finally {
    connection.release();
  }
};

// 批量更新阶段的开始天数
export const updateStageSchedule = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  
  try {
    const { templateId } = req.params;
    const { stages } = req.body; // Array of { id, start_day }
    
    await connection.beginTransaction();
    
    for (const stage of stages) {
      await connection.execute(
        'UPDATE process_stages SET start_day = ? WHERE id = ? AND template_id = ?',
        [stage.start_day, stage.id, templateId]
      );
    }
    
    // 更新模版的总天数
    await updateTemplateTotalDays(parseInt(templateId), connection);
    
    await connection.commit();
    res.json({ message: 'Stage schedule updated successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error updating stage schedule:', error);
    res.status(500).json({ error: 'Failed to update stage schedule' });
  } finally {
    connection.release();
  }
};