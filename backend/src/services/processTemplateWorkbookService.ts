import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import pool from '../config/database';
import { updateTemplateTotalDays } from '../controllers/processTemplateController';
import { upsertTemplateScheduleBinding } from './resourceNodeService';
import { replaceTemplateScheduleRules } from './templateResourceRuleService';
import { extractMissingTableName, isMissingTableError } from '../utils/platformFeatureGuard';

export type WorkbookImportMode = 'create' | 'replace';

export type WorkbookTemplateRow = {
  template_code: string;
  template_name: string;
  description: string | null;
  team_code: string | null;
  total_days: number | null;
};

export type WorkbookStageRow = {
  template_code: string;
  stage_code: string;
  stage_name: string;
  stage_order: number;
  start_day: number;
  description: string | null;
};

export type WorkbookOperationRow = {
  template_code: string;
  stage_code: string;
  schedule_key: string;
  operation_code: string;
  operation_name: string | null;
  operation_day: number;
  recommended_time: number;
  recommended_day_offset: number;
  window_start_time: number;
  window_start_day_offset: number;
  window_end_time: number;
  window_end_day_offset: number;
  operation_order: number;
};

export type WorkbookConstraintRow = {
  template_code: string;
  constraint_name: string | null;
  from_schedule_key: string;
  to_schedule_key: string;
  constraint_type: 'FS' | 'SS' | 'FF' | 'SF';
  constraint_level: number;
  lag_time: number;
  lag_type: string;
  lag_min: number;
  lag_max: number | null;
  share_mode: string;
  description: string | null;
};

export type WorkbookShareGroupRow = {
  template_code: string;
  group_code: string;
  group_name: string | null;
  share_mode: string;
};

export type WorkbookShareGroupMemberRow = {
  template_code: string;
  group_code: string;
  schedule_key: string;
};

export type WorkbookResourceBindingRow = {
  template_code: string;
  schedule_key: string;
  resource_node_code: string;
};

export type WorkbookResourceRequirementRow = {
  template_code: string;
  schedule_key: string;
  requirement_order: number;
  resource_type: string;
  required_count: number;
  is_mandatory: boolean;
  requires_exclusive_use: boolean;
  prep_minutes: number;
  changeover_minutes: number;
  cleanup_minutes: number;
  candidate_resource_codes: string[];
};

export type ProcessTemplateWorkbookData = {
  format_version: 'process-template-workbook-v1';
  exported_at: string;
  warnings: string[];
  templates: WorkbookTemplateRow[];
  stages: WorkbookStageRow[];
  operations: WorkbookOperationRow[];
  constraints: WorkbookConstraintRow[];
  share_groups: WorkbookShareGroupRow[];
  share_group_members: WorkbookShareGroupMemberRow[];
  resource_bindings: WorkbookResourceBindingRow[];
  resource_requirements: WorkbookResourceRequirementRow[];
};

export type ProcessTemplateWorkbookImportPayload = {
  format_version?: string;
  mode?: WorkbookImportMode;
  templates?: WorkbookTemplateRow[];
  stages?: WorkbookStageRow[];
  operations?: WorkbookOperationRow[];
  constraints?: WorkbookConstraintRow[];
  share_groups?: WorkbookShareGroupRow[];
  share_group_members?: WorkbookShareGroupMemberRow[];
  resource_bindings?: WorkbookResourceBindingRow[];
  resource_requirements?: WorkbookResourceRequirementRow[];
};

export type ProcessTemplateWorkbookImportResult = {
  mode: WorkbookImportMode;
  created_count: number;
  replaced_count: number;
  warnings: string[];
  templates: Array<{
    template_code: string;
    template_id: number;
    action: 'created' | 'replaced';
  }>;
};

type ExistingTemplateRow = RowDataPacket & {
  id: number;
  template_code: string;
  template_name: string;
};

type ExistingLookupMap = Map<string, number>;

const CONSTRAINT_TYPE_TO_CODE: Record<WorkbookConstraintRow['constraint_type'], number> = {
  FS: 1,
  SS: 2,
  FF: 3,
  SF: 4,
};

const CONSTRAINT_CODE_TO_TYPE: Record<number, WorkbookConstraintRow['constraint_type']> = {
  1: 'FS',
  2: 'SS',
  3: 'FF',
  4: 'SF',
};

const VALID_SHARE_MODES = new Set(['NONE', 'SAME_TEAM', 'DIFFERENT']);
const VALID_LAG_TYPES = new Set(['FIXED', 'WINDOW']);
const SCHEDULE_KEY_PREFIX = 'SCH-';

export class ProcessTemplateWorkbookError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = 'ProcessTemplateWorkbookError';
    this.status = status;
    this.details = details;
  }
}

const normalizeString = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeNullableString = (value: unknown): string | null => {
  const next = normalizeString(value);
  return next ? next : null;
};

const parseOptionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const parseRequiredNumber = (value: unknown, fieldName: string): number => {
  const next = Number(value);
  if (!Number.isFinite(next)) {
    throw new ProcessTemplateWorkbookError(`${fieldName} must be a valid number`);
  }
  return next;
};

const toBoolean = (value: unknown): boolean =>
  value === true ||
  value === 1 ||
  value === '1' ||
  (typeof value === 'string' && ['true', 'yes', 'y'].includes(value.trim().toLowerCase()));

const buildScheduleKey = (scheduleId: number): string => `${SCHEDULE_KEY_PREFIX}${scheduleId}`;

const listToMap = <T>(
  rows: T[],
  keyGetter: (row: T) => string,
): Map<string, T> => new Map(rows.map((row) => [keyGetter(row), row]));

const groupBy = <T>(
  rows: T[],
  keyGetter: (row: T) => string,
): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyGetter(row);
    const current = map.get(key) ?? [];
    current.push(row);
    map.set(key, current);
  });
  return map;
};

const createInClause = (items: Array<string | number>) => items.map(() => '?').join(', ');

const ensureUnique = (values: string[], label: string) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value);
      return;
    }
    seen.add(value);
  });

  if (duplicates.size > 0) {
    throw new ProcessTemplateWorkbookError(`${label} contains duplicate keys`, 400, Array.from(duplicates));
  }
};

const normalizeTemplates = (value: unknown): WorkbookTemplateRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      template_name: normalizeString(row.template_name),
      description: normalizeNullableString(row.description),
      team_code: normalizeNullableString(row.team_code),
      total_days: parseOptionalNumber(row.total_days),
    };
  });
};

const normalizeStages = (value: unknown): WorkbookStageRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      stage_code: normalizeString(row.stage_code),
      stage_name: normalizeString(row.stage_name),
      stage_order: parseRequiredNumber(row.stage_order, 'stage_order'),
      start_day: parseRequiredNumber(row.start_day, 'start_day'),
      description: normalizeNullableString(row.description),
    };
  });
};

const normalizeOperations = (value: unknown): WorkbookOperationRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      stage_code: normalizeString(row.stage_code),
      schedule_key: normalizeString(row.schedule_key),
      operation_code: normalizeString(row.operation_code),
      operation_name: normalizeNullableString(row.operation_name),
      operation_day: parseRequiredNumber(row.operation_day, 'operation_day'),
      recommended_time: parseRequiredNumber(row.recommended_time, 'recommended_time'),
      recommended_day_offset: parseRequiredNumber(row.recommended_day_offset ?? 0, 'recommended_day_offset'),
      window_start_time: parseRequiredNumber(row.window_start_time, 'window_start_time'),
      window_start_day_offset: parseRequiredNumber(row.window_start_day_offset ?? 0, 'window_start_day_offset'),
      window_end_time: parseRequiredNumber(row.window_end_time, 'window_end_time'),
      window_end_day_offset: parseRequiredNumber(row.window_end_day_offset ?? 0, 'window_end_day_offset'),
      operation_order: parseRequiredNumber(row.operation_order, 'operation_order'),
    };
  });
};

const normalizeConstraints = (value: unknown): WorkbookConstraintRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const constraintType = normalizeString(row.constraint_type).toUpperCase() as WorkbookConstraintRow['constraint_type'];
    const lagType = normalizeString(row.lag_type).toUpperCase() || 'FIXED';
    const shareMode = normalizeString(row.share_mode).toUpperCase() || 'NONE';

    return {
      template_code: normalizeString(row.template_code),
      constraint_name: normalizeNullableString(row.constraint_name),
      from_schedule_key: normalizeString(row.from_schedule_key),
      to_schedule_key: normalizeString(row.to_schedule_key),
      constraint_type: constraintType,
      constraint_level: parseRequiredNumber(row.constraint_level ?? 1, 'constraint_level'),
      lag_time: parseRequiredNumber(row.lag_time ?? 0, 'lag_time'),
      lag_type: lagType,
      lag_min: parseRequiredNumber(row.lag_min ?? 0, 'lag_min'),
      lag_max: parseOptionalNumber(row.lag_max),
      share_mode: shareMode,
      description: normalizeNullableString(row.description),
    };
  });
};

const normalizeShareGroups = (value: unknown): WorkbookShareGroupRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      group_code: normalizeString(row.group_code),
      group_name: normalizeNullableString(row.group_name),
      share_mode: normalizeString(row.share_mode).toUpperCase() || 'SAME_TEAM',
    };
  });
};

const normalizeShareGroupMembers = (value: unknown): WorkbookShareGroupMemberRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      group_code: normalizeString(row.group_code),
      schedule_key: normalizeString(row.schedule_key),
    };
  });
};

const normalizeResourceBindings = (value: unknown): WorkbookResourceBindingRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      template_code: normalizeString(row.template_code),
      schedule_key: normalizeString(row.schedule_key),
      resource_node_code: normalizeString(row.resource_node_code),
    };
  }).filter((row) => row.resource_node_code);
};

const normalizeResourceRequirements = (value: unknown): WorkbookResourceRequirementRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const candidateCodes = Array.isArray(row.candidate_resource_codes)
      ? row.candidate_resource_codes.map((code) => normalizeString(code)).filter(Boolean)
      : [];

    return {
      template_code: normalizeString(row.template_code),
      schedule_key: normalizeString(row.schedule_key),
      requirement_order: parseRequiredNumber(row.requirement_order ?? 1, 'requirement_order'),
      resource_type: normalizeString(row.resource_type).toUpperCase(),
      required_count: parseRequiredNumber(row.required_count ?? 1, 'required_count'),
      is_mandatory: row.is_mandatory === undefined ? true : toBoolean(row.is_mandatory),
      requires_exclusive_use:
        row.requires_exclusive_use === undefined ? true : toBoolean(row.requires_exclusive_use),
      prep_minutes: parseRequiredNumber(row.prep_minutes ?? 0, 'prep_minutes'),
      changeover_minutes: parseRequiredNumber(row.changeover_minutes ?? 0, 'changeover_minutes'),
      cleanup_minutes: parseRequiredNumber(row.cleanup_minutes ?? 0, 'cleanup_minutes'),
      candidate_resource_codes: candidateCodes,
    };
  });
};

const assertWorkbookReferences = (
  templates: WorkbookTemplateRow[],
  stages: WorkbookStageRow[],
  operations: WorkbookOperationRow[],
  constraints: WorkbookConstraintRow[],
  shareGroups: WorkbookShareGroupRow[],
  shareGroupMembers: WorkbookShareGroupMemberRow[],
  resourceBindings: WorkbookResourceBindingRow[],
  resourceRequirements: WorkbookResourceRequirementRow[],
) => {
  if (!templates.length) {
    throw new ProcessTemplateWorkbookError('Workbook must contain at least one template');
  }

  ensureUnique(templates.map((row) => row.template_code), 'templates');
  templates.forEach((row) => {
    if (!row.template_code || !row.template_name) {
      throw new ProcessTemplateWorkbookError('template_code and template_name are required');
    }
  });

  const templateCodeSet = new Set(templates.map((row) => row.template_code));

  stages.forEach((row) => {
    if (!row.template_code || !row.stage_code || !row.stage_name) {
      throw new ProcessTemplateWorkbookError('stage rows require template_code, stage_code and stage_name');
    }
    if (!templateCodeSet.has(row.template_code)) {
      throw new ProcessTemplateWorkbookError(`Unknown template_code in stages: ${row.template_code}`);
    }
  });
  ensureUnique(stages.map((row) => `${row.template_code}::${row.stage_code}`), 'stages');

  const stageKeySet = new Set(stages.map((row) => `${row.template_code}::${row.stage_code}`));

  operations.forEach((row) => {
    if (!row.template_code || !row.stage_code || !row.schedule_key || !row.operation_code) {
      throw new ProcessTemplateWorkbookError(
        'operation rows require template_code, stage_code, schedule_key and operation_code',
      );
    }
    if (!stageKeySet.has(`${row.template_code}::${row.stage_code}`)) {
      throw new ProcessTemplateWorkbookError(
        `Unknown stage reference for operation ${row.schedule_key}: ${row.template_code}/${row.stage_code}`,
      );
    }
  });
  ensureUnique(operations.map((row) => `${row.template_code}::${row.schedule_key}`), 'operations');
  ensureUnique(operations.map((row) => `${row.template_code}::${row.stage_code}::${row.operation_order}`), 'stage operation order');

  const scheduleKeySet = new Set(operations.map((row) => `${row.template_code}::${row.schedule_key}`));

  constraints.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.from_schedule_key}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown from_schedule_key in constraints: ${row.from_schedule_key}`);
    }
    if (!scheduleKeySet.has(`${row.template_code}::${row.to_schedule_key}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown to_schedule_key in constraints: ${row.to_schedule_key}`);
    }
    if (!CONSTRAINT_TYPE_TO_CODE[row.constraint_type]) {
      throw new ProcessTemplateWorkbookError(`Unsupported constraint_type: ${row.constraint_type}`);
    }
    if (!VALID_LAG_TYPES.has(row.lag_type)) {
      throw new ProcessTemplateWorkbookError(`Unsupported lag_type: ${row.lag_type}`);
    }
    if (!VALID_SHARE_MODES.has(row.share_mode)) {
      throw new ProcessTemplateWorkbookError(`Unsupported share_mode: ${row.share_mode}`);
    }
  });

  shareGroups.forEach((row) => {
    if (!templateCodeSet.has(row.template_code)) {
      throw new ProcessTemplateWorkbookError(`Unknown template_code in share_groups: ${row.template_code}`);
    }
    if (!row.group_code) {
      throw new ProcessTemplateWorkbookError('share_groups rows require group_code');
    }
  });
  ensureUnique(shareGroups.map((row) => `${row.template_code}::${row.group_code}`), 'share_groups');

  const groupKeySet = new Set(shareGroups.map((row) => `${row.template_code}::${row.group_code}`));
  shareGroupMembers.forEach((row) => {
    if (!groupKeySet.has(`${row.template_code}::${row.group_code}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown share group for member: ${row.group_code}`);
    }
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown schedule_key in share_group_members: ${row.schedule_key}`);
    }
  });
  ensureUnique(
    shareGroupMembers.map((row) => `${row.template_code}::${row.group_code}::${row.schedule_key}`),
    'share_group_members',
  );

  resourceBindings.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown schedule_key in resource_bindings: ${row.schedule_key}`);
    }
  });
  ensureUnique(resourceBindings.map((row) => `${row.template_code}::${row.schedule_key}`), 'resource_bindings');

  resourceRequirements.forEach((row) => {
    if (!scheduleKeySet.has(`${row.template_code}::${row.schedule_key}`)) {
      throw new ProcessTemplateWorkbookError(`Unknown schedule_key in resource_requirements: ${row.schedule_key}`);
    }
    if (!row.resource_type) {
      throw new ProcessTemplateWorkbookError('resource_requirements rows require resource_type');
    }
  });
  ensureUnique(
    resourceRequirements.map((row) => `${row.template_code}::${row.schedule_key}::${row.requirement_order}`),
    'resource_requirements',
  );
};

const loadExistingLookupMap = async (
  tableName: string,
  keyColumn: string,
  idColumn: string,
  values: string[],
): Promise<ExistingLookupMap> => {
  const map = new Map<string, number>();

  if (!values.length) {
    return map;
  }

  const placeholders = createInClause(values);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT ${idColumn} AS id, ${keyColumn} AS key_value
     FROM ${tableName}
     WHERE ${keyColumn} IN (${placeholders})`,
    values,
  );

  rows.forEach((row) => {
    map.set(String(row.key_value), Number(row.id));
  });

  return map;
};

const loadResourceBindings = async (
  scheduleIds: number[],
  warnings: string[],
): Promise<WorkbookResourceBindingRow[]> => {
  if (!scheduleIds.length) {
    return [];
  }

  try {
    const placeholders = createInClause(scheduleIds);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          b.template_schedule_id,
          rn.node_code AS resource_node_code
       FROM template_stage_operation_resource_bindings b
       JOIN resource_nodes rn ON rn.id = b.resource_node_id
       WHERE b.template_schedule_id IN (${placeholders})
       ORDER BY b.template_schedule_id`,
      scheduleIds,
    );

    return rows.map((row) => ({
      template_code: '',
      schedule_key: buildScheduleKey(Number(row.template_schedule_id)),
      resource_node_code: String(row.resource_node_code),
    }));
  } catch (error) {
    if (isMissingTableError(error)) {
      warnings.push(
        `Skipped resource bindings export because table ${extractMissingTableName(error) ?? 'template_stage_operation_resource_bindings'} is missing.`,
      );
      return [];
    }
    throw error;
  }
};

const loadResourceRequirements = async (
  scheduleIds: number[],
  warnings: string[],
): Promise<WorkbookResourceRequirementRow[]> => {
  if (!scheduleIds.length) {
    return [];
  }

  try {
    const placeholders = createInClause(scheduleIds);
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          req.template_schedule_id,
          req.id AS requirement_id,
          req.resource_type,
          req.required_count,
          req.is_mandatory,
          req.requires_exclusive_use,
          req.prep_minutes,
          req.changeover_minutes,
          req.cleanup_minutes,
          r.resource_code
       FROM template_operation_resource_requirements req
       LEFT JOIN template_operation_resource_candidates cand ON cand.requirement_id = req.id
       LEFT JOIN resources r ON r.id = cand.resource_id
       WHERE req.template_schedule_id IN (${placeholders})
       ORDER BY req.template_schedule_id, req.id, r.resource_code`,
      scheduleIds,
    );

    const requirementOrderMap = new Map<string, number>();
    const scheduleOrderCounter = new Map<number, number>();
    const grouped = new Map<string, WorkbookResourceRequirementRow>();

    rows.forEach((row) => {
      const scheduleId = Number(row.template_schedule_id);
      const requirementId = Number(row.requirement_id);
      const orderKey = `${scheduleId}::${requirementId}`;
      const currentOrder = requirementOrderMap.get(orderKey);
      const nextScheduleOrder = (scheduleOrderCounter.get(scheduleId) ?? 0) + 1;
      const requirementOrder = currentOrder ?? nextScheduleOrder;

      requirementOrderMap.set(orderKey, requirementOrder);
      if (!currentOrder) {
        scheduleOrderCounter.set(scheduleId, nextScheduleOrder);
      }

      const groupKey = `${scheduleId}::${requirementId}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        if (row.resource_code) {
          existing.candidate_resource_codes.push(String(row.resource_code));
        }
        return;
      }

      grouped.set(groupKey, {
        template_code: '',
        schedule_key: buildScheduleKey(scheduleId),
        requirement_order: requirementOrder,
        resource_type: String(row.resource_type),
        required_count: Number(row.required_count ?? 1),
        is_mandatory: toBoolean(row.is_mandatory),
        requires_exclusive_use: toBoolean(row.requires_exclusive_use),
        prep_minutes: Number(row.prep_minutes ?? 0),
        changeover_minutes: Number(row.changeover_minutes ?? 0),
        cleanup_minutes: Number(row.cleanup_minutes ?? 0),
        candidate_resource_codes: row.resource_code ? [String(row.resource_code)] : [],
      });
    });

    return Array.from(grouped.values());
  } catch (error) {
    if (isMissingTableError(error)) {
      warnings.push(
        `Skipped resource requirements export because table ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'} is missing.`,
      );
      return [];
    }
    throw error;
  }
};

const remapTemplateCode = <T extends { schedule_key: string; template_code: string }>(
  rows: T[],
  scheduleTemplateMap: Map<string, string>,
): T[] =>
  rows.map((row) => ({
    ...row,
    template_code: scheduleTemplateMap.get(row.schedule_key) ?? row.template_code,
  }));

export const exportProcessTemplateWorkbook = async (
  templateIds?: number[],
): Promise<ProcessTemplateWorkbookData> => {
  const warnings: string[] = [];
  const params: number[] = [];
  let whereClause = '';

  if (templateIds?.length) {
    whereClause = `WHERE pt.id IN (${createInClause(templateIds)})`;
    params.push(...templateIds);
  }

  const [templateRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        pt.id,
        pt.template_code,
        pt.template_name,
        pt.description,
        pt.total_days,
        ou.unit_code AS team_code
     FROM process_templates pt
     LEFT JOIN organization_units ou ON ou.id = pt.team_id
     ${whereClause}
     ORDER BY pt.template_code`,
    params,
  );

  if (!templateRows.length) {
    return {
      format_version: 'process-template-workbook-v1',
      exported_at: new Date().toISOString(),
      warnings,
      templates: [],
      stages: [],
      operations: [],
      constraints: [],
      share_groups: [],
      share_group_members: [],
      resource_bindings: [],
      resource_requirements: [],
    };
  }

  const templateIdList = templateRows.map((row) => Number(row.id));
  const stageWhere = createInClause(templateIdList);
  const [stageRows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        ps.id,
        ps.template_id,
        pt.template_code,
        ps.stage_code,
        ps.stage_name,
        ps.stage_order,
        ps.start_day,
        ps.description
     FROM process_stages ps
     JOIN process_templates pt ON pt.id = ps.template_id
     WHERE ps.template_id IN (${stageWhere})
     ORDER BY pt.template_code, ps.stage_order, ps.id`,
    templateIdList,
  );

  const stageIdList = stageRows.map((row) => Number(row.id));
  const operationRows: WorkbookOperationRow[] = [];
  const constraints: WorkbookConstraintRow[] = [];
  const shareGroups: WorkbookShareGroupRow[] = [];
  const shareGroupMembers: WorkbookShareGroupMemberRow[] = [];
  let resourceBindings: WorkbookResourceBindingRow[] = [];
  let resourceRequirements: WorkbookResourceRequirementRow[] = [];

  const scheduleTemplateMap = new Map<string, string>();

  if (stageIdList.length) {
    const operationWhere = createInClause(stageIdList);
    const [operationQueryRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          sos.id,
          sos.stage_id,
          pt.template_code,
          ps.stage_code,
          o.operation_code,
          o.operation_name,
          sos.operation_day,
          sos.recommended_time,
          sos.recommended_day_offset,
          sos.window_start_time,
          sos.window_start_day_offset,
          sos.window_end_time,
          sos.window_end_day_offset,
          sos.operation_order
       FROM stage_operation_schedules sos
       JOIN process_stages ps ON ps.id = sos.stage_id
       JOIN process_templates pt ON pt.id = ps.template_id
       JOIN operations o ON o.id = sos.operation_id
       WHERE sos.stage_id IN (${operationWhere})
       ORDER BY pt.template_code, ps.stage_order, sos.operation_order, sos.id`,
      stageIdList,
    );

    operationQueryRows.forEach((row) => {
      const scheduleKey = buildScheduleKey(Number(row.id));
      scheduleTemplateMap.set(scheduleKey, String(row.template_code));
      operationRows.push({
        template_code: String(row.template_code),
        stage_code: String(row.stage_code),
        schedule_key: scheduleKey,
        operation_code: String(row.operation_code),
        operation_name: row.operation_name ? String(row.operation_name) : null,
        operation_day: Number(row.operation_day),
        recommended_time: Number(row.recommended_time),
        recommended_day_offset: Number(row.recommended_day_offset ?? 0),
        window_start_time: Number(row.window_start_time),
        window_start_day_offset: Number(row.window_start_day_offset ?? 0),
        window_end_time: Number(row.window_end_time),
        window_end_day_offset: Number(row.window_end_day_offset ?? 0),
        operation_order: Number(row.operation_order ?? 0),
      });
    });

    const scheduleIdList = operationQueryRows.map((row) => Number(row.id));

    if (scheduleIdList.length) {
      const constraintWhere = createInClause(templateIdList);
      const [constraintRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            pt.template_code,
            oc.constraint_name,
            oc.schedule_id,
            oc.predecessor_schedule_id,
            oc.constraint_type,
            oc.constraint_level,
            oc.time_lag,
            oc.lag_type,
            oc.lag_min,
            oc.lag_max,
            oc.share_mode,
            oc.description
         FROM operation_constraints oc
         JOIN stage_operation_schedules from_sos ON from_sos.id = oc.schedule_id
         JOIN process_stages from_ps ON from_ps.id = from_sos.stage_id
         JOIN process_templates pt ON pt.id = from_ps.template_id
         WHERE from_ps.template_id IN (${constraintWhere})
         ORDER BY pt.template_code, oc.id`,
        templateIdList,
      );

      constraintRows.forEach((row) => {
        constraints.push({
          template_code: String(row.template_code),
          constraint_name: row.constraint_name ? String(row.constraint_name) : null,
          from_schedule_key: buildScheduleKey(Number(row.schedule_id)),
          to_schedule_key: buildScheduleKey(Number(row.predecessor_schedule_id)),
          constraint_type: CONSTRAINT_CODE_TO_TYPE[Number(row.constraint_type)] ?? 'FS',
          constraint_level: Number(row.constraint_level ?? 1),
          lag_time: Number(row.time_lag ?? 0),
          lag_type: row.lag_type ? String(row.lag_type) : 'FIXED',
          lag_min: Number(row.lag_min ?? 0),
          lag_max: parseOptionalNumber(row.lag_max),
          share_mode: row.share_mode ? String(row.share_mode) : 'NONE',
          description: row.description ? String(row.description) : null,
        });
      });

      try {
        const [shareGroupRows] = await pool.execute<RowDataPacket[]>(
          `SELECT
              pt.template_code,
              psg.id,
              psg.group_code,
              psg.group_name,
              psg.share_mode
           FROM personnel_share_groups psg
           JOIN process_templates pt ON pt.id = psg.template_id
           WHERE psg.template_id IN (${constraintWhere})
           ORDER BY pt.template_code, psg.group_code`,
          templateIdList,
        );

        const shareGroupIdList = shareGroupRows.map((row) => Number(row.id));
        shareGroupRows.forEach((row) => {
          shareGroups.push({
            template_code: String(row.template_code),
            group_code: String(row.group_code),
            group_name: row.group_name ? String(row.group_name) : null,
            share_mode: row.share_mode ? String(row.share_mode) : 'SAME_TEAM',
          });
        });

        if (shareGroupIdList.length) {
          const memberWhere = createInClause(shareGroupIdList);
          const [shareMemberRows] = await pool.execute<RowDataPacket[]>(
            `SELECT
                pt.template_code,
                psg.group_code,
                psgm.schedule_id
             FROM personnel_share_group_members psgm
             JOIN personnel_share_groups psg ON psg.id = psgm.group_id
             JOIN process_templates pt ON pt.id = psg.template_id
             WHERE psgm.group_id IN (${memberWhere})
             ORDER BY pt.template_code, psg.group_code, psgm.schedule_id`,
            shareGroupIdList,
          );

          shareMemberRows.forEach((row) => {
            shareGroupMembers.push({
              template_code: String(row.template_code),
              group_code: String(row.group_code),
              schedule_key: buildScheduleKey(Number(row.schedule_id)),
            });
          });
        }
      } catch (error) {
        if (isMissingTableError(error)) {
          warnings.push(
            `Skipped share groups export because table ${extractMissingTableName(error) ?? 'personnel_share_groups'} is missing.`,
          );
        } else {
          throw error;
        }
      }

      resourceBindings = remapTemplateCode(
        await loadResourceBindings(scheduleIdList, warnings),
        scheduleTemplateMap,
      );
      resourceRequirements = remapTemplateCode(
        await loadResourceRequirements(scheduleIdList, warnings),
        scheduleTemplateMap,
      );
    }
  }

  return {
    format_version: 'process-template-workbook-v1',
    exported_at: new Date().toISOString(),
    warnings,
    templates: templateRows.map((row) => ({
      template_code: String(row.template_code),
      template_name: String(row.template_name),
      description: row.description ? String(row.description) : null,
      team_code: row.team_code ? String(row.team_code) : null,
      total_days: parseOptionalNumber(row.total_days),
    })),
    stages: stageRows.map((row) => ({
      template_code: String(row.template_code),
      stage_code: String(row.stage_code),
      stage_name: String(row.stage_name),
      stage_order: Number(row.stage_order),
      start_day: Number(row.start_day),
      description: row.description ? String(row.description) : null,
    })),
    operations: operationRows,
    constraints,
    share_groups: shareGroups,
    share_group_members: shareGroupMembers,
    resource_bindings: resourceBindings,
    resource_requirements: resourceRequirements,
  };
};

const resolveTemplateId = async (
  connection: PoolConnection,
  template: WorkbookTemplateRow,
  mode: WorkbookImportMode,
  existingMap: Map<string, ExistingTemplateRow>,
  teamCodeMap: ExistingLookupMap,
): Promise<{ templateId: number; action: 'created' | 'replaced' }> => {
  const existing = existingMap.get(template.template_code);
  const teamId = template.team_code ? teamCodeMap.get(template.team_code) ?? null : null;

  if (!existing) {
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO process_templates (template_code, template_name, description, total_days, team_id)
       VALUES (?, ?, ?, ?, ?)`,
      [template.template_code, template.template_name, template.description, template.total_days ?? 1, teamId],
    );

    return {
      templateId: result.insertId,
      action: 'created',
    };
  }

  if (mode !== 'replace') {
    throw new ProcessTemplateWorkbookError(
      `Template code already exists and import mode is create: ${template.template_code}`,
      409,
    );
  }

  const [usageRows] = await connection.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS batch_count
     FROM production_batch_plans
     WHERE template_id = ?`,
    [existing.id],
  );

  if (Number(usageRows[0]?.batch_count ?? 0) > 0) {
    throw new ProcessTemplateWorkbookError(
      `Template ${template.template_code} is already used by batch plans and cannot be replaced`,
      409,
    );
  }

  await connection.execute(
    `UPDATE process_templates
     SET template_name = ?, description = ?, team_id = ?
     WHERE id = ?`,
    [template.template_name, template.description, teamId, existing.id],
  );
  try {
    await connection.execute('DELETE FROM personnel_share_groups WHERE template_id = ?', [existing.id]);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }
  await connection.execute('DELETE FROM process_stages WHERE template_id = ?', [existing.id]);

  return {
    templateId: existing.id,
    action: 'replaced',
  };
};

export const importProcessTemplateWorkbook = async (
  payload: ProcessTemplateWorkbookImportPayload,
): Promise<ProcessTemplateWorkbookImportResult> => {
  if (
    payload.format_version &&
    payload.format_version !== 'process-template-workbook-v1'
  ) {
    throw new ProcessTemplateWorkbookError(
      `Unsupported workbook format_version: ${payload.format_version}`,
      400,
    );
  }

  const mode: WorkbookImportMode = payload.mode === 'replace' ? 'replace' : 'create';
  const templates = normalizeTemplates(payload.templates);
  const stages = normalizeStages(payload.stages);
  const operations = normalizeOperations(payload.operations);
  const constraints = normalizeConstraints(payload.constraints);
  const shareGroups = normalizeShareGroups(payload.share_groups);
  const shareGroupMembers = normalizeShareGroupMembers(payload.share_group_members);
  const resourceBindings = normalizeResourceBindings(payload.resource_bindings);
  const resourceRequirements = normalizeResourceRequirements(payload.resource_requirements);

  assertWorkbookReferences(
    templates,
    stages,
    operations,
    constraints,
    shareGroups,
    shareGroupMembers,
    resourceBindings,
    resourceRequirements,
  );

  const warnings: string[] = [];
  const templateCodes = templates.map((row) => row.template_code);
  const operationCodes = Array.from(new Set(operations.map((row) => row.operation_code)));
  const teamCodes = Array.from(new Set(templates.map((row) => row.team_code).filter((code): code is string => Boolean(code))));
  const resourceNodeCodes = Array.from(new Set(resourceBindings.map((row) => row.resource_node_code)));
  const resourceCodes = Array.from(
    new Set(resourceRequirements.flatMap((row) => row.candidate_resource_codes).filter(Boolean)),
  );

  const [existingTemplateRows] = await pool.execute<ExistingTemplateRow[]>(
    `SELECT id, template_code, template_name
     FROM process_templates
     WHERE template_code IN (${createInClause(templateCodes)})`,
    templateCodes,
  );
  const existingTemplateMap = listToMap(existingTemplateRows, (row) => String(row.template_code));

  const operationCodeMap = await loadExistingLookupMap('operations', 'operation_code', 'id', operationCodes);
  const teamCodeMap = await loadExistingLookupMap('organization_units', 'unit_code', 'id', teamCodes);

  if (operationCodeMap.size !== operationCodes.length) {
    const missingCodes = operationCodes.filter((code) => !operationCodeMap.has(code));
    throw new ProcessTemplateWorkbookError('Workbook references unknown operation_code values', 400, missingCodes);
  }

  if (teamCodeMap.size !== teamCodes.length) {
    const missingCodes = teamCodes.filter((code) => !teamCodeMap.has(code));
    throw new ProcessTemplateWorkbookError('Workbook references unknown team_code values', 400, missingCodes);
  }

  let resourceNodeCodeMap = new Map<string, number>();
  if (resourceNodeCodes.length) {
    try {
      resourceNodeCodeMap = await loadExistingLookupMap('resource_nodes', 'node_code', 'id', resourceNodeCodes);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new ProcessTemplateWorkbookError(
          `Workbook includes resource bindings but table ${extractMissingTableName(error) ?? 'resource_nodes'} is missing`,
          409,
        );
      }
      throw error;
    }

    if (resourceNodeCodeMap.size !== resourceNodeCodes.length) {
      const missingCodes = resourceNodeCodes.filter((code) => !resourceNodeCodeMap.has(code));
      throw new ProcessTemplateWorkbookError('Workbook references unknown resource_node_code values', 400, missingCodes);
    }
  }

  let resourceCodeMap = new Map<string, number>();
  if (resourceCodes.length) {
    try {
      resourceCodeMap = await loadExistingLookupMap('resources', 'resource_code', 'id', resourceCodes);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new ProcessTemplateWorkbookError(
          `Workbook includes resource requirements but table ${extractMissingTableName(error) ?? 'resources'} is missing`,
          409,
        );
      }
      throw error;
    }

    if (resourceCodeMap.size !== resourceCodes.length) {
      const missingCodes = resourceCodes.filter((code) => !resourceCodeMap.has(code));
      throw new ProcessTemplateWorkbookError('Workbook references unknown candidate_resource_codes', 400, missingCodes);
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const stagesByTemplate = groupBy(stages, (row) => row.template_code);
    const operationsByTemplate = groupBy(operations, (row) => row.template_code);
    const constraintsByTemplate = groupBy(constraints, (row) => row.template_code);
    const shareGroupsByTemplate = groupBy(shareGroups, (row) => row.template_code);
    const shareGroupMembersByTemplate = groupBy(shareGroupMembers, (row) => row.template_code);
    const resourceBindingsByTemplate = groupBy(resourceBindings, (row) => row.template_code);
    const resourceRequirementsByTemplate = groupBy(resourceRequirements, (row) => row.template_code);

    const importedTemplates: ProcessTemplateWorkbookImportResult['templates'] = [];

    for (const template of templates) {
      const { templateId, action } = await resolveTemplateId(
        connection,
        template,
        mode,
        existingTemplateMap,
        teamCodeMap,
      );

      const stageRows = (stagesByTemplate.get(template.template_code) ?? []).sort(
        (a, b) => a.stage_order - b.stage_order || a.stage_code.localeCompare(b.stage_code),
      );
      const stageIdMap = new Map<string, number>();

      for (const stage of stageRows) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO process_stages (template_id, stage_code, stage_name, stage_order, start_day, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [templateId, stage.stage_code, stage.stage_name, stage.stage_order, stage.start_day, stage.description],
        );
        stageIdMap.set(stage.stage_code, result.insertId);
      }

      const operationRows = (operationsByTemplate.get(template.template_code) ?? []).sort(
        (a, b) => a.operation_order - b.operation_order || a.schedule_key.localeCompare(b.schedule_key),
      );
      const scheduleIdMap = new Map<string, number>();

      for (const operation of operationRows) {
        const stageId = stageIdMap.get(operation.stage_code);
        if (!stageId) {
          throw new ProcessTemplateWorkbookError(
            `Cannot resolve stage ${operation.stage_code} for operation ${operation.schedule_key}`,
          );
        }

        const operationId = operationCodeMap.get(operation.operation_code);
        if (!operationId) {
          throw new ProcessTemplateWorkbookError(`Unknown operation_code: ${operation.operation_code}`);
        }

        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO stage_operation_schedules (
             stage_id,
             operation_id,
             operation_day,
             recommended_time,
             recommended_day_offset,
             window_start_time,
             window_start_day_offset,
             window_end_time,
             window_end_day_offset,
             operation_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            stageId,
            operationId,
            operation.operation_day,
            operation.recommended_time,
            operation.recommended_day_offset,
            operation.window_start_time,
            operation.window_start_day_offset,
            operation.window_end_time,
            operation.window_end_day_offset,
            operation.operation_order,
          ],
        );

        scheduleIdMap.set(operation.schedule_key, result.insertId);
      }

      for (const constraint of constraintsByTemplate.get(template.template_code) ?? []) {
        const fromScheduleId = scheduleIdMap.get(constraint.from_schedule_key);
        const toScheduleId = scheduleIdMap.get(constraint.to_schedule_key);

        if (!fromScheduleId || !toScheduleId) {
          throw new ProcessTemplateWorkbookError(
            `Cannot resolve schedules for constraint ${constraint.from_schedule_key} -> ${constraint.to_schedule_key}`,
          );
        }

        await connection.execute(
          `INSERT INTO operation_constraints (
             schedule_id,
             predecessor_schedule_id,
             constraint_type,
             constraint_level,
             time_lag,
             lag_type,
             lag_min,
             lag_max,
             share_mode,
             constraint_name,
             description
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            fromScheduleId,
            toScheduleId,
            CONSTRAINT_TYPE_TO_CODE[constraint.constraint_type],
            constraint.constraint_level,
            constraint.lag_time,
            constraint.lag_type,
            constraint.lag_min,
            constraint.lag_max,
            constraint.share_mode,
            constraint.constraint_name,
            constraint.description,
          ],
        );
      }

      const shareGroupIdMap = new Map<string, number>();
      for (const shareGroup of shareGroupsByTemplate.get(template.template_code) ?? []) {
        const [result] = await connection.execute<ResultSetHeader>(
          `INSERT INTO personnel_share_groups (template_id, group_code, group_name, share_mode)
           VALUES (?, ?, ?, ?)`,
          [templateId, shareGroup.group_code, shareGroup.group_name, shareGroup.share_mode || 'SAME_TEAM'],
        );
        shareGroupIdMap.set(shareGroup.group_code, result.insertId);
      }

      for (const member of shareGroupMembersByTemplate.get(template.template_code) ?? []) {
        const groupId = shareGroupIdMap.get(member.group_code);
        const scheduleId = scheduleIdMap.get(member.schedule_key);
        if (!groupId || !scheduleId) {
          throw new ProcessTemplateWorkbookError(
            `Cannot resolve share group member ${member.group_code} -> ${member.schedule_key}`,
          );
        }

        await connection.execute(
          `INSERT INTO personnel_share_group_members (group_id, schedule_id)
           VALUES (?, ?)`,
          [groupId, scheduleId],
        );
      }

      const requirementsBySchedule = groupBy(
        resourceRequirementsByTemplate.get(template.template_code) ?? [],
        (row) => row.schedule_key,
      );
      for (const [scheduleKey, requirementRows] of requirementsBySchedule.entries()) {
        const scheduleId = scheduleIdMap.get(scheduleKey);
        if (!scheduleId) {
          throw new ProcessTemplateWorkbookError(`Cannot resolve schedule for resource requirements: ${scheduleKey}`);
        }

        const normalizedRequirements = requirementRows
          .sort((a, b) => a.requirement_order - b.requirement_order)
          .map((row) => ({
            resource_type: row.resource_type,
            required_count: row.required_count,
            is_mandatory: row.is_mandatory,
            requires_exclusive_use: row.requires_exclusive_use,
            prep_minutes: row.prep_minutes,
            changeover_minutes: row.changeover_minutes,
            cleanup_minutes: row.cleanup_minutes,
            candidate_resource_ids: row.candidate_resource_codes
              .map((code) => resourceCodeMap.get(code))
              .filter((value): value is number => Number.isInteger(value)),
          }));

        if (!normalizedRequirements.length) {
          continue;
        }

        try {
          await replaceTemplateScheduleRules(connection, scheduleId, normalizedRequirements);
        } catch (error) {
          if (isMissingTableError(error)) {
            throw new ProcessTemplateWorkbookError(
              `Workbook includes resource requirements but table ${extractMissingTableName(error) ?? 'template_operation_resource_requirements'} is missing`,
              409,
            );
          }
          throw error;
        }
      }

      for (const binding of resourceBindingsByTemplate.get(template.template_code) ?? []) {
        const scheduleId = scheduleIdMap.get(binding.schedule_key);
        const resourceNodeId = resourceNodeCodeMap.get(binding.resource_node_code);

        if (!scheduleId || !resourceNodeId) {
          throw new ProcessTemplateWorkbookError(
            `Cannot resolve resource binding ${binding.schedule_key} -> ${binding.resource_node_code}`,
          );
        }

        try {
          await upsertTemplateScheduleBinding(scheduleId, resourceNodeId, connection);
        } catch (error) {
          if (isMissingTableError(error)) {
            throw new ProcessTemplateWorkbookError(
              `Workbook includes resource bindings but table ${extractMissingTableName(error) ?? 'template_stage_operation_resource_bindings'} is missing`,
              409,
            );
          }
          throw error;
        }
      }

      await updateTemplateTotalDays(templateId, connection);

      importedTemplates.push({
        template_code: template.template_code,
        template_id: templateId,
        action,
      });
    }

    await connection.commit();

    return {
      mode,
      created_count: importedTemplates.filter((item) => item.action === 'created').length,
      replaced_count: importedTemplates.filter((item) => item.action === 'replaced').length,
      warnings,
      templates: importedTemplates,
    };
  } catch (error) {
    await connection.rollback();
    if (error instanceof ProcessTemplateWorkbookError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new ProcessTemplateWorkbookError(error.message, 400);
    }
    throw error;
  } finally {
    connection.release();
  }
};
