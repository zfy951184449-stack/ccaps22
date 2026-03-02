import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  ResourceCandidateView,
  ResourceRequirementView,
  ResourceRuleSourceScope,
  getEffectiveRulesForSchedules,
} from './templateResourceRuleService';
import { SqlExecutor, toCandidateResourceIds, validateCandidateResources } from './operationResourceBindingService';

export type BatchOperationResourceRulesResponse = {
  batch_operation_plan_id: number;
  operation_id: number;
  template_schedule_id: number | null;
  source_scope: ResourceRuleSourceScope;
  requirements: Array<ResourceRequirementView & { source_scope?: ResourceRuleSourceScope }>;
};

type BatchOperationRow = {
  batch_operation_plan_id: number;
  operation_id: number;
  template_schedule_id: number | null;
};

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

const loadBatchOperation = async (executor: SqlExecutor, batchOperationPlanId: number): Promise<BatchOperationRow | null> => {
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        id AS batch_operation_plan_id,
        operation_id,
        template_schedule_id
     FROM batch_operation_plans
     WHERE id = ?
     LIMIT 1`,
    [batchOperationPlanId],
  );

  if (!rows.length) {
    return null;
  }

  return {
    batch_operation_plan_id: Number(rows[0].batch_operation_plan_id),
    operation_id: Number(rows[0].operation_id),
    template_schedule_id: rows[0].template_schedule_id === null ? null : Number(rows[0].template_schedule_id),
  };
};

const loadBatchSnapshotRows = async (
  executor: SqlExecutor,
  batchOperationPlanIds: number[],
): Promise<RowDataPacket[]> => {
  if (!batchOperationPlanIds.length) {
    return [];
  }

  const placeholders = batchOperationPlanIds.map(() => '?').join(', ');
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT *
     FROM batch_operation_resource_requirements
     WHERE batch_operation_plan_id IN (${placeholders})
     ORDER BY batch_operation_plan_id, resource_type, id`,
    batchOperationPlanIds,
  );
  return rows;
};

const loadBatchCandidateMap = async (
  executor: SqlExecutor,
  requirementIds: number[],
): Promise<Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>> => {
  const map = new Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>();
  if (!requirementIds.length) {
    return map;
  }

  const placeholders = requirementIds.map(() => '?').join(', ');
  const [rows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        brc.requirement_id,
        r.id,
        r.resource_code,
        r.resource_name,
        r.resource_type
     FROM batch_operation_resource_candidates brc
     JOIN resources r ON r.id = brc.resource_id
     WHERE brc.requirement_id IN (${placeholders})
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
};

const toBatchRequirementView = (
  row: RowDataPacket,
  candidateMap: Map<number, { candidate_resource_ids: number[]; candidate_resources: ResourceCandidateView[] }>,
) => ({
  id: Number(row.id),
  resource_type: String(row.resource_type),
  required_count: Number(row.required_count ?? 1),
  is_mandatory: toBoolean(row.is_mandatory),
  requires_exclusive_use: toBoolean(row.requires_exclusive_use),
  prep_minutes: Number(row.prep_minutes ?? 0),
  changeover_minutes: Number(row.changeover_minutes ?? 0),
  cleanup_minutes: Number(row.cleanup_minutes ?? 0),
  source_scope: String(row.source_scope) as ResourceRuleSourceScope,
  candidate_resource_ids: candidateMap.get(Number(row.id))?.candidate_resource_ids ?? [],
  candidate_resources: candidateMap.get(Number(row.id))?.candidate_resources ?? [],
});

const deleteBatchRequirementRows = async (executor: SqlExecutor, batchOperationPlanId: number): Promise<void> => {
  const [existingRows] = await executor.execute<RowDataPacket[]>(
    `SELECT id
     FROM batch_operation_resource_requirements
     WHERE batch_operation_plan_id = ?`,
    [batchOperationPlanId],
  );

  const requirementIds = existingRows.map((row) => Number(row.id));
  if (requirementIds.length) {
    const placeholders = requirementIds.map(() => '?').join(', ');
    await executor.execute(
      `DELETE FROM batch_operation_resource_candidates
       WHERE requirement_id IN (${placeholders})`,
      requirementIds,
    );
  }

  await executor.execute(
    'DELETE FROM batch_operation_resource_requirements WHERE batch_operation_plan_id = ?',
    [batchOperationPlanId],
  );
};

const insertBatchRequirements = async (
  executor: SqlExecutor,
  batchOperationPlanId: number,
  requirements: Array<ResourceRequirementView & { source_scope: ResourceRuleSourceScope }>,
): Promise<void> => {
  for (const requirement of requirements) {
    const [insertResult] = await executor.execute<ResultSetHeader>(
      `INSERT INTO batch_operation_resource_requirements (
        batch_operation_plan_id, resource_type, required_count, is_mandatory,
        requires_exclusive_use, prep_minutes, changeover_minutes, cleanup_minutes,
        source_scope, source_requirement_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        batchOperationPlanId,
        requirement.resource_type,
        requirement.required_count,
        requirement.is_mandatory ? 1 : 0,
        requirement.requires_exclusive_use ? 1 : 0,
        requirement.prep_minutes,
        requirement.changeover_minutes,
        requirement.cleanup_minutes,
        requirement.source_scope,
        requirement.id,
      ],
    );

    const candidateIds = toCandidateResourceIds(requirement.candidate_resource_ids);
    if (candidateIds.length) {
      const valuesClause = candidateIds.map(() => '(?, ?)').join(', ');
      const params = candidateIds.flatMap((resourceId) => [insertResult.insertId, resourceId]);
      await executor.execute(
        `INSERT INTO batch_operation_resource_candidates (requirement_id, resource_id)
         VALUES ${valuesClause}`,
        params,
      );
    }
  }
};

export const getBatchOperationResourceRules = async (
  batchOperationPlanId: number,
  executor: SqlExecutor = pool,
): Promise<BatchOperationResourceRulesResponse | null> => {
  const batchOperation = await loadBatchOperation(executor, batchOperationPlanId);
  if (!batchOperation) {
    return null;
  }

  const snapshotRows = await loadBatchSnapshotRows(executor, [batchOperationPlanId]);
  if (snapshotRows.length) {
    const candidateMap = await loadBatchCandidateMap(
      executor,
      snapshotRows.map((row) => Number(row.id)),
    );
    const requirements = snapshotRows.map((row) => toBatchRequirementView(row, candidateMap));
    const sourceScope = requirements.some((item) => item.source_scope === 'BATCH_OVERRIDE')
      ? 'BATCH_OVERRIDE'
      : (requirements[0]?.source_scope ?? 'NONE');

    return {
      batch_operation_plan_id: batchOperation.batch_operation_plan_id,
      operation_id: batchOperation.operation_id,
      template_schedule_id: batchOperation.template_schedule_id,
      source_scope: sourceScope,
      requirements,
    };
  }

  if (!batchOperation.template_schedule_id) {
    return {
      batch_operation_plan_id: batchOperation.batch_operation_plan_id,
      operation_id: batchOperation.operation_id,
      template_schedule_id: null,
      source_scope: 'NONE',
      requirements: [],
    };
  }

  const effectiveMap = await getEffectiveRulesForSchedules(
    [{ schedule_id: batchOperation.template_schedule_id, operation_id: batchOperation.operation_id }],
    executor,
  );
  const effective = effectiveMap.get(batchOperation.template_schedule_id);

  return {
    batch_operation_plan_id: batchOperation.batch_operation_plan_id,
    operation_id: batchOperation.operation_id,
    template_schedule_id: batchOperation.template_schedule_id,
    source_scope: effective?.source_scope ?? 'NONE',
    requirements: (effective?.requirements ?? []).map((requirement) => ({
      ...requirement,
      source_scope: effective?.source_scope ?? 'NONE',
    })),
  };
};

export const snapshotBatchPlanResourceRules = async (
  executor: SqlExecutor,
  batchPlanId: number,
): Promise<void> => {
  const [batchRows] = await executor.execute<RowDataPacket[]>(
    `SELECT
        pbp.id AS batch_plan_id,
        pbp.plan_status,
        bop.id AS batch_operation_plan_id,
        bop.operation_id,
        bop.template_schedule_id
     FROM production_batch_plans pbp
     JOIN batch_operation_plans bop ON bop.batch_plan_id = pbp.id
     WHERE pbp.id = ?
     ORDER BY bop.id`,
    [batchPlanId],
  );

  if (!batchRows.length) {
    return;
  }

  if (String(batchRows[0].plan_status).toUpperCase() !== 'DRAFT') {
    return;
  }

  const scheduleRows = batchRows
    .filter((row) => row.template_schedule_id !== null)
    .map((row) => ({
      schedule_id: Number(row.template_schedule_id),
      operation_id: Number(row.operation_id),
    }));

  const effectiveMap = await getEffectiveRulesForSchedules(scheduleRows, executor);

  for (const row of batchRows) {
    const batchOperationPlanId = Number(row.batch_operation_plan_id);
    await deleteBatchRequirementRows(executor, batchOperationPlanId);

    if (row.template_schedule_id === null) {
      continue;
    }

    const effective = effectiveMap.get(Number(row.template_schedule_id));
    if (!effective || !effective.requirements.length) {
      continue;
    }

    await insertBatchRequirements(
      executor,
      batchOperationPlanId,
      effective.requirements.map((requirement) => ({
        ...requirement,
        source_scope: effective.source_scope === 'TEMPLATE_OVERRIDE' ? 'TEMPLATE_OVERRIDE' : 'GLOBAL_DEFAULT',
      })),
    );
  }
};

export const replaceBatchOperationRules = async (
  executor: SqlExecutor,
  batchOperationPlanId: number,
  rawRequirements: unknown,
): Promise<void> => {
  const batchOperation = await loadBatchOperation(executor, batchOperationPlanId);
  if (!batchOperation) {
    throw new Error('Batch operation plan not found');
  }

  const requirements = Array.isArray(rawRequirements) ? rawRequirements : [];

  for (const item of requirements) {
    const resourceType = String((item as Record<string, unknown>).resource_type ?? '');
    if (!resourceType) {
      throw new Error('resource_type is required');
    }

    const candidateResourceIds = toCandidateResourceIds((item as Record<string, unknown>).candidate_resource_ids ?? []);
    const validation = await validateCandidateResources(executor, candidateResourceIds, resourceType);
    if (!validation.valid) {
      throw new Error(validation.message);
    }
  }

  await deleteBatchRequirementRows(executor, batchOperationPlanId);

  const normalizedRequirements = requirements.map((item) => ({
    id: null,
    resource_type: String((item as Record<string, unknown>).resource_type ?? ''),
    required_count: Number((item as Record<string, unknown>).required_count ?? 1),
    is_mandatory: (item as Record<string, unknown>).is_mandatory !== false,
    requires_exclusive_use: (item as Record<string, unknown>).requires_exclusive_use !== false,
    prep_minutes: Number((item as Record<string, unknown>).prep_minutes ?? 0),
    changeover_minutes: Number((item as Record<string, unknown>).changeover_minutes ?? 0),
    cleanup_minutes: Number((item as Record<string, unknown>).cleanup_minutes ?? 0),
    candidate_resource_ids: toCandidateResourceIds((item as Record<string, unknown>).candidate_resource_ids ?? []),
    candidate_resources: [],
    source_scope: 'BATCH_OVERRIDE' as const,
  }));

  await insertBatchRequirements(executor, batchOperationPlanId, normalizedRequirements);
};

export const upsertBatchOperationRule = async (
  executor: SqlExecutor,
  batchOperationPlanId: number,
  rawRequirement: Record<string, unknown>,
): Promise<void> => {
  const resourceType = String(rawRequirement.resource_type ?? '');
  if (!resourceType) {
    throw new Error('resource_type is required');
  }

  const current = await getBatchOperationResourceRules(batchOperationPlanId, executor);
  if (!current) {
    throw new Error('Batch operation plan not found');
  }

  const nextRequirements = current.requirements
    .filter((requirement) => requirement.resource_type !== resourceType)
    .map((requirement) => ({
      resource_type: requirement.resource_type,
      required_count: requirement.required_count,
      is_mandatory: requirement.is_mandatory,
      requires_exclusive_use: requirement.requires_exclusive_use,
      prep_minutes: requirement.prep_minutes,
      changeover_minutes: requirement.changeover_minutes,
      cleanup_minutes: requirement.cleanup_minutes,
      candidate_resource_ids: requirement.candidate_resource_ids,
    }));

  nextRequirements.push({
    resource_type: resourceType,
    required_count: Number(rawRequirement.required_count ?? 1),
    is_mandatory: rawRequirement.is_mandatory !== false,
    requires_exclusive_use: rawRequirement.requires_exclusive_use !== false,
    prep_minutes: Number(rawRequirement.prep_minutes ?? 0),
    changeover_minutes: Number(rawRequirement.changeover_minutes ?? 0),
    cleanup_minutes: Number(rawRequirement.cleanup_minutes ?? 0),
    candidate_resource_ids: toCandidateResourceIds(rawRequirement.candidate_resource_ids ?? []),
  });

  await replaceBatchOperationRules(executor, batchOperationPlanId, nextRequirements);
};
