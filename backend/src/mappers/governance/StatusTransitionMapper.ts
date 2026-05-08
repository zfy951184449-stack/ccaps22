import type { RowDataPacket } from 'mysql2/promise';
import type { StatusTransitionEvent } from '../../domain/governance/statusTransitionTypes';

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export const mapStatusTransitionRow = (row: RowDataPacket): StatusTransitionEvent => ({
  id: Number(row.id),
  entityType: String(row.entity_type),
  entityId: Number(row.entity_id),
  fromStatus: nullableString(row.from_status),
  toStatus: String(row.to_status),
  transitionCode: String(row.transition_code),
  transitionReason: nullableString(row.transition_reason),
  actorUserId: nullableNumber(row.actor_user_id),
  actorEmployeeId: nullableNumber(row.actor_employee_id),
  occurredAt: String(row.occurred_at),
  requestId: nullableString(row.request_id),
  correlationId: nullableString(row.correlation_id),
  createdAt: String(row.created_at),
});
