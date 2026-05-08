import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool, { DbExecutor } from '../../config/database';
import type { RecordStatusTransitionInput, StatusTransitionEvent } from '../../domain/governance/statusTransitionTypes';
import { mapStatusTransitionRow } from '../../mappers/governance/StatusTransitionMapper';

export class StatusTransitionService {
  static async recordTransition(
    input: RecordStatusTransitionInput,
    executor: DbExecutor = pool,
  ): Promise<number> {
    const [result] = await executor.execute<ResultSetHeader>(
      `INSERT INTO status_transition_events
        (entity_type, entity_id, from_status, to_status, transition_code, transition_reason,
         actor_user_id, actor_employee_id, occurred_at, request_id, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?)`,
      [
        input.entityType,
        input.entityId,
        input.fromStatus ?? null,
        input.toStatus,
        input.transitionCode,
        input.transitionReason ?? null,
        input.actorUserId ?? null,
        input.actorEmployeeId ?? null,
        input.occurredAt ?? null,
        input.requestId ?? null,
        input.correlationId ?? null,
      ],
    );
    return result.insertId;
  }

  static async listTransitionsForEntity(entityType: string, entityId: number): Promise<StatusTransitionEvent[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM status_transition_events
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY occurred_at ASC, id ASC`,
      [entityType, entityId],
    );

    return rows.map(mapStatusTransitionRow);
  }
}
