import type { RowDataPacket } from 'mysql2/promise';
import type { ApsScenario, ScenarioStatus, ScenarioType } from '../../domain/aps/scenarioTypes';

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const nullableIsoString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return toIsoString(value);
};

export const mapScenarioRow = (row: RowDataPacket): ApsScenario => ({
  id: Number(row.id),
  scenarioCode: String(row.scenario_code),
  scenarioName: String(row.scenario_name),
  scenarioType: String(row.scenario_type) as ScenarioType,
  sourceScenarioId: row.source_scenario_id === null || row.source_scenario_id === undefined ? null : Number(row.source_scenario_id),
  planningHorizonStart: toIsoString(row.planning_horizon_start),
  planningHorizonEnd: toIsoString(row.planning_horizon_end),
  scenarioStatus: String(row.scenario_status) as ScenarioStatus,
  reasonCode: row.reason_code ?? null,
  reasonText: row.reason_text ?? null,
  createdBy: row.created_by === null || row.created_by === undefined ? null : Number(row.created_by),
  approvedBy: row.approved_by === null || row.approved_by === undefined ? null : Number(row.approved_by),
  publishedBy: row.published_by === null || row.published_by === undefined ? null : Number(row.published_by),
  createdAt: toIsoString(row.created_at),
  approvedAt: nullableIsoString(row.approved_at),
  publishedAt: nullableIsoString(row.published_at),
  updatedAt: nullableIsoString(row.updated_at) ?? undefined,
});
