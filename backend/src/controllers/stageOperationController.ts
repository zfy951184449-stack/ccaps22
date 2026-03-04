import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { updateTemplateTotalDays } from './processTemplateController';
import { upsertTemplateScheduleBinding } from '../services/resourceNodeService';
import { loadTemplateRuleMetadataForStageOperations } from '../services/templateResourceRuleService';
import { isTemplateResourceRulesEnabled } from '../utils/featureFlags';

// 获取阶段的所有操作安排
export const getStageOperations = async (req: Request, res: Response) => {
  try {
    const { stageId } = req.params;
    
    const [operations] = await pool.execute<RowDataPacket[]>(`
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

    const responseRows = isTemplateResourceRulesEnabled()
      ? await loadTemplateRuleMetadataForStageOperations(operations as Array<Record<string, unknown>>)
      : operations;

    res.json(responseRows);
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
      recommended_day_offset,
      window_start_time,
      window_start_day_offset,
      window_end_time,
      window_end_day_offset,
      operation_order,
    } = req.body;
    
    console.log('Received request body:', req.body);
    
    if (!operation_id || operation_day === undefined || recommended_time === undefined) {
      console.log('Missing required fields:', { operation_id, operation_day, recommended_time });
      return res.status(400).json({ 
        error: 'Missing required fields',
        received: { operation_id, operation_day, recommended_time }
      });
    }

    const parsedOperationDay = Number(operation_day);
    const parsedRecommendedTime = Number(recommended_time);
    const parsedRecommendedOffset = Number(recommended_day_offset ?? 0);
    const parsedWindowStartTime =
      window_start_time !== undefined ? Number(window_start_time) : undefined;
    const parsedWindowStartOffset = Number(window_start_day_offset ?? 0);
    const parsedWindowEndTime =
      window_end_time !== undefined ? Number(window_end_time) : undefined;
    const parsedWindowEndOffset = Number(window_end_day_offset ?? 0);

    if (Number.isNaN(parsedOperationDay) || Number.isNaN(parsedRecommendedTime)) {
      return res.status(400).json({ error: 'operation_day 和 recommended_time 必须是数字' });
    }

    // 验证时间范围
    if (parsedRecommendedTime < 0 || parsedRecommendedTime > 23.9) {
      return res.status(400).json({ error: 'Recommended time must be between 0.0 and 23.9' });
    }

    if (parsedWindowStartTime !== undefined && parsedWindowEndTime !== undefined) {
      if (parsedWindowStartTime >= parsedWindowEndTime && parsedWindowStartOffset === parsedWindowEndOffset) {
        return res.status(400).json({ error: 'Window start time must be before end time' });
      }
    }

    const offsetsToValidate = [parsedRecommendedOffset, parsedWindowStartOffset, parsedWindowEndOffset];
    if (offsetsToValidate.some((val) => Number.isNaN(val) || val < -7 || val > 7)) {
      return res.status(400).json({ error: 'Day offsets must be between -7 and 7' });
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

    const finalWindowStartTime =
      parsedWindowStartTime !== undefined ? parsedWindowStartTime : parsedRecommendedTime - 2;
    const finalWindowEndTime =
      parsedWindowEndTime !== undefined ? parsedWindowEndTime : parsedRecommendedTime + 2;

    const [result] = await pool.execute(
      `INSERT INTO stage_operation_schedules 
       (stage_id, operation_id, operation_day, recommended_time, recommended_day_offset, window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stageId, 
        operation_id, 
        parsedOperationDay,
        parsedRecommendedTime,
        parsedRecommendedOffset,
        finalWindowStartTime,
        parsedWindowStartOffset,
        finalWindowEndTime,
        parsedWindowEndOffset,
        finalOrder,
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
      recommended_day_offset,
      window_start_time,
      window_start_day_offset,
      window_end_time,
      window_end_day_offset,
      operation_order,
    } = req.body;
    
    console.log('updateStageOperation called with:');
    console.log('- scheduleId:', scheduleId);
    console.log('- req.body:', req.body);
    
    // 验证时间范围
    const parsedRecommendedTime = recommended_time !== undefined ? Number(recommended_time) : undefined;
    if (parsedRecommendedTime !== undefined) {
      if (Number.isNaN(parsedRecommendedTime) || parsedRecommendedTime < 0 || parsedRecommendedTime > 23.9) {
        return res.status(400).json({ error: 'Recommended time must be between 0.0 and 23.9' });
      }
    }

    const parsedWindowStartTime = window_start_time !== undefined ? Number(window_start_time) : undefined;
    const parsedWindowEndTime = window_end_time !== undefined ? Number(window_end_time) : undefined;
    const parsedWindowStartOffset = window_start_day_offset !== undefined ? Number(window_start_day_offset) : undefined;
    const parsedWindowEndOffset = window_end_day_offset !== undefined ? Number(window_end_day_offset) : undefined;
    const parsedRecommendedOffset = recommended_day_offset !== undefined ? Number(recommended_day_offset) : undefined;

    const offsetValues = [parsedRecommendedOffset, parsedWindowStartOffset, parsedWindowEndOffset].filter(
      (value) => value !== undefined,
    ) as number[];
    if (offsetValues.some((value) => Number.isNaN(value) || value < -7 || value > 7)) {
      return res.status(400).json({ error: 'Day offsets must be between -7 and 7' });
    }

    if (parsedWindowStartTime !== undefined && parsedWindowEndTime !== undefined) {
      const startOffset = parsedWindowStartOffset ?? 0;
      const endOffset = parsedWindowEndOffset ?? 0;
      if (
        (Number.isNaN(parsedWindowStartTime) || Number.isNaN(parsedWindowEndTime)) ||
        (startOffset === endOffset && parsedWindowStartTime >= parsedWindowEndTime)
      ) {
        return res.status(400).json({ error: 'Window start time must be before end time' });
      }
    }
    
    // 构建动态更新语句，只更新提供的字段
    const updates = [];
    const params = [];
    
    if (operation_day !== undefined) {
      updates.push('operation_day = ?');
      params.push(Number(operation_day));
    }
    if (parsedRecommendedTime !== undefined) {
      updates.push('recommended_time = ?');
      params.push(parsedRecommendedTime);
    }
    if (parsedRecommendedOffset !== undefined) {
      updates.push('recommended_day_offset = ?');
      params.push(parsedRecommendedOffset);
    }
    if (parsedWindowStartTime !== undefined) {
      updates.push('window_start_time = ?');
      params.push(parsedWindowStartTime);
    }
    if (parsedWindowStartOffset !== undefined) {
      updates.push('window_start_day_offset = ?');
      params.push(parsedWindowStartOffset);
    }
    if (parsedWindowEndTime !== undefined) {
      updates.push('window_end_time = ?');
      params.push(parsedWindowEndTime);
    }
    if (parsedWindowEndOffset !== undefined) {
      updates.push('window_end_day_offset = ?');
      params.push(parsedWindowEndOffset);
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
      
      const recommendedOffset = Number(op.recommended_day_offset ?? 0);
      const windowStartOffset = Number(op.window_start_day_offset ?? 0);
      const windowEndOffset = Number(op.window_end_day_offset ?? 0);
      const recommendedTime = Number(op.recommended_time);
      const windowStartTime =
        op.window_start_time !== undefined
          ? Number(op.window_start_time)
          : recommendedTime - 2;
      const windowEndTime =
        op.window_end_time !== undefined ? Number(op.window_end_time) : recommendedTime + 2;

      await connection.execute(
        `INSERT INTO stage_operation_schedules 
         (stage_id, operation_id, operation_day, recommended_time, recommended_day_offset, window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          stageId,
          op.operation_id,
          Number(op.operation_day),
          recommendedTime,
          recommendedOffset,
          windowStartTime,
          windowStartOffset,
          windowEndTime,
          windowEndOffset,
          finalOrder,
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

const toHourValue = (value: number) => {
  const remainder = value % 24;
  return remainder < 0 ? remainder + 24 : remainder;
};

const buildRelativeScheduleFields = (
  absoluteStartHour: number,
  stageStartDay: number,
  durationHours: number,
) => {
  const absoluteDay = Math.floor(absoluteStartHour / 24);
  const operationDay = Math.max(0, absoluteDay - stageStartDay);
  const recommendedDayOffset = absoluteDay - stageStartDay - operationDay;
  const recommendedTime = toHourValue(absoluteStartHour);

  const windowStartAbsolute = absoluteStartHour - 2;
  const windowEndAbsolute = absoluteStartHour + Math.max(durationHours, 2);
  const windowStartDay = Math.floor(windowStartAbsolute / 24);
  const windowEndDay = Math.floor(windowEndAbsolute / 24);

  return {
    operation_day: operationDay,
    recommended_time: recommendedTime,
    recommended_day_offset: recommendedDayOffset,
    window_start_time: toHourValue(windowStartAbsolute),
    window_start_day_offset: windowStartDay - stageStartDay - operationDay,
    window_end_time: toHourValue(windowEndAbsolute),
    window_end_day_offset: windowEndDay - stageStartDay - operationDay,
  };
};

export const createStageOperationFromCanvas = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const templateId = Number(req.params.id);
    const {
      stage_id,
      operation_id,
      resource_node_id,
      operation_day,
      recommended_time,
      recommended_day_offset,
      window_start_time,
      window_start_day_offset,
      window_end_time,
      window_end_day_offset,
      absolute_start_hour,
    } = req.body ?? {};

    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const stageId = Number(stage_id);
    const operationId = Number(operation_id);

    if (!Number.isInteger(stageId) || stageId <= 0 || !Number.isInteger(operationId) || operationId <= 0) {
      return res.status(400).json({ error: 'stage_id and operation_id are required' });
    }

    await connection.beginTransaction();

    const [stageRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id, template_id, start_day FROM process_stages WHERE id = ? LIMIT 1',
      [stageId],
    );

    if (!stageRows.length || Number(stageRows[0].template_id) !== templateId) {
      await connection.rollback();
      return res.status(400).json({ error: 'Stage does not belong to current template' });
    }

    const [operationRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id, standard_time FROM operations WHERE id = ? LIMIT 1',
      [operationId],
    );

    if (!operationRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Operation not found' });
    }

    const stageStartDay = Number(stageRows[0].start_day ?? 0);
    const durationHours = Number(operationRows[0].standard_time ?? 2);
    const derivedFields =
      absolute_start_hour !== undefined && absolute_start_hour !== null
        ? buildRelativeScheduleFields(Number(absolute_start_hour), stageStartDay, durationHours)
        : {
            operation_day: Number(operation_day ?? 0),
            recommended_time: Number(recommended_time ?? 9),
            recommended_day_offset: Number(recommended_day_offset ?? 0),
            window_start_time: window_start_time !== undefined ? Number(window_start_time) : Number(recommended_time ?? 9) - 2,
            window_start_day_offset: Number(window_start_day_offset ?? 0),
            window_end_time:
              window_end_time !== undefined ? Number(window_end_time) : Number(recommended_time ?? 9) + Math.max(durationHours, 2),
            window_end_day_offset: Number(window_end_day_offset ?? 0),
          };

    const [maxOrderRows] = await connection.execute<RowDataPacket[]>(
      'SELECT COALESCE(MAX(operation_order), 0) AS max_order FROM stage_operation_schedules WHERE stage_id = ?',
      [stageId],
    );
    const finalOrder = Number(maxOrderRows[0]?.max_order ?? 0) + 1;

    const [insertResult]: any = await connection.execute(
      `INSERT INTO stage_operation_schedules
       (stage_id, operation_id, operation_day, recommended_time, recommended_day_offset, window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        stageId,
        operationId,
        derivedFields.operation_day,
        derivedFields.recommended_time,
        derivedFields.recommended_day_offset,
        derivedFields.window_start_time,
        derivedFields.window_start_day_offset,
        derivedFields.window_end_time,
        derivedFields.window_end_day_offset,
        finalOrder,
      ],
    );

    const scheduleId = Number(insertResult.insertId);

    if (resource_node_id !== undefined && resource_node_id !== null) {
      await upsertTemplateScheduleBinding(scheduleId, Number(resource_node_id), connection);
    }

    await updateTemplateTotalDays(templateId, connection);
    await connection.commit();

    res.status(201).json({
      id: scheduleId,
      message: 'Stage operation created from canvas successfully',
    });
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating stage operation from canvas:', error);
    res.status(500).json({ error: 'Failed to create stage operation from canvas' });
  } finally {
    connection.release();
  }
};

export const moveStageOperationToStage = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const scheduleId = Number(req.params.scheduleId);
    const targetStageId = Number(req.body?.target_stage_id);

    if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !Number.isInteger(targetStageId) || targetStageId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId or target_stage_id' });
    }

    await connection.beginTransaction();

    const [scheduleRows] = await connection.execute<RowDataPacket[]>(
      `SELECT sos.id, sos.stage_id, ps.template_id
       FROM stage_operation_schedules sos
       JOIN process_stages ps ON ps.id = sos.stage_id
       WHERE sos.id = ?
       LIMIT 1`,
      [scheduleId],
    );

    if (!scheduleRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const [targetStageRows] = await connection.execute<RowDataPacket[]>(
      'SELECT id, template_id FROM process_stages WHERE id = ? LIMIT 1',
      [targetStageId],
    );

    if (!targetStageRows.length) {
      await connection.rollback();
      return res.status(404).json({ error: 'Target stage not found' });
    }

    const templateId = Number(scheduleRows[0].template_id);
    if (Number(targetStageRows[0].template_id) !== templateId) {
      await connection.rollback();
      return res.status(400).json({ error: 'Target stage does not belong to current template' });
    }

    const requestedOrder = req.body?.target_operation_order !== undefined ? Number(req.body.target_operation_order) : null;
    let targetOrder = requestedOrder;

    if (!Number.isFinite(targetOrder as number) || Number(targetOrder) <= 0) {
      const [maxOrderRows] = await connection.execute<RowDataPacket[]>(
        'SELECT COALESCE(MAX(operation_order), 0) AS max_order FROM stage_operation_schedules WHERE stage_id = ?',
        [targetStageId],
      );
      targetOrder = Number(maxOrderRows[0]?.max_order ?? 0) + 1;
    }

    await connection.execute(
      'UPDATE stage_operation_schedules SET stage_id = ?, operation_order = ? WHERE id = ?',
      [targetStageId, Number(targetOrder), scheduleId],
    );

    await updateTemplateTotalDays(templateId, connection);
    await connection.commit();

    res.json({ message: 'Stage operation moved successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error moving stage operation:', error);
    res.status(500).json({ error: 'Failed to move stage operation' });
  } finally {
    connection.release();
  }
};
