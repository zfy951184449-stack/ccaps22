import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { BatchRecipeSnapshot, DryRunBatchRecipeSnapshot } from '../../domain/aps/batchSnapshotTypes';
import { mapBatchRecipeSnapshotRow } from '../../mappers/aps/BatchSnapshotMapper';

export class BatchSnapshotService {
  static async dryRunCreateSnapshot(batchPlanId: number, recipeVersionId: number): Promise<DryRunBatchRecipeSnapshot> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    const [batchRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM production_batch_plans WHERE id = ? LIMIT 1`,
      [batchPlanId],
    );
    if (batchRows.length === 0) blockers.push('BATCH_PLAN_NOT_FOUND');

    const [recipeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, version_no FROM recipe_versions WHERE id = ? LIMIT 1`,
      [recipeVersionId],
    );
    if (recipeRows.length === 0) blockers.push('RECIPE_VERSION_NOT_FOUND');

    const [unitRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM recipe_unit_operations WHERE recipe_version_id = ? AND operation_status = 'ACTIVE'`,
      [recipeVersionId],
    );
    if (unitRows.length === 0) blockers.push('RECIPE_WITHOUT_UNIT_OPERATIONS');

    const [dependencyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM operation_dependencies WHERE recipe_version_id = ? AND dependency_status = 'ACTIVE'`,
      [recipeVersionId],
    );

    const [versionRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(snapshot_version), 0) + 1 AS next_version
       FROM batch_recipe_snapshots
       WHERE batch_plan_id = ?`,
      [batchPlanId],
    );

    return {
      batchPlanId,
      recipeVersionId,
      recipeVersionNo: recipeRows[0] ? String(recipeRows[0].version_no) : '',
      nextSnapshotVersion: Number(versionRows[0]?.next_version ?? 1),
      unitOperationCount: unitRows.length,
      dependencyCount: dependencyRows.length,
      blockers,
      warnings,
    };
  }

  static async createSnapshot(
    batchPlanId: number,
    recipeVersionId: number,
    snapshottedBy?: number | null,
  ): Promise<BatchRecipeSnapshot> {
    const dryRun = await this.dryRunCreateSnapshot(batchPlanId, recipeVersionId);
    if (dryRun.blockers.length > 0) {
      throw new Error(`BATCH_SNAPSHOT_DRY_RUN_BLOCKED:${dryRun.blockers.join(',')}`);
    }

    const [recipeRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM recipe_versions WHERE id = ?`,
      [recipeVersionId],
    );
    const [unitRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM recipe_unit_operations WHERE recipe_version_id = ? ORDER BY sequence_no, id`,
      [recipeVersionId],
    );
    const [dependencyRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM operation_dependencies WHERE recipe_version_id = ? ORDER BY id`,
      [recipeVersionId],
    );

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE batch_recipe_snapshots
         SET snapshot_status = 'SUPERSEDED'
         WHERE batch_plan_id = ? AND snapshot_status = 'ACTIVE'`,
        [batchPlanId],
      );

      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO batch_recipe_snapshots
          (batch_plan_id, recipe_version_id, recipe_version_no, snapshot_version,
           snapshot_json, unit_operations_json, dependencies_json, bom_snapshot_json, snapshotted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        [
          batchPlanId,
          recipeVersionId,
          dryRun.recipeVersionNo,
          dryRun.nextSnapshotVersion,
          JSON.stringify(recipeRows[0]),
          JSON.stringify(unitRows),
          JSON.stringify(dependencyRows),
          snapshottedBy ?? null,
        ],
      );

      await connection.commit();
      const snapshot = await this.getSnapshotById(result.insertId);
      if (!snapshot) throw new Error('BATCH_SNAPSHOT_CREATED_BUT_NOT_FOUND');
      return snapshot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  static async getActiveSnapshot(batchPlanId: number): Promise<BatchRecipeSnapshot | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM batch_recipe_snapshots
       WHERE batch_plan_id = ? AND snapshot_status = 'ACTIVE'
       ORDER BY snapshot_version DESC
       LIMIT 1`,
      [batchPlanId],
    );
    return rows.length ? mapBatchRecipeSnapshotRow(rows[0]) : null;
  }

  static async supersedeSnapshot(snapshotId: number): Promise<void> {
    await pool.execute(
      `UPDATE batch_recipe_snapshots
       SET snapshot_status = 'SUPERSEDED'
       WHERE id = ?`,
      [snapshotId],
    );
  }

  private static async getSnapshotById(snapshotId: number): Promise<BatchRecipeSnapshot | null> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM batch_recipe_snapshots WHERE id = ?`,
      [snapshotId],
    );
    return rows.length ? mapBatchRecipeSnapshotRow(rows[0]) : null;
  }
}
