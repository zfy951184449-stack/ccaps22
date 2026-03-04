import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  buildResourceNodeTree,
  evaluateTemplateScheduleBinding,
  listResourceNodes,
  listTemplateScheduleBindings,
} from '../services/resourceNodeService';
import { loadTemplateRuleMetadataForStageOperations } from '../services/templateResourceRuleService';

export const getTemplateResourcePlanner = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.id);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid template id' });
    }

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
      return res.status(404).json({ error: 'Template not found' });
    }

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

    const [operationRowsRaw] = await pool.execute<RowDataPacket[]>(
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
    );

    const hydratedOperations = await loadTemplateRuleMetadataForStageOperations(
      operationRowsRaw as Array<Record<string, unknown>>,
    );
    const scheduleIds = hydratedOperations
      .map((item) => Number(item.id))
      .filter((value) => Number.isFinite(value));
    const bindingMap = await listTemplateScheduleBindings(scheduleIds);
    const resourceNodes = await listResourceNodes({ include_inactive: true });

    let boundOperations = 0;
    let invalidBindings = 0;

    const operations = await Promise.all(
      hydratedOperations.map(async (operation) => {
        const scheduleId = Number(operation.id);
        const binding = bindingMap.get(scheduleId);

        if (!binding) {
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

    const metrics = {
      total_operations: operations.length,
      bound_operations: boundOperations,
      unbound_operations: operations.filter((item) => item.binding_status === 'UNBOUND').length,
      invalid_bindings: invalidBindings,
      resource_node_count: resourceNodes.length,
    };

    const warnings: string[] = [];
    if (!resourceNodes.length) {
      warnings.push('尚未建立资源节点树，请先在节点管理中配置房间/设备/组件结构。');
    }
    if (metrics.unbound_operations > 0) {
      warnings.push(`有 ${metrics.unbound_operations} 个工序尚未绑定默认资源节点。`);
    }
    if (metrics.invalid_bindings > 0) {
      warnings.push(`有 ${metrics.invalid_bindings} 个工序的默认资源绑定无效，需要重新处理。`);
    }

    res.json({
      template: templateRows[0],
      stages: stageRows,
      operations,
      resource_tree: buildResourceNodeTree(resourceNodes),
      metrics,
      warnings,
    });
  } catch (error) {
    console.error('Error fetching template resource planner:', error);
    res.status(500).json({ error: 'Failed to fetch template resource planner' });
  }
};
