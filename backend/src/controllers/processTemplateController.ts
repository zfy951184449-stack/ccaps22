import { Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { scheduleTemplateOperations } from '../services/templateSchedulingService';
import { computePersonnelLoad } from '../services/personnelLoadService';
import {
  copyTemplateRuleOverrides,
  getEffectiveRulesForSchedules,
  loadTemplateRuleMetadataForStageOperations,
} from '../services/templateResourceRuleService';
import { isTemplateResourceRulesEnabled } from '../utils/featureFlags';
import { copyTemplateScheduleBindings } from '../services/resourceNodeService';

// 生成下一个模版编码
// 仅考虑符合 PT-数字 规范的编码，按数值（而非字典序）取最大值，避免被
// 自定义编码（如 WBP2486_DSP_TAT9）干扰而生成 PT-00NaN。
const generateNextTemplateCode = async (): Promise<string> => {
  const [rows] = await pool.execute(
    "SELECT template_code FROM process_templates WHERE template_code REGEXP '^PT-[0-9]+$'"
  ) as any;

  let maxNumber = 0;
  for (const row of rows) {
    const num = parseInt(String(row.template_code).slice(3), 10);
    if (Number.isFinite(num) && num > maxNumber) {
      maxNumber = num;
    }
  }

  return `PT-${(maxNumber + 1).toString().padStart(5, '0')}`;
};

// 计算模版的总天数
const calculateTotalDays = async (templateId: number, connection?: any): Promise<number> => {
  const conn = connection || pool;

  // 获取所有阶段及其操作的绝对位置
  const [stages] = await conn.execute(`
    SELECT 
      ps.start_day,
      COALESCE(MIN(sos.operation_day), 0) as min_operation_day,
      COALESCE(MAX(sos.operation_day), 0) as max_operation_day
    FROM process_stages ps
    LEFT JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
    WHERE ps.template_id = ?
    GROUP BY ps.id, ps.start_day
  `, [templateId]) as any;

  if (stages.length === 0) {
    return 1; // 默认最少1天
  }

  // 计算所有操作在总轴上的最小和最大位置
  let minDay = 0;
  let maxDay = 0;

  for (const stage of stages) {
    // stage.start_day 是阶段原点在总轴的位置
    // operation_day 是操作相对于阶段原点的位置
    const stageMinDay = stage.start_day + stage.min_operation_day;
    const stageMaxDay = stage.start_day + stage.max_operation_day;

    if (minDay === 0 || stageMinDay < minDay) {
      minDay = stageMinDay;
    }
    if (stageMaxDay > maxDay) {
      maxDay = stageMaxDay;
    }
  }

  // 总天数 = 最大位置 - 最小位置 + 1
  return maxDay - minDay + 1;
};

// 更新模版的总天数
const updateTemplateTotalDays = async (templateId: number, connection?: any): Promise<void> => {
  const conn = connection || pool;
  const totalDays = await calculateTotalDays(templateId, conn);

  await conn.execute(
    'UPDATE process_templates SET total_days = ? WHERE id = ?',
    [totalDays, templateId]
  );
};

// 获取所有模版
export const getAllTemplates = async (req: Request, res: Response) => {
  try {
    const { team_id } = req.query;

    let query = `
      SELECT 
        pt.*,
        ou.unit_code as team_code,
        ou.unit_name as team_name,
        COUNT(DISTINCT ps.id) as stage_count
      FROM process_templates pt
      LEFT JOIN process_stages ps ON pt.id = ps.template_id
      LEFT JOIN organization_units ou ON pt.team_id = ou.id
    `;

    const params: any[] = [];
    if (team_id) {
      query += ' WHERE pt.team_id = ?';
      params.push(team_id);
    }

    query += ' GROUP BY pt.id, ou.unit_code, ou.unit_name ORDER BY pt.template_code';

    const [templates] = await pool.execute(query, params);

    res.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

// 获取单个模版详情
export const getTemplateById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const templateResourceRulesEnabled = isTemplateResourceRulesEnabled();

    // 获取模版基础信息
    const [templateRows] = await pool.execute(
      `SELECT
          pt.*,
          ou.unit_code AS team_code,
          ou.unit_name AS team_name
       FROM process_templates pt
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       WHERE pt.id = ?`,
      [id]
    ) as any;

    if (templateRows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // 获取模版的所有阶段
    const [stages] = await pool.execute<RowDataPacket[]>(`
      SELECT 
        ps.*,
        COUNT(DISTINCT sos.id) as operation_count
      FROM process_stages ps
      LEFT JOIN stage_operation_schedules sos ON ps.id = sos.stage_id
      WHERE ps.template_id = ?
      GROUP BY ps.id
      ORDER BY ps.stage_order
    `, [id]);

    // 获取每个阶段的操作安排
    const stagesWithOperations = await Promise.all((stages as any[]).map(async (stage) => {
      const [operations] = await pool.execute<RowDataPacket[]>(`
        SELECT 
          sos.*,
          o.operation_code,
          o.operation_name,
          o.standard_time,
          o.required_people
        FROM stage_operation_schedules sos
        JOIN operations o ON sos.operation_id = o.id
        WHERE sos.stage_id = ?
        ORDER BY sos.operation_day, sos.operation_order
      `, [stage.id]);

      const hydratedOperations = templateResourceRulesEnabled
        ? await loadTemplateRuleMetadataForStageOperations(operations as Array<Record<string, unknown>>)
        : operations;

      return {
        ...stage,
        operations: hydratedOperations
      };
    }));

    let resourceReadiness = undefined;
    if (templateResourceRulesEnabled) {
      const scheduleRows = stagesWithOperations.flatMap((stage) =>
        ((stage.operations as Array<Record<string, unknown>>) ?? []).map((operation) => ({
          schedule_id: Number(operation.id),
          operation_id: Number(operation.operation_id),
        })),
      );
      const effectiveMap = await getEffectiveRulesForSchedules(scheduleRows);
      const totalOperations = scheduleRows.length;
      const operationsWithRequirements = scheduleRows.filter((row) => {
        const effective = effectiveMap.get(row.schedule_id);
        return Boolean(effective?.requirements.length);
      }).length;

      resourceReadiness = {
        total_operations: totalOperations,
        operations_with_requirements: operationsWithRequirements,
        operations_missing_requirements: Math.max(totalOperations - operationsWithRequirements, 0),
      };
    }

    res.json({
      ...templateRows[0],
      stages: stagesWithOperations,
      ...(templateResourceRulesEnabled ? { resource_readiness: resourceReadiness } : {}),
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

// 创建新模版
export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { template_name, description, team_id } = req.body;

    // 验证必填字段
    if (!template_name) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    // 生成模版编码
    const template_code = await generateNextTemplateCode();

    // 创建模版时默认总天数为1
    const [result] = await pool.execute(
      'INSERT INTO process_templates (template_code, template_name, team_id, description, total_days) VALUES (?, ?, ?, ?, ?)',
      [template_code, template_name, team_id || null, description || null, 1]
    ) as any;

    const newTemplate = {
      id: result.insertId,
      template_code,
      template_name,
      team_id: team_id || null,
      description,
      total_days: 1
    };

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
};

// 更新模版
export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { template_name, description, team_id } = req.body;

    // 只更新名称、描述和团队，不更新总天数
    const [result] = await pool.execute(
      'UPDATE process_templates SET template_name = ?, description = ?, team_id = ? WHERE id = ?',
      [template_name, description || null, team_id || null, id]
    ) as any;

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({ message: 'Template updated successfully' });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

// 删除模版
export const deleteTemplate = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;

    await connection.beginTransaction();

    // 删除所有相关的操作安排
    await connection.execute(`
      DELETE sos FROM stage_operation_schedules sos
      INNER JOIN process_stages ps ON sos.stage_id = ps.id
      WHERE ps.template_id = ?
    `, [id]);

    // 删除所有阶段
    await connection.execute(
      'DELETE FROM process_stages WHERE template_id = ?',
      [id]
    );

    // 删除模版
    const [result] = await connection.execute(
      'DELETE FROM process_templates WHERE id = ?',
      [id]
    ) as any;

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Template not found' });
    }

    await connection.commit();
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  } finally {
    connection.release();
  }
};

// 复制模版
export const copyTemplate = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { id } = req.params;
    const { new_name } = req.body;

    await connection.beginTransaction();

    // 获取原模版信息
    const [originalTemplate] = await connection.execute(
      'SELECT * FROM process_templates WHERE id = ?',
      [id]
    ) as any;

    if (originalTemplate.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Template not found' });
    }

    // 创建新模版
    const template_code = await generateNextTemplateCode();
    const [newTemplateResult] = await connection.execute(
      'INSERT INTO process_templates (template_code, template_name, description, total_days, team_id) VALUES (?, ?, ?, ?, ?)',
      [
        template_code,
        new_name || `${originalTemplate[0].template_name} - 副本`,
        originalTemplate[0].description,
        originalTemplate[0].total_days,
        originalTemplate[0].team_id ?? null,
      ]
    ) as any;

    const newTemplateId = newTemplateResult.insertId;

    // 复制所有阶段
    const [stages] = await connection.execute(
      'SELECT * FROM process_stages WHERE template_id = ? ORDER BY stage_order',
      [id]
    ) as any;

    const scheduleIdMap = new Map<number, number>();

    for (const stage of stages) {
      const [newStageResult] = await connection.execute(
        'INSERT INTO process_stages (template_id, stage_code, stage_name, stage_order, start_day, description) VALUES (?, ?, ?, ?, ?, ?)',
        [newTemplateId, stage.stage_code, stage.stage_name, stage.stage_order, stage.start_day, stage.description]
      ) as [ResultSetHeader, unknown];

      const newStageId = newStageResult.insertId;

      // 复制该阶段的操作安排
      const [sourceSchedules] = await connection.execute<RowDataPacket[]>(
        `SELECT *
         FROM stage_operation_schedules
         WHERE stage_id = ?
         ORDER BY operation_day, operation_order, id`,
        [stage.id],
      );

      for (const schedule of sourceSchedules) {
        const [newScheduleResult] = await connection.execute<ResultSetHeader>(
          `INSERT INTO stage_operation_schedules 
          (stage_id, operation_id, operation_day, recommended_time, recommended_day_offset, window_start_time, window_start_day_offset, window_end_time, window_end_day_offset, operation_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newStageId,
            schedule.operation_id,
            schedule.operation_day,
            schedule.recommended_time,
            schedule.recommended_day_offset,
            schedule.window_start_time,
            schedule.window_start_day_offset,
            schedule.window_end_time,
            schedule.window_end_day_offset,
            schedule.operation_order,
          ],
        );
        scheduleIdMap.set(Number(schedule.id), newScheduleResult.insertId);
      }
    }

    if (isTemplateResourceRulesEnabled()) {
      await copyTemplateRuleOverrides(connection, scheduleIdMap);
    }

    await copyTemplateScheduleBindings(connection, scheduleIdMap);

    // 复制完成后，重新计算新模版的总天数
    await updateTemplateTotalDays(newTemplateId, connection);

    await connection.commit();
    res.status(201).json({
      message: 'Template copied successfully',
      new_template_id: newTemplateId,
      new_template_code: template_code
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error copying template:', error);
    res.status(500).json({ error: 'Failed to copy template' });
  } finally {
    connection.release();
  }
};

export const autoScheduleTemplate = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);

    if (Number.isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const result = await scheduleTemplateOperations(templateId);

    res.json(result);
  } catch (error) {
    console.error('Error running auto scheduling:', error);
    res.status(500).json({ error: 'Failed to run auto scheduling' });
  }
};

export const getTemplatePersonnelCurve = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);

    if (Number.isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const result = await computePersonnelLoad(templateId);
    res.json(result);
  } catch (error) {
    console.error('Error fetching personnel curve:', error);
    res.status(500).json({ error: 'Failed to fetch personnel curve' });
  }
};

// 重新计算模板总天数
export const recalculateTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log('Recalculating template total days for template ID:', id);

    // 重新计算并更新总天数
    await updateTemplateTotalDays(parseInt(id));

    // 获取更新后的模板信息
    const [templateRows] = await pool.execute(
      'SELECT id, template_name, total_days FROM process_templates WHERE id = ?',
      [id]
    ) as any;

    if (templateRows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const updatedTemplate = templateRows[0];
    console.log('Template total days updated:', updatedTemplate);

    res.json({
      message: 'Template recalculated successfully',
      template: updatedTemplate
    });
  } catch (error) {
    console.error('Error recalculating template:', error);
    res.status(500).json({ error: 'Failed to recalculate template' });
  }
};

// 导出模版总览数据（用于前端 Excel 生成）
export const getTemplateExportData = async (req: Request, res: Response) => {
  try {
    const { team_id } = req.query;

    // 1. 获取所有模版
    let templateQuery = `
      SELECT 
        pt.*,
        ou.unit_code as team_code,
        ou.unit_name as team_name,
        COUNT(DISTINCT ps.id) as stage_count
      FROM process_templates pt
      LEFT JOIN process_stages ps ON pt.id = ps.template_id
      LEFT JOIN organization_units ou ON pt.team_id = ou.id
    `;
    const params: any[] = [];
    if (team_id) {
      templateQuery += ' WHERE pt.team_id = ?';
      params.push(team_id);
    }
    templateQuery += ' GROUP BY pt.id, ou.unit_code, ou.unit_name ORDER BY pt.template_code';

    const [templates] = await pool.execute(templateQuery, params) as any;

    if (!templates.length) {
      return res.json({ templates: [], stages: [], operations: [] });
    }

    const templateIds = templates.map((t: any) => t.id);
    const placeholders = templateIds.map(() => '?').join(',');

    // 2. 获取所有阶段
    const [stages] = await pool.execute(`
      SELECT
        ps.id,
        ps.template_id,
        pt.template_code,
        ps.stage_code,
        ps.stage_name,
        ps.stage_order,
        ps.start_day,
        ps.description,
        COUNT(DISTINCT sos.id) as operation_count
      FROM process_stages ps
      JOIN process_templates pt ON pt.id = ps.template_id
      LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
      WHERE ps.template_id IN (${placeholders})
      GROUP BY ps.id
      ORDER BY pt.template_code, ps.stage_order
    `, templateIds) as any;

    // 3. 获取所有工序调度（带绑定状态）
    const [operations] = await pool.execute(`
      SELECT
        sos.id,
        pt.template_code,
        ps.stage_name,
        ps.stage_code,
        o.operation_code,
        o.operation_name,
        sos.operation_day,
        sos.recommended_time,
        o.standard_time,
        o.required_people,
        sos.operation_order,
        tsb.resource_node_id,
        rn.node_name AS resource_node_name,
        CASE
          WHEN tsb.resource_node_id IS NULL THEN 'UNBOUND'
          WHEN rn.id IS NULL THEN 'INVALID_NODE'
          WHEN rn.is_active = 0 THEN 'NODE_INACTIVE'
          ELSE 'BOUND'
        END AS binding_status
      FROM stage_operation_schedules sos
      JOIN process_stages ps ON ps.id = sos.stage_id
      JOIN process_templates pt ON pt.id = ps.template_id
      JOIN operations o ON o.id = sos.operation_id
      LEFT JOIN template_stage_operation_resource_bindings tsb ON tsb.template_schedule_id = sos.id
      LEFT JOIN resource_nodes rn ON rn.id = tsb.resource_node_id
      WHERE ps.template_id IN (${placeholders})
      ORDER BY pt.template_code, ps.stage_order, sos.operation_day, sos.operation_order
    `, templateIds) as any;

    res.json({ templates, stages, operations });
  } catch (error) {
    console.error('Error fetching template export data:', error);
    res.status(500).json({ error: 'Failed to fetch template export data' });
  }
};

// 单模板报告数据（用于前端 Excel 甘特图生成）
export const getTemplateReportData = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);
    if (Number.isNaN(templateId)) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    // 1. 模板基础信息
    const [templateRows] = await pool.execute(
      `SELECT
          pt.*,
          ou.unit_code AS team_code,
          ou.unit_name AS team_name
       FROM process_templates pt
       LEFT JOIN organization_units ou ON ou.id = pt.team_id
       WHERE pt.id = ?`,
      [templateId],
    ) as any;

    if (!templateRows.length) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const template = templateRows[0];

    // 2. 阶段列表（含工序计数）
    const [stages] = await pool.execute(
      `SELECT
          ps.id,
          ps.stage_code,
          ps.stage_name,
          ps.stage_order,
          ps.start_day,
          ps.description,
          COUNT(DISTINCT sos.id) AS operation_count
       FROM process_stages ps
       LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
       WHERE ps.template_id = ?
       GROUP BY ps.id
       ORDER BY ps.stage_order`,
      [templateId],
    ) as any;

    // 3. 工序列表（含资源绑定状态）
    const [operations] = await pool.execute(
      `SELECT
          sos.id,
          ps.stage_code,
          ps.stage_name,
          o.operation_code,
          o.operation_name,
          sos.operation_day,
          sos.recommended_time,
          o.standard_time,
          o.required_people,
          sos.operation_order,
          rn.node_name AS resource_node_name,
          CASE
            WHEN tsb.resource_node_id IS NULL THEN 'UNBOUND'
            WHEN rn.id IS NULL THEN 'INVALID_NODE'
            WHEN rn.is_active = 0 THEN 'NODE_INACTIVE'
            ELSE 'BOUND'
          END AS binding_status
       FROM stage_operation_schedules sos
       JOIN process_stages ps ON ps.id = sos.stage_id
       JOIN operations o ON o.id = sos.operation_id
       LEFT JOIN template_stage_operation_resource_bindings tsb ON tsb.template_schedule_id = sos.id
       LEFT JOIN resource_nodes rn ON rn.id = tsb.resource_node_id
       WHERE ps.template_id = ?
       ORDER BY ps.stage_order, sos.operation_day, sos.operation_order`,
      [templateId],
    ) as any;

    res.json({ template, stages, operations });
  } catch (error) {
    console.error('Error fetching template report data:', error);
    res.status(500).json({ error: 'Failed to fetch template report data' });
  }
};

// 导出更新总天数函数，供其他控制器使用
export { updateTemplateTotalDays };
