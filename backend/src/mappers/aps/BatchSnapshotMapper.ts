import type { RowDataPacket } from 'mysql2/promise';
import type { BatchRecipeSnapshot, BatchRecipeSnapshotStatus } from '../../domain/aps/batchSnapshotTypes';

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

const parseJson = (value: unknown): unknown => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return value;
  }
};

export const mapBatchRecipeSnapshotRow = (row: RowDataPacket): BatchRecipeSnapshot => ({
  id: Number(row.id),
  batchPlanId: Number(row.batch_plan_id),
  recipeVersionId: Number(row.recipe_version_id),
  recipeVersionNo: String(row.recipe_version_no),
  snapshotVersion: Number(row.snapshot_version),
  snapshotJson: parseJson(row.snapshot_json),
  unitOperationsJson: parseJson(row.unit_operations_json),
  dependenciesJson: parseJson(row.dependencies_json),
  bomSnapshotJson: parseJson(row.bom_snapshot_json),
  snapshotStatus: String(row.snapshot_status) as BatchRecipeSnapshotStatus,
  snapshottedAt: String(row.snapshotted_at),
  snapshottedBy: nullableNumber(row.snapshotted_by),
});
