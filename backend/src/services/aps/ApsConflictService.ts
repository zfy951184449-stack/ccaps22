import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { ApsConflict, ConflictStatus, CreateApsConflictInput } from '../../domain/aps/conflictTypes';
import { mapConflictRow } from '../../mappers/aps/ConflictMapper';
import { ConstraintDefinitionService } from './ConstraintDefinitionService';

export class ApsConflictService {
  static async createConflict(input: CreateApsConflictInput): Promise<ApsConflict> {
    const isValidCode = await ConstraintDefinitionService.validateConstraintCode(input.constraintCode);
    if (!isValidCode) {
      throw new Error(`APS_CONSTRAINT_CODE_INVALID:${input.constraintCode}`);
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO aps_conflicts
        (scenario_id, constraint_code, severity, hard_or_soft, entity_type, entity_id,
         batch_plan_id, batch_operation_plan_id, resource_id, material_lot_id,
         time_window_start, time_window_end, violation_reason, suggested_action, detected_by_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.scenarioId,
        input.constraintCode,
        input.severity,
        input.hardOrSoft,
        input.entityType ?? null,
        input.entityId ?? null,
        input.batchPlanId ?? null,
        input.batchOperationPlanId ?? null,
        input.resourceId ?? null,
        input.materialLotId ?? null,
        input.timeWindowStart ?? null,
        input.timeWindowEnd ?? null,
        input.violationReason,
        input.suggestedAction ?? null,
        input.detectedByRunId ?? null,
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM aps_conflicts WHERE id = ?`,
      [result.insertId],
    );
    return mapConflictRow(rows[0]);
  }

  static async listConflictsByScenario(scenarioId: number, status?: ConflictStatus): Promise<ApsConflict[]> {
    const params: any[] = [scenarioId];
    const statusClause = status ? 'AND conflict_status = ?' : '';
    if (status) params.push(status);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM aps_conflicts
       WHERE scenario_id = ?
       ${statusClause}
       ORDER BY detected_at DESC, id DESC`,
      params,
    );
    return rows.map(mapConflictRow);
  }

  static async acknowledgeConflict(conflictId: number, userId?: number | null): Promise<void> {
    await pool.execute(
      `UPDATE aps_conflicts
       SET conflict_status = 'ACKNOWLEDGED',
           resolved_by = COALESCE(?, resolved_by),
           updated_at = NOW()
       WHERE id = ? AND conflict_status = 'OPEN'`,
      [userId ?? null, conflictId],
    );
  }

  static async resolveConflict(conflictId: number, userId?: number | null, reason?: string | null): Promise<void> {
    await pool.execute(
      `UPDATE aps_conflicts
       SET conflict_status = 'RESOLVED',
           resolved_at = NOW(),
           resolved_by = ?,
           resolution_reason = ?
       WHERE id = ? AND conflict_status IN ('OPEN','ACKNOWLEDGED')`,
      [userId ?? null, reason ?? null, conflictId],
    );
  }
}
