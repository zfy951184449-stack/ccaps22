import { Request, Response } from 'express';
import pool from '../config/database';
import {
  getBatchOperationResourceRules,
  replaceBatchOperationRules,
} from '../services/batchResourceSnapshotService';
import { isBatchResourceSnapshotsEnabled } from '../utils/featureFlags';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';

const writeDisabled = (res: Response) =>
  res.status(409).json({ error: 'Batch resource snapshots feature is disabled' });

export const getBatchOperationResources = async (req: Request, res: Response) => {
  try {
    const operationPlanId = Number(req.params.operationPlanId);
    if (!Number.isInteger(operationPlanId) || operationPlanId <= 0) {
      return res.status(400).json({ error: 'Invalid operationPlanId' });
    }

    const rules = await getBatchOperationResourceRules(operationPlanId);
    if (!rules) {
      return res.status(404).json({ error: 'Batch operation plan not found' });
    }

    res.json(rules);
  } catch (error) {
    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Batch resource snapshot model is unavailable',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'batch_operation_resource_requirements'}`,
      });
    }
    console.error('Error fetching batch operation resources:', error);
    res.status(500).json({ error: 'Failed to fetch batch operation resources' });
  }
};

export const putBatchOperationResources = async (req: Request, res: Response) => {
  if (!isBatchResourceSnapshotsEnabled()) {
    return writeDisabled(res);
  }

  const connection = await pool.getConnection();

  try {
    const operationPlanId = Number(req.params.operationPlanId);
    if (!Number.isInteger(operationPlanId) || operationPlanId <= 0) {
      return res.status(400).json({ error: 'Invalid operationPlanId' });
    }

    await connection.beginTransaction();
    await replaceBatchOperationRules(connection, operationPlanId, req.body.requirements ?? []);
    const rules = await getBatchOperationResourceRules(operationPlanId, connection);
    await connection.commit();

    res.json({
      message: 'Batch operation resource snapshot updated successfully',
      data: rules,
    });
  } catch (error) {
    await connection.rollback();

    if (isMissingTableError(error)) {
      return res.status(409).json({
        error: 'Batch resource snapshot model is unavailable',
        warning: `Missing table: ${extractMissingTableName(error) ?? 'batch_operation_resource_requirements'}`,
      });
    }

    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }

    console.error('Error updating batch operation resources:', error);
    res.status(500).json({ error: 'Failed to update batch operation resources' });
  } finally {
    connection.release();
  }
};

