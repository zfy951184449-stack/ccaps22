import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  buildResourceNodeTree,
  evaluateTemplateScheduleBinding,
  listResourceNodes,
  listTemplateScheduleBindings,
} from '../services/resourceNodeService';
import { runConstraintValidation } from '../services/constraintValidationService';
import { loadTemplateRuleMetadataForStageOperations } from '../services/templateResourceRuleService';
import { isTemplateResourceRulesEnabled } from '../utils/featureFlags';

const loadTemplateBase = async (templateId: number) => {
  const [templateRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        pt.*,
        ou.unit_code AS team_code,
        ou.unit_name AS team_name
     FROM process_templates pt
     LEFT JOIN organization_units ou ON ou.id = pt.team_id
     WHERE pt.id = ?
     LIMIT 1`,
    [templateId],
  );

  if (!templateRows.length) {
    return null;
  }

  return templateRows[0];
};

const loadTemplateStages = async (templateId: number) => {
  const [stageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        ps.*,
        COUNT(DISTINCT sos.id) AS operation_count
     FROM process_stages ps
     LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
     WHERE ps.template_id = ?
     GROUP BY ps.id
     ORDER BY ps.stage_order`,
    [templateId],
  );

  return stageRows;
};

const loadTemplateConstraintLinks = async (templateId: number) => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
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
        oc.time_lag AS lag_time,
        oc.lag_type,
        oc.lag_min,
        oc.lag_max,
        oc.share_mode,
        oc.constraint_level,
        oc.constraint_name,
        oc.description,
        ps1.stage_name AS from_stage_name,
        ps2.stage_name AS to_stage_name,
        sos1.operation_day AS from_operation_day,
        sos1.recommended_time AS from_recommended_time,
        sos1.recommended_day_offset AS from_recommended_day_offset,
        sos2.operation_day AS to_operation_day,
        sos2.recommended_time AS to_recommended_time,
        sos2.recommended_day_offset AS to_recommended_day_offset,
        ps1.start_day AS from_stage_start_day,
        ps2.start_day AS to_stage_start_day
     FROM operation_constraints oc
     JOIN stage_operation_schedules sos1 ON oc.schedule_id = sos1.id
     JOIN stage_operation_schedules sos2 ON oc.predecessor_schedule_id = sos2.id
     JOIN operations op1 ON sos1.operation_id = op1.id
     JOIN operations op2 ON sos2.operation_id = op2.id
     JOIN process_stages ps1 ON sos1.stage_id = ps1.id
     JOIN process_stages ps2 ON sos2.stage_id = ps2.id
     WHERE ps1.template_id = ? AND ps2.template_id = ?
     ORDER BY ps1.stage_order, sos1.operation_order, oc.id`,
    [templateId, templateId],
  );

  return rows;
};

const loadTemplateShareGroups = async (templateId: number) => {
  const [groupRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        psg.id,
        psg.template_id,
        psg.group_code,
        psg.group_name,
        psg.share_mode,
        psg.created_at,
        COUNT(psgm.id) AS member_count
     FROM personnel_share_groups psg
     LEFT JOIN personnel_share_group_members psgm ON psg.id = psgm.group_id
     WHERE psg.template_id = ?
     GROUP BY psg.id
     ORDER BY psg.created_at DESC`,
    [templateId],
  );

  for (const group of groupRows) {
    const [memberRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          psgm.id,
          psgm.schedule_id,
          o.operation_name,
          COALESCE(o.required_people, 1) AS required_people,
          ps.stage_name
       FROM personnel_share_group_members psgm
       JOIN stage_operation_schedules sos ON psgm.schedule_id = sos.id
       JOIN operations o ON sos.operation_id = o.id
       JOIN process_stages ps ON sos.stage_id = ps.id
       WHERE psgm.group_id = ?
       ORDER BY ps.stage_order, sos.operation_order`,
      [group.id],
    );

    (group as any).members = memberRows;
    (group as any).member_ids = memberRows.map((item) => Number(item.schedule_id));
  }

  return groupRows;
};

const loadOperationLibrary = async () => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        id,
        operation_code,
        operation_name,
        standard_time,
        required_people,
        description
     FROM operations
     ORDER BY operation_code`,
  );

  return rows;
};

export const buildTemplateResourceEditorPayload = async (templateId: number) => {
  const template = await loadTemplateBase(templateId);
  if (!template) {
    return null;
  }

  const [stages, operationRowsRaw, resourceNodes, constraints, shareGroups, operationLibrary, constraintValidation] =
    await Promise.all([
      loadTemplateStages(templateId),
      pool.execute<RowDataPacket[]>(
        `SELECT
            sos.*,
            ps.stage_name,
            ps.stage_order,
            ps.start_day AS stage_start_day,
            o.operation_code,
            o.operation_name,
            o.standard_time,
            o.required_people,
            o.description AS operation_description
         FROM stage_operation_schedules sos
         JOIN process_stages ps ON ps.id = sos.stage_id
         JOIN operations o ON o.id = sos.operation_id
         WHERE ps.template_id = ?
         ORDER BY ps.stage_order, sos.operation_day, sos.operation_order, sos.id`,
        [templateId],
      ),
      listResourceNodes({ include_inactive: true }),
      loadTemplateConstraintLinks(templateId),
      loadTemplateShareGroups(templateId),
      loadOperationLibrary(),
      runConstraintValidation(templateId),
    ]);

  const hydratedOperations = await loadTemplateRuleMetadataForStageOperations(
    (operationRowsRaw[0] ?? []) as Array<Record<string, unknown>>,
  );
  const scheduleIds = hydratedOperations
    .map((item) => Number(item.id))
    .filter((value) => Number.isFinite(value));
  const bindingMap = await listTemplateScheduleBindings(scheduleIds);

  let boundOperations = 0;
  let invalidBindings = 0;

  const bindingIssues: Array<{
    schedule_id: number;
    status: string;
    reason: string | null;
  }> = [];

  const operations: Array<Record<string, unknown>> = await Promise.all(
    hydratedOperations.map(async (operation) => {
      const scheduleId = Number(operation.id);
      const binding = bindingMap.get(scheduleId);

      if (!binding) {
        bindingIssues.push({
          schedule_id: scheduleId,
          status: 'UNBOUND',
          reason: null,
        });

        return {
          ...operation,
          default_resource_node_id: null,
          default_resource_node_name: null,
          default_resource_id: null,
          default_resource_code: null,
          binding_status: 'UNBOUND',
          binding_reason: null,
        };
      }

      const evaluation = binding.node
        ? await evaluateTemplateScheduleBinding(scheduleId, binding.resource_node_id, pool)
        : { status: 'INVALID_NODE' as const, reason: 'Resource node not found', node: null };

      if (evaluation.status === 'BOUND') {
        boundOperations += 1;
      } else {
        invalidBindings += 1;
        bindingIssues.push({
          schedule_id: scheduleId,
          status: evaluation.status,
          reason: evaluation.reason,
        });
      }

      return {
        ...operation,
        default_resource_node_id: binding.resource_node_id,
        default_resource_node_name: binding.node?.node_name ?? null,
        default_resource_id: binding.node?.bound_resource_id ?? null,
        default_resource_code: binding.node?.bound_resource_code ?? null,
        binding_status: evaluation.status,
        binding_reason: evaluation.reason,
      };
    }),
  );

  const unplacedOperations = operations
    .filter((item) => item.binding_status === 'UNBOUND')
    .map((item) => Number(item.id));
  const resourceRuleMismatches = operations
    .filter((item) => item.binding_status === 'RESOURCE_RULE_MISMATCH')
    .map((item) => Number(item.id));

  const metrics = {
    total_operations: operations.length,
    bound_operations: boundOperations,
    unbound_operations: unplacedOperations.length,
    invalid_bindings: invalidBindings,
    resource_node_count: resourceNodes.length,
  };

  const warnings: string[] = [];
  if (!resourceNodes.length) {
    warnings.push('尚未建立资源节点树，请先在节点管理中配置房间/设备/组件结构。');
  }
  if (!stages.length) {
    warnings.push('当前模板还没有阶段，请先创建阶段。');
  }
  if (metrics.unbound_operations > 0) {
    warnings.push(`有 ${metrics.unbound_operations} 个工序尚未绑定默认资源节点。`);
  }
  if (metrics.invalid_bindings > 0) {
    warnings.push(`有 ${metrics.invalid_bindings} 个工序的默认资源绑定无效，需要重新处理。`);
  }
  if (constraintValidation.hasConflicts) {
    warnings.push(`检测到 ${constraintValidation.summary.total} 个约束冲突，请优先处理。`);
  }

  return {
    template,
    stages,
    operations,
    resource_tree: buildResourceNodeTree(resourceNodes),
    constraints,
    share_groups: shareGroups,
    operation_library: operationLibrary,
    metrics,
    warnings,
    validation: {
      summary: {
        unplaced_count: unplacedOperations.length,
        invalid_binding_count: invalidBindings,
        resource_rule_mismatch_count: resourceRuleMismatches.length,
        constraint_conflict_count: constraintValidation.summary.total,
      },
      unplaced_operation_ids: unplacedOperations,
      invalid_bindings: bindingIssues,
      resource_rule_mismatch_ids: resourceRuleMismatches,
      constraint_conflicts: constraintValidation.conflicts,
    },
    capabilities: {
      resource_rules_enabled: isTemplateResourceRulesEnabled(),
      constraint_edit_enabled: true,
      share_group_enabled: true,
    },
  };
};

const resolveTemplateId = (req: Request) => Number(req.params.id);

export const getTemplateResourcePlanner = async (req: Request, res: Response) => {
  try {
    const templateId = resolveTemplateId(req);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const payload = await buildTemplateResourceEditorPayload(templateId);
    if (!payload) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(payload);
  } catch (error) {
    console.error('Error fetching template resource planner:', error);
    res.status(500).json({
      error: 'Failed to fetch template resource planner',
      detail: error instanceof Error ? error.message : null,
    });
  }
};

export const getTemplateResourceEditor = async (req: Request, res: Response) => {
  try {
    const templateId = resolveTemplateId(req);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const payload = await buildTemplateResourceEditorPayload(templateId);
    if (!payload) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(payload);
  } catch (error) {
    console.error('Error fetching template resource editor:', error);
    res.status(500).json({
      error: 'Failed to fetch template resource editor',
      detail: error instanceof Error ? error.message : null,
    });
  }
};

export const validateTemplateResourceEditor = async (req: Request, res: Response) => {
  try {
    const templateId = resolveTemplateId(req);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

    const payload = await buildTemplateResourceEditorPayload(templateId);
    if (!payload) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      metrics: payload.metrics,
      warnings: payload.warnings,
      validation: payload.validation,
      capabilities: payload.capabilities,
    });
  } catch (error) {
    console.error('Error validating template resource editor:', error);
    res.status(500).json({ error: 'Failed to validate template resource editor' });
  }
};
