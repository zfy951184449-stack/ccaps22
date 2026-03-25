import { Request, Response } from 'express';
import pool from '../config/database';
import {
  deleteTemplateScheduleOverrides,
  getTemplateScheduleResourceRules,
  replaceTemplateScheduleRules,
} from '../services/templateResourceRuleService';
import { isTemplateResourceRulesEnabled } from '../utils/featureFlags';
import { extractMissingTableName, isMissingTableError } from '../utils/missingTableGuard';

const featureDisabled = (res: Response) =>
  res.status(404).json({ error: 'Template resource rules feature is disabled' });

export const getTemplateStageOperationResources = async (req: Request, res: Response) => {
  if (!isTemplateResourceRulesEnabled()) {
    return featureDisabled(res);
  }

  try {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    const rules = await getTemplateScheduleResourceRules(scheduleId);
    if (!rules) {
      return res.status(404).json({ error: 'Stage operation schedule not found' });
    }

    res.json(rules);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Template resource rule model is unavailable',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'}`,
      });
    }

    console.error('Error fetching template stage operation resources:', error);
    res.status(500).json({ error: 'Failed to fetch template stage operation resources' });
  }
};

export const putTemplateStageOperationResources = async (req: Request, res: Response) => {
  if (!isTemplateResourceRulesEnabled()) {
    return featureDisabled(res);
  }

  const connection = await pool.getConnection();

  try {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    await connection.beginTransaction();
    await replaceTemplateScheduleRules(connection, scheduleId, req.body.requirements ?? []);
    const rules = await getTemplateScheduleResourceRules(scheduleId, connection);
    await connection.commit();

    res.json({
      message: 'Template stage operation resource rules updated successfully',
      data: rules,
    });
  } catch (error) {
    await connection.rollback();

    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Template resource rule model is unavailable',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'}`,
      });
    }

    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error updating template stage operation resources:', error);
    res.status(500).json({ error: 'Failed to update template stage operation resources' });
  } finally {
    connection.release();
  }
};

export const deleteTemplateStageOperationResources = async (req: Request, res: Response) => {
  if (!isTemplateResourceRulesEnabled()) {
    return featureDisabled(res);
  }

  const connection = await pool.getConnection();

  try {
    const scheduleId = Number(req.params.scheduleId);
    if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
      return res.status(400).json({ error: 'Invalid scheduleId' });
    }

    await connection.beginTransaction();
    await deleteTemplateScheduleOverrides(connection, scheduleId);
    const rules = await getTemplateScheduleResourceRules(scheduleId, connection);
    await connection.commit();

    res.json({
      message: 'Template stage operation resource overrides deleted successfully',
      data: rules,
    });
  } catch (error) {
    await connection.rollback();

    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Template resource rule model is unavailable',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'}`,
      });
    }

    console.error('Error deleting template stage operation resources:', error);
    res.status(500).json({ error: 'Failed to delete template stage operation resources' });
  } finally {
    connection.release();
  }
};
