import { Request, Response } from 'express';
import pool from '../config/database';
import {
  listTemplateScheduleBindings,
  upsertTemplateScheduleBinding,
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

    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    if (resourceNodeId !== null && (!Number.isInteger(resourceNodeId) || resourceNodeId <= 0)) {
      return res.status(400).json({ error: 'Invalid resource_node_id' });
    }

    await connection.beginTransaction();
    const binding = await upsertTemplateScheduleBinding(scheduleId, resourceNodeId, connection);
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
