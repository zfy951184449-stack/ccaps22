import { Request, Response } from 'express';
import pool from '../config/database';
import {
  listTemplateScheduleBindings,
  upsertTemplateScheduleBinding,
  replaceTemplateScheduleBindings,
  BindingRole,
} from '../services/resourceNodeService';

export const getTemplateStageOperationResourceBinding = async (req: Request, res: Response) => {
  try {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    const bindingMap = await listTemplateScheduleBindings([scheduleId]);
    res.json({
      template_schedule_id: scheduleId,
      binding: bindingMap.get(scheduleId) ?? null,
    });
  } catch (error) {
    console.error('Error fetching template stage operation resource binding:', error);
    res.status(500).json({ error: 'Failed to fetch template stage operation resource binding' });
  }
};

export const putTemplateStageOperationResourceBinding = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const scheduleId = Number(req.params.scheduleId);
    const resourceNodeId =
      req.body.resource_node_id !== undefined && req.body.resource_node_id !== null
        ? Number(req.body.resource_node_id)
        : null;
    const bindingRole: BindingRole = req.body.binding_role === 'AUXILIARY' ? 'AUXILIARY' : 'PRIMARY';

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    if (resourceNodeId !== null && (!Number.isInteger(resourceNodeId) || resourceNodeId <= 0)) {
      return res.status(400).json({ error: 'Invalid resource_node_id' });
    }

    await connection.beginTransaction();
    const binding = await upsertTemplateScheduleBinding(scheduleId, resourceNodeId, connection, bindingRole);
    await connection.commit();

    res.json({
      message: 'Template stage operation resource binding updated successfully',
      data: binding,
    });
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating template stage operation resource binding:', error);
    res.status(500).json({ error: 'Failed to update template stage operation resource binding' });
  } finally {
    connection.release();
  }
};

/**
 * Replace the full candidate pool of a single schedule (multi-equipment binding).
 * Body: { primary_node_id: number | null, candidate_node_ids: number[] }
 *   - primary_node_id null  -> unbind everything for this schedule.
 *   - primary_node_id null while candidate_node_ids non-empty -> 400 (must have a primary first).
 * One transaction: wipe -> 1 PRIMARY (优选) -> N AUXILIARY (备选, primary deduped out).
 * Returns the full updated binding list.
 */
export const putTemplateStageOperationResourceBindings = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    const primaryNodeId =
      req.body.primary_node_id !== undefined && req.body.primary_node_id !== null
        ? Number(req.body.primary_node_id)
        : null;

    if (primaryNodeId !== null && (!Number.isInteger(primaryNodeId) || primaryNodeId <= 0)) {
      return res.status(400).json({ error: 'Invalid primary_node_id' });
    }

    const rawCandidates = req.body.candidate_node_ids;
    if (rawCandidates !== undefined && rawCandidates !== null && !Array.isArray(rawCandidates)) {
      return res.status(400).json({ error: 'candidate_node_ids must be an array' });
    }

    const candidateNodeIds: number[] = Array.isArray(rawCandidates)
      ? rawCandidates.map((item: unknown) => Number(item))
      : [];

    if (candidateNodeIds.some((item) => !Number.isInteger(item) || item <= 0)) {
      return res.status(400).json({ error: 'Invalid candidate_node_ids' });
    }

    const hasCandidates =
      candidateNodeIds.filter((item) => item !== primaryNodeId).length > 0;
    if (primaryNodeId === null && hasCandidates) {
      return res
        .status(400)
        .json({ error: 'candidate_node_ids require a primary_node_id (a primary must exist first)' });
    }

    await connection.beginTransaction();
    const bindings = await replaceTemplateScheduleBindings(
      scheduleId,
      primaryNodeId,
      candidateNodeIds,
      connection,
    );
    await connection.commit();

    res.json({ scheduleId, bindings });
  } catch (error) {
    await connection.rollback();
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error replacing template stage operation resource bindings:', error);
    res.status(500).json({ error: 'Failed to replace template stage operation resource bindings' });
  } finally {
    connection.release();
  }
};

/**
 * List ALL resource bindings for a given template (PRIMARY + AUXILIARY, one row each).
 * Returns bindings joined with resource_nodes so the frontend gets, per binding row,
 * { template_schedule_id, resource_node_id, binding_role, node_name, node_class, equipment_system_type, ... }.
 * The frontend groups rows by template_schedule_id into a candidate pool (优选 + 备选).
 * NOTE: intentionally NOT filtered to PRIMARY only — this is the template-editor read path.
 */
export const listBindingsByTemplate = async (req: Request, res: Response) => {
  try {
    const templateId = Number(req.params.templateId);
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return res.status(400).json({ error: 'Invalid templateId' });
    }

    const [rows] = await pool.query(`
      SELECT
        b.template_schedule_id,
        b.resource_node_id,
        b.binding_mode,
        b.binding_role,
        rn.node_name,
        rn.node_class,
        rn.equipment_system_type,
        rn.equipment_class
      FROM template_stage_operation_resource_bindings b
      JOIN stage_operation_schedules sos ON b.template_schedule_id = sos.id
      JOIN process_stages ps ON sos.stage_id = ps.id
      JOIN resource_nodes rn ON b.resource_node_id = rn.id
      WHERE ps.template_id = ?
      ORDER BY b.template_schedule_id, FIELD(b.binding_role, 'PRIMARY', 'AUXILIARY'), b.id
    `, [templateId]);

    res.json(rows);
  } catch (error) {
    console.error('Error listing bindings by template:', error);
    res.status(500).json({ error: 'Failed to list bindings by template' });
  }
};

/**
 * Batch update resource bindings for multiple schedule IDs.
 * Supports both binding (resource_node_id > 0) and unbinding (resource_node_id = null).
 */
export const batchUpdateBindings = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();

  try {
    const { schedule_ids, resource_node_id, binding_role } = req.body;

    if (!Array.isArray(schedule_ids) || schedule_ids.length === 0) {
      return res.status(400).json({ error: 'schedule_ids must be a non-empty array' });
    }

    const resolvedNodeId: number | null =
      resource_node_id !== undefined && resource_node_id !== null
        ? Number(resource_node_id)
        : null;

    const resolvedRole: BindingRole =
      binding_role === 'AUXILIARY' ? 'AUXILIARY' : 'PRIMARY';

    if (resolvedNodeId !== null && (!Number.isInteger(resolvedNodeId) || resolvedNodeId <= 0)) {
      return res.status(400).json({ error: 'Invalid resource_node_id' });
    }

    await connection.beginTransaction();

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const sid of schedule_ids) {
      const numericSid = Number(sid);
      if (!Number.isInteger(numericSid) || numericSid <= 0) {
        failed++;
        errors.push(`${sid}: Invalid schedule_id`);
        continue;
      }

      try {
        await upsertTemplateScheduleBinding(numericSid, resolvedNodeId, connection, resolvedRole);
        success++;
      } catch (err: any) {
        failed++;
        errors.push(`${numericSid}: ${err.message}`);
      }
    }

    await connection.commit();
    res.json({ success, failed, total: schedule_ids.length, errors: errors.slice(0, 10) });
  } catch (error: any) {
    await connection.rollback();
    console.error('Error in batch binding update:', error);
    res.status(500).json({ error: error.message || 'Batch binding failed' });
  } finally {
    connection.release();
  }
};

