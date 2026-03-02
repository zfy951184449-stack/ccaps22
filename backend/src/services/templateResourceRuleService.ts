import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';
import { SqlExecutor, toCandidateResourceIds, validateCandidateResources } from './operationResourceBindingService';

export type ResourceRuleSourceScope = 'GLOBAL_DEFAULT' | 'TEMPLATE_OVERRIDE' | 'BATCH_OVERRIDE' | 'NONE';

export type ResourceCandidateView = {
  id: number;
  resource_code: string;
  resource_name: string;
  resource_type: string;
};

export type ResourceRequirementView = {
  id: number | null;
  resource_type: string;
  required_count: number;
  is_mandatory: boolean;
  requires_exclusive_use: boolean;
  prep_minutes: number;
  changeover_minutes: number;
  cleanup_minutes: number;
  candidate_resource_ids: number[];
  candidate_resources: ResourceCandidateView[];
};

export type TemplateScheduleResourceRulesResponse = {
  template_schedule_id: number;
  operation_id: number;
  source_scope: ResourceRuleSourceScope;
  requirements: ResourceRequirementView[];
};

type RequirementTableKey = 'operation' | 'template' | 'batch';

type RequirementTableConfig = {
  requirementsTable: string;
  candidatesTable: string;
  foreignKey: string;
};

type ScheduleRow = {
  schedule_id: number;
  operation_id: number;
};

type RequirementRow = RowDataPacket & {
  id: number;
  resource_type: string;
  required_count: number;
  is_mandatory: number;
  requires_exclusive_use: number;
  prep_minutes: number;
  changeover_minutes: number;
  cleanup_minutes: number;
};

const TABLES: Record<RequirementTableKey, RequirementTableConfig> = {
  operation: {
    requirementsTable: 'operation_resource_requirements',
    candidatesTable: 'operation_resource_candidates',
    foreignKey: 'operation_id',
  },
  template: {
    requirementsTable: 'template_operation_resource_requirements',
    candidatesTable: 'template_operation_resource_candidates',
    foreignKey: 'template_schedule_id',
  },
  batch: {
    requirementsTable: 'batch_operation_resource_requirements',
    candidatesTable: 'batch_operation_resource_candidates',
    foreignKey: 'batch_operation_plan_id',
  },
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const toRequirementView = (
  row: RequirementRow,
  candidateMap: Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>,
): ResourceRequirementView => ({
  id: Number(row.id),
  resource_type: String(row.resource_type),
  required_count: Number(row.required_count ?? 1),
  is_mandatory: toBoolean(row.is_mandatory),
  requires_exclusive_use: toBoolean(row.requires_exclusive_use),
  prep_minutes: Number(row.prep_minutes ?? 0),
  changeover_minutes: Number(row.changeover_minutes ?? 0),
  cleanup_minutes: Number(row.cleanup_minutes ?? 0),
  candidate_resource_ids: candidateMap.get(Number(row.id))?.candidate_resource_ids ?? [],
  candidate_resources: candidateMap.get(Number(row.id))?.candidate_resources ?? [],
});

const loadRequirementRows = async (
  executor: SqlExecutor,
  tableKey: RequirementTableKey,
  ids: number[],
): Promise<RequirementRow[]> => {
  if (!ids.length) {
    return [];
  }

  const config = TABLES[tableKey];
  const placeholders = ids.map(() => '?').join(', ');

  try {
    const [rows] = await executor.execute<RequirementRow[]>(
      `SELECT *
       FROM ${config.requirementsTable}
       WHERE ${config.foreignKey} IN (${placeholders})
       ORDER BY ${config.foreignKey}, resource_type, id`,
      ids,
    );
    return rows;
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    throw error;
  }
};

const loadCandidateMap = async (
  executor: SqlExecutor,
  tableKey: RequirementTableKey,
  requirementIds: number[],
): Promise<Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>> => {
  const map = new Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>();

  if (!requirementIds.length) {
    return map;
  }

  const config = TABLES[tableKey];
  const placeholders = requirementIds.map(() => '?').join(', ');

  try {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT
          rc.requirement_id,
          r.id,
          r.resource_code,
          r.resource_name,
          r.resource_type
       FROM ${config.candidatesTable} rc
       JOIN resources r ON r.id = rc.resource_id
       WHERE rc.requirement_id IN (${placeholders})
       ORDER BY r.resource_type, r.resource_code`,
      requirementIds,
    );

    rows.forEach((row) => {
      const requirementId = Number(row.requirement_id);
      const current = map.get(requirementId) ?? { candidate_resource_ids: [], candidate_resources: [] };
      current.candidate_resource_ids.push(Number(row.id));
      current.candidate_resources.push({
        id: Number(row.id),
        resource_code: String(row.resource_code),
        resource_name: String(row.resource_name),
        resource_type: String(row.resource_type),
      });
      map.set(requirementId, current);
    });

    return map;
  } catch (error) {
    if (isMissingTableError(error)) {
      return map;
    }
    throw error;
  }
};

const groupRowsByForeignKey = (
  rows: RequirementRow[],
  foreignKey: string,
  candidateMap: Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>,
): Map<number, ResourceRequirementView[]> => {
  const grouped = new Map<number, ResourceRequirementView[]>();
  rows.forEach((row) => {
    const groupId = Number(row[foreignKey]);
    const current = grouped.get(groupId) ?? [];
    current.push(toRequirementView(row, candidateMap));
    grouped.set(groupId, current);
  });
  return grouped;
};

const replaceCandidateMappings = async (
  executor: SqlExecutor,
  tableKey: RequirementTableKey,
  requirementId: number,
  candidateResourceIds: number[],
) => {
  const config = TABLES[tableKey];
  await executor.execute(`DELETE FROM ${config.candidatesTable} WHERE requirement_id = ?`, [requirementId]);

  if (!candidateResourceIds.length) {
    return;
  }

  const valuesClause = candidateResourceIds.map(() => '(?, ?)').join(', ');
  const params = candidateResourceIds.flatMap((resourceId) => [requirementId, resourceId]);
  await executor.execute(
    `INSERT INTO ${config.candidatesTable} (requirement_id, resource_id)
     VALUES ${valuesClause}`,
    params,
  );
};

const normalizeInputRequirements = (value: unknown): Array<{
  resource_type: string;
  required_count?: number;
  is_mandatory?: boolean;
  requires_exclusive_use?: boolean;
  prep_minutes?: number;
  changeover_minutes?: number;
  cleanup_minutes?: number;
  candidate_resource_ids?: number[];
}> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      resource_type: String((item as Record<string, unknown>).resource_type ?? ''),
      required_count: Number((item as Record<string, unknown>).required_count ?? 1),
      is_mandatory: (item as Record<string, unknown>).is_mandatory !== false,
      requires_exclusive_use: (item as Record<string, unknown>).requires_exclusive_use !== false,
      prep_minutes: Number((item as Record<string, unknown>).prep_minutes ?? 0),
      changeover_minutes: Number((item as Record<string, unknown>).changeover_minutes ?? 0),
      cleanup_minutes: Number((item as Record<string, unknown>).cleanup_minutes ?? 0),
      candidate_resource_ids: toCandidateResourceIds((item as Record<string, unknown>).candidate_resource_ids ?? []),
    }))
    .filter((item) => item.resource_type);
};

export const summarizeRequirements = (requirements: ResourceRequirementView[]): string | null => {
  if (!requirements.length) {
    return null;
  }

  return requirements
    .map((item) => `${item.resource_type} x${item.required_count}`)
    .join(', ');
};

export const getEffectiveRulesForSchedules = async (
  scheduleRows: ScheduleRow[],
  executor: SqlExecutor = pool,
): Promise<Map<number, TemplateScheduleResourceRulesResponse>> => {
  const result = new Map<number, TemplateScheduleResourceRulesResponse>();

  if (!scheduleRows.length) {
    return result;
  }

  const scheduleIds = scheduleRows.map((row) => row.schedule_id);
  const operationIds = Array.from(new Set(scheduleRows.map((row) => row.operation_id)));

  const templateRows = await loadRequirementRows(executor, 'template', scheduleIds);
  const globalRows = await loadRequirementRows(executor, 'operation', operationIds);

  const templateCandidateMap = await loadCandidateMap(
    executor,
    'template',
    templateRows.map((row) => Number(row.id)),
  );
  const globalCandidateMap = await loadCandidateMap(
    executor,
    'operation',
    globalRows.map((row) => Number(row.id)),
  );

  const templateBySchedule = groupRowsByForeignKey(
    templateRows,
    TABLES.template.foreignKey,
    templateCandidateMap,
  );
  const globalByOperation = groupRowsByForeignKey(
    globalRows,
    TABLES.operation.foreignKey,
    globalCandidateMap,
  );

  scheduleRows.forEach((row) => {
    const templateRequirements = templateBySchedule.get(row.schedule_id);
    const globalRequirements = globalByOperation.get(row.operation_id);
    const requirements = templateRequirements ?? globalRequirements ?? [];
    const sourceScope: ResourceRuleSourceScope = templateRequirements?.length
      ? 'TEMPLATE_OVERRIDE'
      : globalRequirements?.length
        ? 'GLOBAL_DEFAULT'
        : 'NONE';

    result.set(row.schedule_id, {
      template_schedule_id: row.schedule_id,
      operation_id: row.operation_id,
      source_scope: sourceScope,
      requirements,
    });
  });

  return result;
};

export const getTemplateScheduleResourceRules = async (
  scheduleId: number,
  executor: SqlExecutor = pool,
): Promise<TemplateScheduleResourceRulesResponse | null> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT id AS schedule_id, operation_id
     FROM stage_operation_schedules
     WHERE id = ?
     LIMIT 1`,
    [scheduleId],
  );

  if (!rows.length) {
    return null;
  }

  const map = await getEffectiveRulesForSchedules(
    [{ schedule_id: Number(rows[0].schedule_id), operation_id: Number(rows[0].operation_id) }],
    executor,
  );
  return map.get(Number(rows[0].schedule_id)) ?? null;
};

export const replaceTemplateScheduleRules = async (
  executor: SqlExecutor,
  scheduleId: number,
  rawRequirements: unknown,
): Promise<void> => {
  const requirements = normalizeInputRequirements(rawRequirements);

  if (requirements.some((item) => !Number.isFinite(item.required_count) || item.required_count! <= 0)) {
    throw new Error('required_count must be a positive number');
  }

  for (const item of requirements) {
    const validation = await validateCandidateResources(executor, item.candidate_resource_ids ?? [], item.resource_type);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
  }

  const [existingRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM template_operation_resource_requirements
     WHERE template_schedule_id = ?`,
    [scheduleId],
  );

  const existingRequirementIds = existingRows.map((row) => Number(row.id));
  if (existingRequirementIds.length) {
    const placeholders = existingRequirementIds.map(() => '?').join(', ');
    await executor.execute(
      `DELETE FROM template_operation_resource_candidates
       WHERE requirement_id IN (${placeholders})`,
      existingRequirementIds,
    );
  }
  await executor.execute(
    'DELETE FROM template_operation_resource_requirements WHERE template_schedule_id = ?',
    [scheduleId],
  );

  for (const item of requirements) {
    const [insertResult] = await executor.execute<ResultSetHeader>(
      `INSERT INTO template_operation_resource_requirements (
        template_schedule_id, resource_type, required_count, is_mandatory,
        requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scheduleId,
        item.resource_type,
        item.required_count ?? 1,
        item.is_mandatory === false ? 0 : 1,
        item.requires_exclusive_use === false ? 0 : 1,
        item.prep_minutes ?? 0,
        item.changeover_minutes ?? 0,
        item.cleanup_minutes ?? 0,
      ],
    );

    await replaceCandidateMappings(executor, 'template', insertResult.insertId, item.candidate_resource_ids ?? []);
  }
};

export const deleteTemplateScheduleOverrides = async (executor: SqlExecutor, scheduleId: number): Promise<void> => {
  const [existingRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM template_operation_resource_requirements
     WHERE template_schedule_id = ?`,
    [scheduleId],
  );

  const requirementIds = existingRows.map((row) => Number(row.id));
  if (requirementIds.length) {
    const placeholders = requirementIds.map(() => '?').join(', ');
    await executor.execute(
      `DELETE FROM template_operation_resource_candidates
       WHERE requirement_id IN (${placeholders})`,
      requirementIds,
    );
  }

  await executor.execute(
    'DELETE FROM template_operation_resource_requirements WHERE template_schedule_id = ?',
    [scheduleId],
  );
};

export const copyTemplateRuleOverrides = async (
  executor: SqlExecutor,
  scheduleIdMap: Map<number, number>,
): Promise<void> => {
  const sourceScheduleIds = Array.from(scheduleIdMap.keys());
  if (!sourceScheduleIds.length) {
    return;
  }

  const sourceRows = await loadRequirementRows(executor, 'template', sourceScheduleIds);
  if (!sourceRows.length) {
    return;
  }

  const candidateMap = await loadCandidateMap(
    executor,
    'template',
    sourceRows.map((row) => Number(row.id)),
  );
  const requirementIdMap = new Map<number, number>();

  for (const row of sourceRows) {
    const targetScheduleId = scheduleIdMap.get(Number(row.template_schedule_id));
    if (!targetScheduleId) {
      continue;
    }

    const [insertResult] = await executor.execute<ResultSetHeader>(
      `INSERT INTO template_operation_resource_requirements (
        template_schedule_id, resource_type, required_count, is_mandatory,
        requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        targetScheduleId,
        row.resource_type,
        Number(row.required_count ?? 1),
        toBoolean(row.is_mandatory) ? 1 : 0,
        toBoolean(row.requires_exclusive_use) ? 1 : 0,
        Number(row.prep_minutes ?? 0),
        Number(row.changeover_minutes ?? 0),
        Number(row.cleanup_minutes ?? 0),
      ],
    );
    requirementIdMap.set(Number(row.id), insertResult.insertId);
  }

  for (const [sourceRequirementId, targetRequirementId] of requirementIdMap.entries()) {
    const candidates = candidateMap.get(sourceRequirementId)?.candidate_resource_ids ?? [];
    await replaceCandidateMappings(executor, 'template', targetRequirementId, candidates);
  }
};

export const loadTemplateRuleMetadataForStageOperations = async (
  operations: Array<Record<string, unknown>>,
  executor: SqlExecutor = pool,
): Promise<Array<Record<string, unknown>>> => {
  const scheduleRows = operations
    .map((operation) => ({
      schedule_id: Number(operation.id),
      operation_id: Number(operation.operation_id),
    }))
    .filter((row) => Number.isFinite(row.schedule_id) && Number.isFinite(row.operation_id));

  if (!scheduleRows.length) {
    return operations;
  }

  const effectiveMap = await getEffectiveRulesForSchedules(scheduleRows, executor);

  return operations.map((operation) => {
    const effective = effectiveMap.get(Number(operation.id));
    return {
      ...operation,
      resource_rule_source_scope: effective?.source_scope ?? 'NONE',
      resource_requirements: effective?.requirements ?? [],
      resource_summary: summarizeRequirements(effective?.requirements ?? []),
    };
  });
};

export const explainTemplateRuleLoadError = (error: unknown): string | null => {
  if (!isMissingTableError(error)) {
    return null;
  }

  return `Missing table: ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'}`;
};

