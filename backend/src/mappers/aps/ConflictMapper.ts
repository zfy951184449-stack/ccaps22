import type { RowDataPacket } from 'mysql2/promise';
import type { ApsConflict, ConflictStatus } from '../../domain/aps/conflictTypes';
import type { ConstraintSeverity, HardOrSoft } from '../../domain/aps/constraintTypes';

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export const mapConflictRow = (row: RowDataPacket): ApsConflict => ({
  id: Number(row.id),
  scenarioId: Number(row.scenario_id),
  constraintCode: String(row.constraint_code),
  severity: String(row.severity) as ConstraintSeverity,
  hardOrSoft: String(row.hard_or_soft) as HardOrSoft,
  entityType: nullableString(row.entity_type),
  entityId: nullableNumber(row.entity_id),
  batchPlanId: nullableNumber(row.batch_plan_id),
  batchOperationPlanId: nullableNumber(row.batch_operation_plan_id),
  resourceId: nullableNumber(row.resource_id),
  materialLotId: nullableNumber(row.material_lot_id),
  timeWindowStart: nullableString(row.time_window_start),
  timeWindowEnd: nullableString(row.time_window_end),
  violationReason: String(row.violation_reason),
  suggestedAction: nullableString(row.suggested_action),
  conflictStatus: String(row.conflict_status) as ConflictStatus,
  detectedAt: String(row.detected_at),
  detectedByRunId: nullableNumber(row.detected_by_run_id),
  resolvedAt: nullableString(row.resolved_at),
  resolvedBy: nullableNumber(row.resolved_by),
  resolutionReason: nullableString(row.resolution_reason),
});
