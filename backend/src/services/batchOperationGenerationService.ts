import { RowDataPacket } from 'mysql2';
import { SqlExecutor } from './operationResourceBindingService';
import { isBatchResourceSnapshotsEnabled } from '../utils/featureFlags';
import { snapshotBatchPlanResourceRules } from './batchResourceSnapshotService';

export const generateBatchOperationPlansWithResources = async (
  executor: SqlExecutor,
  batchPlanId: number,
): Promise<void> => {
  await executor.execute('CALL generate_batch_operation_plans(?)', [batchPlanId]);

  if (!isBatchResourceSnapshotsEnabled()) {
    return;
  }

  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT plan_status
     FROM production_batch_plans
     WHERE id = ?
     LIMIT 1`,
    [batchPlanId],
  );

  if (!rows.length) {
    return;
  }

  if (String(rows[0].plan_status).toUpperCase() !== 'DRAFT') {
    return;
  }

  await snapshotBatchPlanResourceRules(executor, batchPlanId);
};

