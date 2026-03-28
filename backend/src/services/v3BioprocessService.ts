import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../config/database';
import {
  getFallbackV3TemplateDetail,
  getFallbackV3TemplateSummaries,
} from './v3BioprocessFallbackData';
import type {
  V3AnchorMode,
  V3DraftMainOperationOverride,
  V3DraftNodeBindingOverride,
  V3DraftStateSegment,
  V3EquipmentMode,
  V3EquipmentStateSegment,
  V3EquipmentStateValue,
  V3EquipmentTimelineRow,
  V3MainFlowEdge,
  V3MainFlowNode,
  V3MasterSyncResponse,
  V3MasterSyncStatus,
  V3MaterialStateSegment,
  V3MaterialStateValue,
  V3OperationPackage,
  V3OperationPackageMember,
  V3ProjectionOperation,
  V3ProjectionPreviewRequest,
  V3ProjectionPreviewResponse,
  V3ProjectionRisk,
  V3RiskSeverity,
  V3StorageMode,
  V3TemplateDetail,
  V3TemplateSummary,
  V3TimelineContextWindow,
  V3TriggerRule,
} from './v3BioprocessTypes';
import { V3_ZOOM_LEVELS } from './v3BioprocessTypes';

type TemplateSummaryRow = RowDataPacket & {
  id: number;
  template_code: string;
  template_name: string;
  domain_code: 'USP' | 'DSP' | 'SPI';
  equipment_mode_scope: 'MIXED' | 'SS' | 'SUS';
  description: string | null;
  node_count: number;
  trigger_rule_count: number;
  package_count: number;
  main_equipment_codes: string | null;
};

type MainNodeRow = RowDataPacket & {
  id: number;
  template_id: number;
  node_key: string;
  semantic_key: string;
  display_name: string;
  phase_code: 'USP' | 'DSP' | 'SPI';
  equipment_mode: V3EquipmentMode;
  default_duration_minutes: number;
  sequence_order: number;
  default_equipment_code: string | null;
  default_material_code: string | null;
  metadata: unknown;
};

type MainEdgeRow = RowDataPacket & {
  predecessor_node_id: number;
  successor_node_id: number;
  relationship_type: 'FINISH_START' | 'START_START' | 'STATE_GATE';
  min_offset_minutes: number;
};

type TriggerRuleRow = RowDataPacket & {
  id: number;
  template_id: number;
  rule_code: string;
  target_node_id: number | null;
  anchor_mode: V3AnchorMode;
  anchor_ref_code: string | null;
  trigger_mode: V3TriggerRule['trigger_mode'];
  operation_code: string | null;
  operation_name: string | null;
  operation_role: 'AUXILIARY';
  default_duration_minutes: number;
  earliest_offset_minutes: number | null;
  recommended_offset_minutes: number | null;
  latest_offset_minutes: number | null;
  repeat_every_minutes: number | null;
  repeat_until_node_id: number | null;
  dependency_rule_code: string | null;
  generator_package_id: number | null;
  target_equipment_state: V3EquipmentStateValue | null;
  target_material_state: V3MaterialStateValue | null;
  is_blocking: number;
  sort_order: number;
  metadata: unknown;
};

type OperationPackageRow = RowDataPacket & {
  id: number;
  template_id: number | null;
  package_code: string;
  package_name: string;
  package_type: V3OperationPackage['package_type'];
  target_entity_type: 'EQUIPMENT' | 'MATERIAL';
  equipment_mode: V3EquipmentMode;
  description: string | null;
  is_reusable: number;
  metadata: unknown;
};

type OperationPackageMemberRow = RowDataPacket & {
  id: number;
  package_id: number;
  member_code: string;
  operation_code: string;
  operation_name: string;
  member_order: number;
  relative_day_offset: number;
  relative_minute_offset: number;
  duration_minutes: number;
  predecessor_member_id: number | null;
  target_equipment_state: V3EquipmentStateValue | null;
  target_material_state: V3MaterialStateValue | null;
  metadata: unknown;
};

type SyncRunRow = RowDataPacket & {
  id: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  started_at: Date | string | null;
  finished_at: Date | string | null;
  summary: unknown;
  error_message: string | null;
};

type MirroredResourceRow = RowDataPacket & {
  resource_code: string;
  resource_name: string;
  department_code: 'USP' | 'DSP' | 'SPI' | 'MAINT' | null;
  metadata: unknown;
};

type MaintenanceWindowRow = RowDataPacket & {
  resource_code: string;
  window_type: string;
  start_datetime: Date | string;
  end_datetime: Date | string;
};

type AssignmentWindowRow = RowDataPacket & {
  resource_code: string;
  batch_operation_plan_id: number | null;
  standalone_task_id: number | null;
  start_datetime: Date | string;
  end_datetime: Date | string;
  assignment_status: string;
  notes: string | null;
};

type SyncCounts = Record<string, number>;

type ProjectionRowAccumulator = {
  equipment_code: string;
  equipment_name: string;
  equipment_mode: V3EquipmentMode;
  domain_code: 'USP' | 'DSP' | 'SPI' | 'CROSS';
  main_operations: V3ProjectionOperation[];
  aux_operations: V3ProjectionOperation[];
  state_segments: V3EquipmentStateSegment[];
  risk_markers: V3ProjectionRisk[];
  context_windows: V3TimelineContextWindow[];
};

type ProjectionAccumulator = {
  mainOperations: V3ProjectionOperation[];
  auxOperations: V3ProjectionOperation[];
  equipmentStateSegments: V3EquipmentStateSegment[];
  materialStateSegments: V3MaterialStateSegment[];
  risks: V3ProjectionRisk[];
  operationsByNodeId: Map<number, V3ProjectionOperation>;
  generatedByRuleCode: Map<string, V3ProjectionOperation[]>;
  packageTerminalByRuleCode: Map<string, V3ProjectionOperation | null>;
};

type ProjectionContext = {
  template: V3TemplateSummary;
  nodes: V3MainFlowNode[];
  edges: V3MainFlowEdge[];
  rules: V3TriggerRule[];
  packages: V3OperationPackage[];
  storage_mode: V3StorageMode;
};

type ResourceContext = {
  resources: Map<string, MirroredResourceRow>;
  maintenance: MaintenanceWindowRow[];
  assignments: AssignmentWindowRow[];
  storage_mode: V3StorageMode;
};

const DEFAULT_V3_DB_NAME = 'aps_system_v3';
const DEFAULT_LEGACY_DB_NAME = process.env.DB_NAME || 'aps_system';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_]+$/;
const FIVE_MINUTES = 5;

class V3SchemaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V3SchemaUnavailableError';
  }
}

function normalizeDbIdentifier(identifier: string) {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }

  return `\`${identifier}\``;
}

function v3Table(tableName: string) {
  return `${normalizeDbIdentifier(process.env.V3_DB_NAME || DEFAULT_V3_DB_NAME)}.\`${tableName}\``;
}

function legacyTable(tableName: string) {
  return `${normalizeDbIdentifier(DEFAULT_LEGACY_DB_NAME)}.\`${tableName}\``;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function parseGroupConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDateTime(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }

  return parsed;
}

function addMinutes(value: Date, minutes: number) {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function diffMinutes(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / (60 * 1000));
}

function formatDateTime(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const date = typeof value === 'string' ? parseDateTime(value) : value;
  const pad = (segment: number) => String(segment).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function overlaps(
  leftStart: Date,
  leftEnd: Date,
  rightStart: Date,
  rightEnd: Date,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function clampToHorizon(start: Date, end: Date, horizonEnd: Date) {
  if (start >= horizonEnd) {
    return null;
  }

  return {
    start,
    end: end > horizonEnd ? horizonEnd : end,
  };
}

function riskSeverity(blocking: boolean): V3RiskSeverity {
  return blocking ? 'BLOCKING' : 'WARNING';
}

function riskCode(parts: Array<string | number | null | undefined>) {
  return parts.filter(Boolean).join('__');
}

function normalizeEquipmentCode(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildNodeBindingOverrideMap(overrides: V3DraftNodeBindingOverride[] | undefined) {
  return new Map(
    (overrides ?? [])
      .filter((override) => typeof override.node_key === 'string' && override.node_key.trim())
      .map((override) => [override.node_key, override]),
  );
}

function buildMainOperationOverrideMap(overrides: V3DraftMainOperationOverride[] | undefined) {
  return new Map(
    (overrides ?? [])
      .filter((override) => typeof override.node_key === 'string' && override.node_key.trim())
      .map((override) => [override.node_key, override]),
  );
}

function requireV3Availability(error: unknown): never {
  const mysqlError = error as { code?: string; message?: string; sqlMessage?: string } | undefined;

  if (mysqlError?.code === 'ER_NO_SUCH_TABLE' || mysqlError?.code === 'ER_BAD_DB_ERROR') {
    throw new V3SchemaUnavailableError(
      `V3 schema is unavailable. Run database/migrations/20260327_create_v3_bioprocess_schema.sql against ${process.env.V3_DB_NAME || DEFAULT_V3_DB_NAME} first.`,
    );
  }

  throw error;
}

function mapTemplateSummary(row: TemplateSummaryRow): V3TemplateSummary {
  return {
    id: Number(row.id),
    template_code: row.template_code,
    template_name: row.template_name,
    domain_code: row.domain_code,
    equipment_mode_scope: row.equipment_mode_scope,
    description: row.description,
    node_count: Number(row.node_count ?? 0),
    trigger_rule_count: Number(row.trigger_rule_count ?? 0),
    package_count: Number(row.package_count ?? 0),
    main_equipment_codes: parseGroupConcat(row.main_equipment_codes),
  };
}

async function loadTemplateSummaries() {
  try {
    const [rows] = await pool.execute<TemplateSummaryRow[]>(
      `SELECT
          t.id,
          t.template_code,
          t.template_name,
          t.domain_code,
          t.equipment_mode_scope,
          t.description,
          COUNT(DISTINCT n.id) AS node_count,
          COUNT(DISTINCT r.id) AS trigger_rule_count,
          COUNT(DISTINCT p.id) AS package_count,
          GROUP_CONCAT(DISTINCT n.default_equipment_code ORDER BY n.sequence_order SEPARATOR ',') AS main_equipment_codes
       FROM ${v3Table('v3_templates')} t
       LEFT JOIN ${v3Table('v3_main_flow_nodes')} n ON n.template_id = t.id
       LEFT JOIN ${v3Table('v3_trigger_rules')} r ON r.template_id = t.id
       LEFT JOIN ${v3Table('v3_operation_packages')} p
         ON p.template_id = t.id OR p.template_id IS NULL
       WHERE t.is_active = 1
       GROUP BY t.id
       ORDER BY t.domain_code, t.template_name`,
    );

    return rows.map((row) => mapTemplateSummary(row));
  } catch (error) {
    const mysqlError = error as { code?: string } | undefined;
    if (mysqlError?.code === 'ER_NO_SUCH_TABLE' || mysqlError?.code === 'ER_BAD_DB_ERROR') {
      return getFallbackV3TemplateSummaries();
    }
    throw error;
  }
}

export async function listV3Templates() {
  return loadTemplateSummaries();
}

export async function getV3TemplateDetail(templateId: number): Promise<V3TemplateDetail | null> {
  return loadProjectionContext(templateId);
}

async function loadLatestSyncStatus(): Promise<V3MasterSyncStatus> {
  try {
    const [rows] = await pool.execute<SyncRunRow[]>(
      `SELECT id, status, started_at, finished_at, summary, error_message
       FROM ${v3Table('v3_master_sync_runs')}
       ORDER BY id DESC
       LIMIT 1`,
    );

    const row = rows[0];

    if (!row) {
      return {
        last_sync_id: null,
        storage_mode: 'schema',
        status: null,
        started_at: null,
        finished_at: null,
        summary: null,
        error_message: null,
      };
    }

    return {
      last_sync_id: Number(row.id),
      storage_mode: 'schema',
      status: row.status,
      started_at: formatDateTime(row.started_at),
      finished_at: formatDateTime(row.finished_at),
      summary: parseJsonObject(row.summary),
      error_message: row.error_message,
    };
  } catch (error) {
    const mysqlError = error as { code?: string } | undefined;
    if (mysqlError?.code === 'ER_NO_SUCH_TABLE' || mysqlError?.code === 'ER_BAD_DB_ERROR') {
      return {
        last_sync_id: null,
        storage_mode: 'fallback',
        status: null,
        started_at: null,
        finished_at: null,
        summary: null,
        error_message: null,
      };
    }
    throw error;
  }
}

export async function getV3MasterSyncStatus() {
  return loadLatestSyncStatus();
}

function extractAffectedRows(result: unknown) {
  return Number((result as ResultSetHeader | undefined)?.affectedRows ?? 0);
}

export async function syncLegacyMasterDataToV3(): Promise<V3MasterSyncResponse> {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [runHeader] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_sync_runs')} (
         status,
         source_db_name,
         target_db_name
       ) VALUES ('RUNNING', ?, ?)`,
      [DEFAULT_LEGACY_DB_NAME, process.env.V3_DB_NAME || DEFAULT_V3_DB_NAME],
    );

    const syncRunId = Number(runHeader.insertId);
    const tablesToClear = [
      'v3_master_resource_rule_summaries',
      'v3_master_template_binding_summaries',
      'v3_master_resource_assignments',
      'v3_master_maintenance_windows',
      'v3_master_resource_nodes',
      'v3_master_resources',
      'v3_master_organization_units',
    ];

    for (const tableName of tablesToClear) {
      await connection.execute(`DELETE FROM ${v3Table(tableName)}`);
    }

    const counts: SyncCounts = {};

    let [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_organization_units')} (
         source_unit_id,
         source_db_name,
         source_table,
         sync_run_id,
         parent_source_unit_id,
         unit_type,
         unit_code,
         unit_name,
         default_shift_code,
         sort_order,
         is_active,
         metadata,
         synced_at,
         is_stale
       )
       SELECT
         id,
         ?,
         'organization_units',
         ?,
         parent_id,
         unit_type,
         unit_code,
         unit_name,
         default_shift_code,
         sort_order,
         is_active,
         metadata,
         NOW(),
         0
       FROM ${legacyTable('organization_units')}`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.organization_units = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_resources')} (
         source_resource_id,
         source_db_name,
         source_table,
         sync_run_id,
         resource_code,
         resource_name,
         resource_type,
         department_code,
         owner_org_unit_id,
         status,
         capacity,
         location,
         clean_level,
         is_shared,
         is_schedulable,
         metadata,
         synced_at,
         is_active,
         is_stale
       )
       SELECT
         id,
         ?,
         'resources',
         ?,
         resource_code,
         resource_name,
         resource_type,
         department_code,
         owner_org_unit_id,
         status,
         capacity,
         location,
         clean_level,
         is_shared,
         is_schedulable,
         metadata,
         NOW(),
         CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END,
         0
       FROM ${legacyTable('resources')}`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.resources = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_resource_nodes')} (
         source_node_id,
         source_db_name,
         source_table,
         sync_run_id,
         node_code,
         node_name,
         node_class,
         parent_source_node_id,
         department_code,
         owner_org_unit_id,
         bound_resource_id,
         bound_resource_code,
         sort_order,
         is_active,
         metadata,
         synced_at,
         is_stale
       )
       SELECT
         rn.id,
         ?,
         'resource_nodes',
         ?,
         rn.node_code,
         rn.node_name,
         rn.node_class,
         rn.parent_id,
         rn.department_code,
         rn.owner_org_unit_id,
         rn.bound_resource_id,
         r.resource_code,
         rn.sort_order,
         rn.is_active,
         rn.metadata,
         NOW(),
         0
       FROM ${legacyTable('resource_nodes')} rn
       LEFT JOIN ${legacyTable('resources')} r ON r.id = rn.bound_resource_id`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.resource_nodes = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_maintenance_windows')} (
         source_window_id,
         source_db_name,
         source_table,
         sync_run_id,
         resource_id,
         resource_code,
         window_type,
         start_datetime,
         end_datetime,
         is_hard_block,
         owner_dept_code,
         notes,
         synced_at,
         is_active,
         is_stale
       )
       SELECT
         mw.id,
         ?,
         'maintenance_windows',
         ?,
         mw.resource_id,
         r.resource_code,
         mw.window_type,
         mw.start_datetime,
         mw.end_datetime,
         mw.is_hard_block,
         mw.owner_dept_code,
         mw.notes,
         NOW(),
         1,
         0
       FROM ${legacyTable('maintenance_windows')} mw
       JOIN ${legacyTable('resources')} r ON r.id = mw.resource_id`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.maintenance_windows = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_resource_assignments')} (
         source_assignment_id,
         source_db_name,
         source_table,
         sync_run_id,
         resource_id,
         resource_code,
         batch_operation_plan_id,
         standalone_task_id,
         start_datetime,
         end_datetime,
         assignment_status,
         notes,
         synced_at,
         is_active,
         is_stale
       )
       SELECT
         ra.id,
         ?,
         'resource_assignments',
         ?,
         ra.resource_id,
         r.resource_code,
         ra.batch_operation_plan_id,
         ra.standalone_task_id,
         ra.start_datetime,
         ra.end_datetime,
         ra.assignment_status,
         ra.notes,
         NOW(),
         CASE WHEN ra.assignment_status = 'CANCELLED' THEN 0 ELSE 1 END,
         0
       FROM ${legacyTable('resource_assignments')} ra
       JOIN ${legacyTable('resources')} r ON r.id = ra.resource_id`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.resource_assignments = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_template_binding_summaries')} (
         source_binding_id,
         source_db_name,
         source_table,
         sync_run_id,
         template_id,
         template_code,
         template_name,
         stage_id,
         stage_code,
         stage_name,
         schedule_id,
         operation_id,
         operation_code,
         operation_name,
         resource_node_id,
         resource_node_code,
         resource_code,
         binding_mode,
         synced_at,
         is_active,
         is_stale
       )
       SELECT
         b.id,
         ?,
         'template_stage_operation_resource_bindings',
         ?,
         pt.id,
         pt.template_code,
         pt.template_name,
         ps.id,
         ps.stage_code,
         ps.stage_name,
         sos.id,
         o.id,
         o.operation_code,
         o.operation_name,
         rn.id,
         rn.node_code,
         r.resource_code,
         b.binding_mode,
         NOW(),
         1,
         0
       FROM ${legacyTable('template_stage_operation_resource_bindings')} b
       JOIN ${legacyTable('stage_operation_schedules')} sos ON sos.id = b.template_schedule_id
       JOIN ${legacyTable('process_stages')} ps ON ps.id = sos.stage_id
       JOIN ${legacyTable('process_templates')} pt ON pt.id = ps.template_id
       JOIN ${legacyTable('operations')} o ON o.id = sos.operation_id
       JOIN ${legacyTable('resource_nodes')} rn ON rn.id = b.resource_node_id
       LEFT JOIN ${legacyTable('resources')} r ON r.id = rn.bound_resource_id`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.template_bindings = extractAffectedRows(result);

    [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_master_resource_rule_summaries')} (
         source_requirement_id,
         source_db_name,
         source_table,
         sync_run_id,
         operation_id,
         operation_code,
         operation_name,
         resource_type,
         required_count,
         is_mandatory,
         requires_exclusive_use,
         prep_minutes,
         changeover_minutes,
         cleanup_minutes,
         candidate_resource_codes,
         synced_at,
         is_active,
         is_stale
       )
       SELECT
         req.id,
         ?,
         'operation_resource_requirements',
         ?,
         req.operation_id,
         op.operation_code,
         op.operation_name,
         req.resource_type,
         req.required_count,
         req.is_mandatory,
         req.requires_exclusive_use,
         req.prep_minutes,
         req.changeover_minutes,
         req.cleanup_minutes,
         JSON_ARRAYAGG(DISTINCT r.resource_code),
         NOW(),
         1,
         0
       FROM ${legacyTable('operation_resource_requirements')} req
       JOIN ${legacyTable('operations')} op ON op.id = req.operation_id
       LEFT JOIN ${legacyTable('operation_resource_candidates')} cand ON cand.requirement_id = req.id
       LEFT JOIN ${legacyTable('resources')} r ON r.id = cand.resource_id
       GROUP BY
         req.id,
         req.operation_id,
         op.operation_code,
         op.operation_name,
         req.resource_type,
         req.required_count,
         req.is_mandatory,
         req.requires_exclusive_use,
         req.prep_minutes,
         req.changeover_minutes,
         req.cleanup_minutes`,
      [DEFAULT_LEGACY_DB_NAME, syncRunId],
    );
    counts.resource_rules = extractAffectedRows(result);

    const summary = JSON.stringify(counts);

    await connection.execute(
      `UPDATE ${v3Table('v3_master_sync_runs')}
       SET status = 'SUCCESS',
           summary = ?,
           finished_at = NOW()
       WHERE id = ?`,
      [summary, syncRunId],
    );

    await connection.commit();

    const latest = await loadLatestSyncStatus();

    return {
      ...latest,
      synced_counts: counts,
    };
  } catch (error) {
    await connection.rollback();

    if (error instanceof V3SchemaUnavailableError) {
      throw error;
    }

    const mysqlError = error as { message?: string; code?: string; sqlMessage?: string } | undefined;
    const message = mysqlError?.sqlMessage ?? mysqlError?.message ?? 'Unknown V3 sync error';

    try {
      await connection.execute(
        `UPDATE ${v3Table('v3_master_sync_runs')}
         SET status = 'FAILED',
             error_message = ?,
             finished_at = NOW()
         WHERE id = (
           SELECT id FROM (
             SELECT id
             FROM ${v3Table('v3_master_sync_runs')}
             ORDER BY id DESC
             LIMIT 1
           ) failed_sync
         )`,
        [message],
      );
    } catch (innerError) {
      requireV3Availability(innerError);
    }

    requireV3Availability(error);
  } finally {
    connection.release();
  }
}

async function loadProjectionContext(templateId: number): Promise<ProjectionContext | null> {
  try {
    const [templateRows] = await pool.execute<TemplateSummaryRow[]>(
      `SELECT
          t.id,
          t.template_code,
          t.template_name,
          t.domain_code,
          t.equipment_mode_scope,
          t.description,
          COUNT(DISTINCT n.id) AS node_count,
          COUNT(DISTINCT r.id) AS trigger_rule_count,
          COUNT(DISTINCT p.id) AS package_count,
          GROUP_CONCAT(DISTINCT n.default_equipment_code ORDER BY n.sequence_order SEPARATOR ',') AS main_equipment_codes
       FROM ${v3Table('v3_templates')} t
       LEFT JOIN ${v3Table('v3_main_flow_nodes')} n ON n.template_id = t.id
       LEFT JOIN ${v3Table('v3_trigger_rules')} r ON r.template_id = t.id
       LEFT JOIN ${v3Table('v3_operation_packages')} p
         ON p.template_id = t.id OR p.template_id IS NULL
       WHERE t.id = ?
       GROUP BY t.id`,
      [templateId],
    );

    const template = templateRows[0] ? mapTemplateSummary(templateRows[0]) : null;

    if (!template) {
      return null;
    }

    const [nodeRows] = await pool.execute<MainNodeRow[]>(
      `SELECT *
       FROM ${v3Table('v3_main_flow_nodes')}
       WHERE template_id = ?
       ORDER BY sequence_order`,
      [templateId],
    );

    const [edgeRows] = await pool.execute<MainEdgeRow[]>(
      `SELECT predecessor_node_id, successor_node_id, relationship_type, min_offset_minutes
       FROM ${v3Table('v3_main_flow_edges')}
       WHERE template_id = ?`,
      [templateId],
    );

    const [ruleRows] = await pool.execute<TriggerRuleRow[]>(
      `SELECT *
       FROM ${v3Table('v3_trigger_rules')}
       WHERE template_id = ?
       ORDER BY sort_order, id`,
      [templateId],
    );

    const packageIds = [...new Set(ruleRows.map((row) => Number(row.generator_package_id)).filter(Boolean))];

    let packageRows: OperationPackageRow[] = [];
    let packageMemberRows: OperationPackageMemberRow[] = [];

    if (packageIds.length) {
      const placeholders = packageIds.map(() => '?').join(', ');
      const [fetchedPackages] = await pool.execute<OperationPackageRow[]>(
        `SELECT *
         FROM ${v3Table('v3_operation_packages')}
         WHERE id IN (${placeholders})`,
        packageIds,
      );
      packageRows = fetchedPackages;

      const [fetchedMembers] = await pool.execute<OperationPackageMemberRow[]>(
        `SELECT *
         FROM ${v3Table('v3_operation_package_members')}
         WHERE package_id IN (${placeholders})
         ORDER BY package_id, member_order, id`,
        packageIds,
      );
      packageMemberRows = fetchedMembers;
    }

    return {
      template,
      nodes: nodeRows.map((row) => ({
        ...row,
        default_duration_minutes: Number(row.default_duration_minutes),
        sequence_order: Number(row.sequence_order),
        metadata: parseJsonObject(row.metadata),
      })) as V3MainFlowNode[],
      edges: edgeRows.map((row) => ({
        predecessor_node_id: Number(row.predecessor_node_id),
        successor_node_id: Number(row.successor_node_id),
        relationship_type: row.relationship_type,
        min_offset_minutes: Number(row.min_offset_minutes ?? 0),
      })) as V3MainFlowEdge[],
      rules: ruleRows.map((row) => ({
        ...row,
        default_duration_minutes: Number(row.default_duration_minutes),
        earliest_offset_minutes: row.earliest_offset_minutes === null ? null : Number(row.earliest_offset_minutes),
        recommended_offset_minutes:
          row.recommended_offset_minutes === null ? null : Number(row.recommended_offset_minutes),
        latest_offset_minutes: row.latest_offset_minutes === null ? null : Number(row.latest_offset_minutes),
        repeat_every_minutes: row.repeat_every_minutes === null ? null : Number(row.repeat_every_minutes),
        repeat_until_node_id: row.repeat_until_node_id === null ? null : Number(row.repeat_until_node_id),
        generator_package_id: row.generator_package_id === null ? null : Number(row.generator_package_id),
        is_blocking: row.is_blocking === 1,
        metadata: parseJsonObject(row.metadata),
      })) as V3TriggerRule[],
      packages: packageRows.map((row) => ({
        ...row,
        template_id: row.template_id === null ? null : Number(row.template_id),
        is_reusable: row.is_reusable === 1,
        metadata: parseJsonObject(row.metadata),
        members: packageMemberRows
          .filter((member) => Number(member.package_id) === Number(row.id))
          .map((member) => ({
            ...member,
            package_id: Number(member.package_id),
            member_order: Number(member.member_order),
            relative_day_offset: Number(member.relative_day_offset),
            relative_minute_offset: Number(member.relative_minute_offset),
            duration_minutes: Number(member.duration_minutes),
            predecessor_member_id:
              member.predecessor_member_id === null ? null : Number(member.predecessor_member_id),
            metadata: parseJsonObject(member.metadata),
          })) as V3OperationPackageMember[],
      })) as V3OperationPackage[],
      storage_mode: 'schema',
    };
  } catch (error) {
    const mysqlError = error as { code?: string } | undefined;
    if (mysqlError?.code === 'ER_NO_SUCH_TABLE' || mysqlError?.code === 'ER_BAD_DB_ERROR') {
      return getFallbackV3TemplateDetail(templateId);
    }
    throw error;
  }
}

async function loadMirroredResourcesFromSchema(
  equipmentCodes: string[],
  start: string,
  end: string,
): Promise<ResourceContext> {
  if (!equipmentCodes.length) {
    return {
      resources: new Map<string, MirroredResourceRow>(),
      maintenance: [] as MaintenanceWindowRow[],
      assignments: [] as AssignmentWindowRow[],
      storage_mode: 'schema',
    };
  }

  const placeholders = equipmentCodes.map(() => '?').join(', ');

  try {
    const [resourceRows] = await pool.execute<MirroredResourceRow[]>(
      `SELECT resource_code, resource_name, department_code, metadata
       FROM ${v3Table('v3_master_resources')}
       WHERE resource_code IN (${placeholders})
         AND is_stale = 0`,
      equipmentCodes,
    );

    const [maintenanceRows] = await pool.execute<MaintenanceWindowRow[]>(
      `SELECT resource_code, window_type, start_datetime, end_datetime
       FROM ${v3Table('v3_master_maintenance_windows')}
       WHERE resource_code IN (${placeholders})
         AND is_stale = 0
         AND start_datetime < ?
         AND end_datetime > ?`,
      [...equipmentCodes, end, start],
    );

    const [assignmentRows] = await pool.execute<AssignmentWindowRow[]>(
      `SELECT resource_code, batch_operation_plan_id, standalone_task_id, start_datetime, end_datetime, assignment_status, notes
       FROM ${v3Table('v3_master_resource_assignments')}
       WHERE resource_code IN (${placeholders})
         AND is_stale = 0
         AND assignment_status <> 'CANCELLED'
         AND start_datetime < ?
         AND end_datetime > ?`,
      [...equipmentCodes, end, start],
    );

    return {
      resources: new Map(resourceRows.map((row) => [row.resource_code, row])),
      maintenance: maintenanceRows,
      assignments: assignmentRows,
      storage_mode: 'schema',
    };
  } catch (error) {
    requireV3Availability(error);
  }
}

async function loadLegacyResources(
  equipmentCodes: string[],
  start: string,
  end: string,
): Promise<ResourceContext> {
  if (!equipmentCodes.length) {
    return {
      resources: new Map<string, MirroredResourceRow>(),
      maintenance: [] as MaintenanceWindowRow[],
      assignments: [] as AssignmentWindowRow[],
      storage_mode: 'fallback',
    };
  }

  const placeholders = equipmentCodes.map(() => '?').join(', ');
  const [resourceRows] = await pool.execute<MirroredResourceRow[]>(
    `SELECT resource_code, resource_name, department_code, metadata
     FROM ${legacyTable('resources')}
     WHERE resource_code IN (${placeholders})`,
    equipmentCodes,
  );

  const [maintenanceRows] = await pool.execute<MaintenanceWindowRow[]>(
    `SELECT r.resource_code, mw.window_type, mw.start_datetime, mw.end_datetime
     FROM ${legacyTable('maintenance_windows')} mw
     JOIN ${legacyTable('resources')} r ON r.id = mw.resource_id
     WHERE r.resource_code IN (${placeholders})
       AND mw.start_datetime < ?
       AND mw.end_datetime > ?`,
    [...equipmentCodes, end, start],
  );

  const [assignmentRows] = await pool.execute<AssignmentWindowRow[]>(
    `SELECT
       r.resource_code,
       ra.batch_operation_plan_id,
       ra.standalone_task_id,
       ra.start_datetime,
       ra.end_datetime,
       ra.assignment_status,
       ra.notes
     FROM ${legacyTable('resource_assignments')} ra
     JOIN ${legacyTable('resources')} r ON r.id = ra.resource_id
     WHERE r.resource_code IN (${placeholders})
       AND ra.assignment_status <> 'CANCELLED'
       AND ra.start_datetime < ?
       AND ra.end_datetime > ?`,
    [...equipmentCodes, end, start],
  );

  return {
    resources: new Map(resourceRows.map((row) => [row.resource_code, row])),
    maintenance: maintenanceRows,
    assignments: assignmentRows,
    storage_mode: 'fallback',
  };
}

async function loadMirroredResources(
  equipmentCodes: string[],
  start: string,
  end: string,
): Promise<ResourceContext> {
  try {
    return await loadMirroredResourcesFromSchema(equipmentCodes, start, end);
  } catch (error) {
    if (isV3SchemaUnavailableError(error)) {
      return loadLegacyResources(equipmentCodes, start, end);
    }
    throw error;
  }
}

function resolveAnchorDateTime(
  anchorMode: V3AnchorMode,
  nodeOperation: V3ProjectionOperation | undefined,
  dependencyOperation: V3ProjectionOperation | undefined,
  useWindowEnd = false,
) {
  if (anchorMode === 'RULE_END' || anchorMode === 'PACKAGE_END') {
    return dependencyOperation ? parseDateTime(dependencyOperation.end_datetime) : null;
  }

  if (!nodeOperation) {
    return null;
  }

  if (anchorMode === 'NODE_END') {
    return parseDateTime(nodeOperation.end_datetime);
  }

  if (useWindowEnd && nodeOperation.window_end_datetime) {
    return parseDateTime(nodeOperation.window_end_datetime);
  }

  return parseDateTime(nodeOperation.start_datetime);
}

function applyNodeBindingOverrides(
  nodes: V3MainFlowNode[],
  overrides: V3DraftNodeBindingOverride[] | undefined,
) {
  const overrideByNodeKey = buildNodeBindingOverrideMap(overrides);

  return nodes.map((node) => {
    const override = overrideByNodeKey.get(node.node_key);
    if (!override) {
      return node;
    }

    return {
      ...node,
      default_equipment_code: normalizeEquipmentCode(override.equipment_code),
      equipment_mode: override.equipment_mode ?? node.equipment_mode,
      metadata: {
        ...node.metadata,
        draft_binding_override: true,
      },
    };
  });
}

function buildMainOperations(
  nodes: V3MainFlowNode[],
  edges: Array<{
    predecessor_node_id: number;
    successor_node_id: number;
    relationship_type: 'FINISH_START' | 'START_START' | 'STATE_GATE';
    min_offset_minutes: number;
  }>,
  plannedStart: Date,
  draftOverrides?: V3DraftMainOperationOverride[],
): ProjectionAccumulator {
  const incomingEdgeByNodeId = new Map<number, {
    predecessor_node_id: number;
    successor_node_id: number;
    relationship_type: 'FINISH_START' | 'START_START' | 'STATE_GATE';
    min_offset_minutes: number;
  }>();

  edges.forEach((edge) => {
    incomingEdgeByNodeId.set(Number(edge.successor_node_id), edge);
  });

  const accumulator: ProjectionAccumulator = {
    mainOperations: [],
    auxOperations: [],
    equipmentStateSegments: [],
    materialStateSegments: [],
    risks: [],
    operationsByNodeId: new Map(),
    generatedByRuleCode: new Map(),
    packageTerminalByRuleCode: new Map(),
  };
  const overrideByNodeKey = buildMainOperationOverrideMap(draftOverrides);

  for (const node of nodes) {
    const incomingEdge = incomingEdgeByNodeId.get(node.id);
    let earliestStartDate = accumulator.mainOperations.length
      ? parseDateTime(accumulator.mainOperations[accumulator.mainOperations.length - 1].end_datetime)
      : plannedStart;

    if (incomingEdge) {
      const predecessor = accumulator.operationsByNodeId.get(Number(incomingEdge.predecessor_node_id));
      if (predecessor) {
        if (incomingEdge.relationship_type === 'START_START') {
          earliestStartDate = addMinutes(parseDateTime(predecessor.start_datetime), incomingEdge.min_offset_minutes);
        } else {
          earliestStartDate = addMinutes(parseDateTime(predecessor.end_datetime), incomingEdge.min_offset_minutes);
        }
      }
    }

    const draftOverride = overrideByNodeKey.get(node.node_key);
    const startDate = draftOverride
      ? parseDateTime(draftOverride.start_datetime)
      : earliestStartDate;
    const endDate = addMinutes(startDate, node.default_duration_minutes);
    const metadata = {
      node_id: node.id,
      node_key: node.node_key,
      semantic_key: node.semantic_key,
      sequence_order: node.sequence_order,
      phase_code: node.phase_code,
      ...node.metadata,
    };

    const operation: V3ProjectionOperation = {
      operation_key: `MAIN__${node.node_key}`,
      operation_code: node.semantic_key,
      operation_name: node.display_name,
      role: 'MAIN',
      source: 'TEMPLATE_PROJECTION',
      equipment_code: node.default_equipment_code,
      equipment_name: node.default_equipment_code,
      equipment_mode: node.equipment_mode === 'ANY' ? 'UNKNOWN' : node.equipment_mode,
      material_state_ref: node.default_material_code,
      start_datetime: formatDateTime(startDate)!,
      end_datetime: formatDateTime(endDate)!,
      window_start_datetime: null,
      window_end_datetime: null,
      generator_rule_id: null,
      generator_rule_code: null,
      generator_package_id: null,
      generator_package_code: null,
      is_user_adjusted: Boolean(draftOverride),
      metadata,
    };

    if (draftOverride && incomingEdge && startDate < earliestStartDate) {
      accumulator.risks.push({
        risk_code: riskCode(['WINDOW_VIOLATION', node.node_key, 'predecessor']),
        risk_type: 'WINDOW_VIOLATION',
        severity: 'BLOCKING',
        equipment_code: node.default_equipment_code,
        material_code: node.default_material_code,
        operation_key: operation.operation_key,
        trigger_ref_code: node.node_key,
        window_start_datetime: formatDateTime(startDate),
        window_end_datetime: formatDateTime(earliestStartDate),
        message: `${node.display_name} was manually placed before its predecessor offset window.`,
        is_blocking: true,
        metadata: {
          required_start_datetime: formatDateTime(earliestStartDate),
          overridden_start_datetime: formatDateTime(startDate),
          predecessor_node_id: incomingEdge.predecessor_node_id,
        },
      });
    }

    accumulator.mainOperations.push(operation);
    accumulator.operationsByNodeId.set(node.id, operation);

    const equipmentCode = node.default_equipment_code;
    if (!equipmentCode) {
      accumulator.risks.push({
        risk_code: riskCode(['UNBOUND_RESOURCE', node.node_key]),
        risk_type: 'UNBOUND_RESOURCE',
        severity: 'BLOCKING',
        equipment_code: null,
        material_code: node.default_material_code,
        operation_key: operation.operation_key,
        trigger_ref_code: node.node_key,
        window_start_datetime: operation.start_datetime,
        window_end_datetime: operation.end_datetime,
        message: `${node.display_name} lacks a default equipment binding in V3.`,
        is_blocking: true,
        metadata: { node_key: node.node_key },
      });
    } else {
      accumulator.equipmentStateSegments.push({
        segment_key: `MAIN_STATE__${node.node_key}`,
        equipment_code: equipmentCode,
        equipment_name: equipmentCode,
        equipment_mode: operation.equipment_mode,
        state_code: 'processing',
        source_mode: 'PLANNED',
        start_datetime: operation.start_datetime,
        end_datetime: operation.end_datetime,
        metadata: { origin: 'main_operation', node_key: node.node_key },
      });
    }

    if (node.default_material_code && node.metadata.target_material_state === 'prepared') {
      accumulator.materialStateSegments.push({
        segment_key: `MAIN_MATERIAL__${node.node_key}`,
        material_code: node.default_material_code,
        material_name: node.default_material_code,
        state_code: 'prepared',
        source_mode: 'PLANNED',
        start_datetime: operation.end_datetime,
        end_datetime: operation.end_datetime,
        metadata: { origin: 'main_operation', node_key: node.node_key },
      });
    }
  }

  return accumulator;
}

function addEquipmentStateSegment(
  segments: V3EquipmentStateSegment[],
  segment: V3EquipmentStateSegment,
) {
  if (segment.start_datetime === segment.end_datetime) {
    return;
  }

  const start = parseDateTime(segment.start_datetime);
  const end = parseDateTime(segment.end_datetime);
  const overlapsLockedManual = segment.source_mode !== 'CONFIRMED'
    && segments.some((existing) => {
      if (existing.equipment_code !== segment.equipment_code) {
        return false;
      }

      const metadata = existing.metadata ?? {};
      if (existing.source_mode !== 'CONFIRMED' || metadata.origin !== 'manual_draft' || metadata.locked !== true) {
        return false;
      }

      return overlaps(
        start,
        end,
        parseDateTime(existing.start_datetime),
        parseDateTime(existing.end_datetime),
      );
    });

  if (overlapsLockedManual) {
    return;
  }

  segments.push(segment);
}

function addMaterialStateSegment(
  segments: V3MaterialStateSegment[],
  segment: V3MaterialStateSegment,
) {
  if (segment.start_datetime === segment.end_datetime) {
    return;
  }

  segments.push(segment);
}

function injectDraftStateSegments(
  nodes: V3MainFlowNode[],
  accumulator: ProjectionAccumulator,
  draftStateSegments: V3DraftStateSegment[] | undefined,
) {
  const materialCodesByEquipment = new Map<string, string[]>();

  nodes.forEach((node) => {
    if (!node.default_equipment_code || !node.default_material_code) {
      return;
    }

    const existing = materialCodesByEquipment.get(node.default_equipment_code) ?? [];
    existing.push(node.default_material_code);
    materialCodesByEquipment.set(node.default_equipment_code, [...new Set(existing)]);
  });

  (draftStateSegments ?? []).forEach((segment, index) => {
    const equipmentCode = normalizeEquipmentCode(segment.equipment_code);
    if (!equipmentCode) {
      return;
    }

    const startDate = parseDateTime(segment.start_datetime);
    const endDate = parseDateTime(segment.end_datetime);
    if (endDate <= startDate) {
      return;
    }

    const equipmentMode = segment.equipment_mode
      ?? nodes.find((node) => node.default_equipment_code === equipmentCode)?.equipment_mode
      ?? 'UNKNOWN';
    const segmentKey = segment.segment_key || `DRAFT_STATE__${equipmentCode}__${index + 1}`;

    addEquipmentStateSegment(accumulator.equipmentStateSegments, {
      segment_key: segmentKey,
      equipment_code: equipmentCode,
      equipment_name: equipmentCode,
      equipment_mode: equipmentMode,
      state_code: segment.state_code,
      source_mode: 'CONFIRMED',
      start_datetime: formatDateTime(startDate)!,
      end_datetime: formatDateTime(endDate)!,
      metadata: {
        ...(segment.metadata ?? {}),
        origin: 'manual_draft',
        locked: segment.locked === true,
      },
    });

    if (segment.state_code !== 'media_holding') {
      return;
    }

    (materialCodesByEquipment.get(equipmentCode) ?? []).forEach((materialCode) => {
      addMaterialStateSegment(accumulator.materialStateSegments, {
        segment_key: `DRAFT_MATERIAL__${segmentKey}__${materialCode}`,
        material_code: materialCode,
        material_name: materialCode,
        state_code: 'in_hold',
        source_mode: 'CONFIRMED',
        start_datetime: formatDateTime(startDate)!,
        end_datetime: formatDateTime(endDate)!,
        metadata: {
          origin: 'manual_draft',
          linked_equipment_code: equipmentCode,
          locked: segment.locked === true,
        },
      });
    });
  });
}

function instantiatePackageOperations(
  rule: V3TriggerRule,
  packageDefinition: V3OperationPackage,
  targetNode: V3MainFlowNode,
  anchorOperation: V3ProjectionOperation,
  accumulator: ProjectionAccumulator,
) {
  const anchorStart = parseDateTime(anchorOperation.start_datetime);
  const generatedOperations: V3ProjectionOperation[] = [];

  for (const member of packageDefinition.members) {
    const offsetMinutes = member.relative_day_offset * 24 * 60 + member.relative_minute_offset;
    let startDate = addMinutes(anchorStart, offsetMinutes);

    if (member.predecessor_member_id) {
      const predecessor = generatedOperations.find(
        (candidate) => candidate.metadata.member_id === member.predecessor_member_id,
      );
      if (predecessor) {
        const predecessorEnd = parseDateTime(predecessor.end_datetime);
        if (startDate < predecessorEnd) {
          startDate = predecessorEnd;
        }
      }
    }

    const endDate = addMinutes(startDate, member.duration_minutes);
    const operation: V3ProjectionOperation = {
      operation_key: `PKG__${rule.rule_code}__${member.member_code}`,
      operation_code: member.operation_code,
      operation_name: member.operation_name,
      role: 'AUXILIARY',
      source: 'PACKAGE_MEMBER',
      equipment_code: targetNode.default_equipment_code,
      equipment_name: targetNode.default_equipment_code,
      equipment_mode: targetNode.equipment_mode === 'ANY' ? packageDefinition.equipment_mode : targetNode.equipment_mode,
      material_state_ref: targetNode.default_material_code,
      start_datetime: formatDateTime(startDate)!,
      end_datetime: formatDateTime(endDate)!,
      window_start_datetime: null,
      window_end_datetime: null,
      generator_rule_id: rule.id,
      generator_rule_code: rule.rule_code,
      generator_package_id: packageDefinition.id,
      generator_package_code: packageDefinition.package_code,
      is_user_adjusted: false,
      metadata: {
        member_code: member.member_code,
        member_id: member.id,
        package_code: packageDefinition.package_code,
        target_node_key: targetNode.node_key,
        ...member.metadata,
      },
    };

    generatedOperations.push(operation);
    accumulator.auxOperations.push(operation);

    if (targetNode.default_equipment_code && member.target_equipment_state) {
      addEquipmentStateSegment(accumulator.equipmentStateSegments, {
        segment_key: `PKG_STATE__${rule.rule_code}__${member.member_code}`,
        equipment_code: targetNode.default_equipment_code,
        equipment_name: targetNode.default_equipment_code,
        equipment_mode: operation.equipment_mode,
        state_code: member.target_equipment_state,
        source_mode: 'PREDICTED',
        start_datetime: operation.start_datetime,
        end_datetime: operation.end_datetime,
        metadata: {
          origin: 'package_member',
          package_code: packageDefinition.package_code,
          member_code: member.member_code,
        },
      });
    }

    if (targetNode.default_material_code && member.target_material_state) {
      addMaterialStateSegment(accumulator.materialStateSegments, {
        segment_key: `PKG_MATERIAL__${rule.rule_code}__${member.member_code}`,
        material_code: targetNode.default_material_code,
        material_name: targetNode.default_material_code,
        state_code: member.target_material_state,
        source_mode: 'PREDICTED',
        start_datetime: operation.start_datetime,
        end_datetime: operation.end_datetime,
        metadata: {
          origin: 'package_member',
          package_code: packageDefinition.package_code,
          member_code: member.member_code,
        },
      });
    }
  }

  const terminalOperation = generatedOperations[generatedOperations.length - 1] ?? null;
  accumulator.generatedByRuleCode.set(rule.rule_code, generatedOperations);
  accumulator.packageTerminalByRuleCode.set(rule.rule_code, terminalOperation);

  if (terminalOperation && targetNode.default_equipment_code && rule.target_equipment_state) {
    addEquipmentStateSegment(accumulator.equipmentStateSegments, {
      segment_key: `PKG_HOLD__${rule.rule_code}`,
      equipment_code: targetNode.default_equipment_code,
      equipment_name: targetNode.default_equipment_code,
      equipment_mode: terminalOperation.equipment_mode,
      state_code: rule.target_equipment_state,
      source_mode: 'PREDICTED',
      start_datetime: terminalOperation.end_datetime,
      end_datetime: anchorOperation.start_datetime,
      metadata: {
        origin: 'package_completion',
        package_code: packageDefinition.package_code,
        rule_code: rule.rule_code,
      },
    });
  }

  if (terminalOperation && targetNode.default_material_code && rule.target_material_state) {
    addMaterialStateSegment(accumulator.materialStateSegments, {
      segment_key: `PKG_MATERIAL_HOLD__${rule.rule_code}`,
      material_code: targetNode.default_material_code,
      material_name: targetNode.default_material_code,
      state_code: rule.target_material_state,
      source_mode: 'PREDICTED',
      start_datetime: terminalOperation.end_datetime,
      end_datetime: anchorOperation.start_datetime,
      metadata: {
        origin: 'package_completion',
        package_code: packageDefinition.package_code,
        rule_code: rule.rule_code,
        hold_window_hours:
          typeof rule.metadata.hold_window_hours === 'number'
            ? rule.metadata.hold_window_hours
            : undefined,
      },
    });
  }
}

function instantiateWindowOperation(
  rule: V3TriggerRule,
  targetNode: V3MainFlowNode,
  anchorDate: Date,
): V3ProjectionOperation {
  const recommendedOffset = rule.recommended_offset_minutes ?? rule.earliest_offset_minutes ?? 0;
  const earliestOffset = rule.earliest_offset_minutes ?? recommendedOffset;
  const latestOffset = rule.latest_offset_minutes ?? recommendedOffset;
  const startDate = addMinutes(anchorDate, recommendedOffset);
  const endDate = addMinutes(startDate, rule.default_duration_minutes);

  return {
    operation_key: `RULE__${rule.rule_code}`,
    operation_code: rule.operation_code ?? rule.rule_code,
    operation_name: rule.operation_name ?? rule.rule_code,
    role: 'AUXILIARY',
    source: 'SYSTEM_DERIVED',
    equipment_code: targetNode.default_equipment_code,
    equipment_name: targetNode.default_equipment_code,
    equipment_mode: targetNode.equipment_mode === 'ANY' ? 'UNKNOWN' : targetNode.equipment_mode,
    material_state_ref: targetNode.default_material_code,
    start_datetime: formatDateTime(startDate)!,
    end_datetime: formatDateTime(endDate)!,
    window_start_datetime: formatDateTime(addMinutes(anchorDate, earliestOffset)),
    window_end_datetime: formatDateTime(addMinutes(anchorDate, latestOffset)),
    generator_rule_id: rule.id,
    generator_rule_code: rule.rule_code,
    generator_package_id: null,
    generator_package_code: null,
    is_user_adjusted: false,
    metadata: {
      target_node_key: targetNode.node_key,
      ...rule.metadata,
    },
  };
}

function instantiateRecurringWindowOperations(
  rule: V3TriggerRule,
  targetNode: V3MainFlowNode,
  anchorDate: Date,
  stopDate: Date,
) {
  const repeatEveryMinutes = rule.repeat_every_minutes ?? 24 * 60;
  const recommendedOffset = rule.recommended_offset_minutes ?? repeatEveryMinutes;
  const earliestOffset = rule.earliest_offset_minutes ?? recommendedOffset;
  const latestOffset = rule.latest_offset_minutes ?? recommendedOffset;
  const operations: V3ProjectionOperation[] = [];

  let occurrenceIndex = 0;
  let referenceDate = addMinutes(anchorDate, recommendedOffset);

  while (referenceDate < stopDate) {
    const endDate = addMinutes(referenceDate, rule.default_duration_minutes);
    operations.push({
      operation_key: `RULE__${rule.rule_code}__${occurrenceIndex + 1}`,
      operation_code: rule.operation_code ?? rule.rule_code,
      operation_name: rule.operation_name ?? rule.rule_code,
      role: 'AUXILIARY',
      source: 'SYSTEM_DERIVED',
      equipment_code: targetNode.default_equipment_code,
      equipment_name: targetNode.default_equipment_code,
      equipment_mode: targetNode.equipment_mode === 'ANY' ? 'UNKNOWN' : targetNode.equipment_mode,
      material_state_ref: targetNode.default_material_code,
      start_datetime: formatDateTime(referenceDate)!,
      end_datetime: formatDateTime(endDate)!,
      window_start_datetime: formatDateTime(addMinutes(anchorDate, earliestOffset + occurrenceIndex * repeatEveryMinutes)),
      window_end_datetime: formatDateTime(addMinutes(anchorDate, latestOffset + occurrenceIndex * repeatEveryMinutes)),
      generator_rule_id: rule.id,
      generator_rule_code: rule.rule_code,
      generator_package_id: null,
      generator_package_code: null,
      is_user_adjusted: false,
      metadata: {
        occurrence_index: occurrenceIndex + 1,
        target_node_key: targetNode.node_key,
        ...rule.metadata,
      },
    });

    occurrenceIndex += 1;
    referenceDate = addMinutes(referenceDate, repeatEveryMinutes);
  }

  return operations;
}

function findMatchingEquipmentStateSegment(
  segments: V3EquipmentStateSegment[],
  stateCode: V3EquipmentStateValue | null,
  anchorDateTime: string,
  equipmentCode: string | null,
) {
  if (!stateCode || !equipmentCode) {
    return null;
  }

  const anchor = parseDateTime(anchorDateTime);

  return (
    segments.find((segment) => {
      const start = parseDateTime(segment.start_datetime);
      const end = parseDateTime(segment.end_datetime);
      return (
        segment.source_mode === 'CONFIRMED'
        && segment.state_code === stateCode
        && segment.equipment_code === equipmentCode
        && start <= anchor
        && end >= anchor
      );
    }) ?? null
  );
}

function findMatchingMaterialStateSegment(
  segments: V3MaterialStateSegment[],
  stateCode: V3MaterialStateValue | null,
  anchorDateTime: string,
  materialCode: string | null,
) {
  if (!stateCode || !materialCode) {
    return null;
  }

  const anchor = parseDateTime(anchorDateTime);

  return (
    segments.find((segment) => {
      const start = parseDateTime(segment.start_datetime);
      const end = parseDateTime(segment.end_datetime);
      return (
        segment.source_mode === 'CONFIRMED'
        && segment.state_code === stateCode
        && segment.material_code === materialCode
        && start <= anchor
        && end >= anchor
      );
    }) ?? null
  );
}

function pushGateRisk(
  accumulator: ProjectionAccumulator,
  risk: V3ProjectionRisk,
) {
  if (accumulator.risks.some((existing) => existing.risk_code === risk.risk_code)) {
    return;
  }

  accumulator.risks.push(risk);
}

function pushManualStateMaintenanceRisks(
  accumulator: ProjectionAccumulator,
  maintenanceRows: MaintenanceWindowRow[],
) {
  const draftSegments = accumulator.equipmentStateSegments.filter(
    (segment) => segment.source_mode === 'CONFIRMED' && segment.metadata.origin === 'manual_draft',
  );

  draftSegments.forEach((segment) => {
    const segmentStart = parseDateTime(segment.start_datetime);
    const segmentEnd = parseDateTime(segment.end_datetime);

    maintenanceRows.forEach((window) => {
      if (window.resource_code !== segment.equipment_code) {
        return;
      }

      const windowStart = parseDateTime(window.start_datetime);
      const windowEnd = parseDateTime(window.end_datetime);
      if (!overlaps(segmentStart, segmentEnd, windowStart, windowEnd)) {
        return;
      }

      pushGateRisk(accumulator, {
        risk_code: riskCode(['MAINTENANCE_CONFLICT', segment.segment_key, segment.equipment_code]),
        risk_type: 'MAINTENANCE_CONFLICT',
        severity: 'BLOCKING',
        equipment_code: segment.equipment_code,
        material_code: null,
        operation_key: null,
        trigger_ref_code: segment.segment_key,
        window_start_datetime: formatDateTime(windowStart),
        window_end_datetime: formatDateTime(windowEnd),
        message: `${segment.equipment_code} manual state ${segment.state_code} overlaps with maintenance (${window.window_type}).`,
        is_blocking: true,
        metadata: {
          segment_key: segment.segment_key,
          state_code: segment.state_code,
          window_type: window.window_type,
        },
      });
    });
  });
}

function buildProjectionRows(
  template: V3TemplateSummary,
  accumulator: ProjectionAccumulator,
  mirroredResources: Map<string, MirroredResourceRow>,
  maintenanceRows: MaintenanceWindowRow[],
  assignmentRows: AssignmentWindowRow[],
  visibleEquipmentCodes: string[],
  horizonEnd: Date,
) {
  const rowMap = new Map<string, ProjectionRowAccumulator>();

  const ensureRow = (equipmentCode: string | null, equipmentMode: V3EquipmentMode, fallbackDomain: 'USP' | 'DSP' | 'SPI') => {
    const code = equipmentCode ?? 'UNASSIGNED';
    const mirrored = equipmentCode ? mirroredResources.get(equipmentCode) : null;
    const existing = rowMap.get(code);

    if (existing) {
      return existing;
    }

    const row: ProjectionRowAccumulator = {
      equipment_code: code,
      equipment_name:
        mirrored?.resource_name ?? (code === 'UNASSIGNED' ? '未绑定设备' : code),
      equipment_mode: code === 'UNASSIGNED' ? 'UNKNOWN' : equipmentMode,
      domain_code: (mirrored?.department_code as 'USP' | 'DSP' | 'SPI' | null) ?? fallbackDomain,
      main_operations: [],
      aux_operations: [],
      state_segments: [],
      risk_markers: [],
      context_windows: [],
    };

    rowMap.set(code, row);
    return row;
  };

  for (const operation of accumulator.mainOperations) {
    ensureRow(operation.equipment_code, operation.equipment_mode, template.domain_code).main_operations.push(operation);
  }

  for (const operation of accumulator.auxOperations) {
    ensureRow(operation.equipment_code, operation.equipment_mode, template.domain_code).aux_operations.push(operation);
  }

  for (const segment of accumulator.equipmentStateSegments) {
    ensureRow(segment.equipment_code, segment.equipment_mode, template.domain_code).state_segments.push(segment);
  }

  for (const risk of accumulator.risks) {
    ensureRow(risk.equipment_code, 'UNKNOWN', template.domain_code).risk_markers.push(risk);
  }

  for (const maintenance of maintenanceRows) {
    const row = ensureRow(maintenance.resource_code, 'UNKNOWN', template.domain_code);
    row.context_windows.push({
      window_key: `MAINT__${maintenance.resource_code}__${formatDateTime(maintenance.start_datetime)}`,
      window_type: 'MAINTENANCE',
      label: `维护: ${maintenance.window_type}`,
      start_datetime: formatDateTime(maintenance.start_datetime)!,
      end_datetime: formatDateTime(maintenance.end_datetime)!,
      severity: 'BLOCKING',
    });
  }

  for (const assignment of assignmentRows) {
    const row = ensureRow(assignment.resource_code, 'UNKNOWN', template.domain_code);
    row.context_windows.push({
      window_key: `ASSIGN__${assignment.resource_code}__${formatDateTime(assignment.start_datetime)}`,
      window_type: 'EXISTING_ASSIGNMENT',
      label: assignment.notes ?? `既有占用 ${assignment.batch_operation_plan_id ?? assignment.standalone_task_id ?? ''}`.trim(),
      start_datetime: formatDateTime(assignment.start_datetime)!,
      end_datetime: formatDateTime(assignment.end_datetime)!,
      severity: 'WARNING',
    });
  }

  visibleEquipmentCodes.forEach((equipmentCode) => {
    ensureRow(equipmentCode, 'UNKNOWN', template.domain_code);
  });

  rowMap.forEach((row) => {
    row.main_operations.sort((left, right) =>
      parseDateTime(left.start_datetime).getTime() - parseDateTime(right.start_datetime).getTime(),
    );
    row.aux_operations.sort((left, right) =>
      parseDateTime(left.start_datetime).getTime() - parseDateTime(right.start_datetime).getTime(),
    );
    row.state_segments.sort((left, right) =>
      parseDateTime(left.start_datetime).getTime() - parseDateTime(right.start_datetime).getTime(),
    );
    row.context_windows.sort((left, right) =>
      parseDateTime(left.start_datetime).getTime() - parseDateTime(right.start_datetime).getTime(),
    );
    row.risk_markers.sort((left, right) =>
      parseDateTime(left.window_start_datetime ?? left.window_end_datetime ?? formatDateTime(horizonEnd)!).getTime()
      - parseDateTime(right.window_start_datetime ?? right.window_end_datetime ?? formatDateTime(horizonEnd)!).getTime(),
    );
  });

  return [...rowMap.values()] as V3EquipmentTimelineRow[];
}

async function persistProjectionRun(
  template: V3TemplateSummary,
  request: V3ProjectionPreviewRequest,
  horizonEnd: string,
  accumulator: ProjectionAccumulator,
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [runResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO ${v3Table('v3_projection_runs')} (
         template_id,
         template_code,
         run_mode,
         status,
         planned_start_datetime,
         horizon_end_datetime,
         requested_equipment_codes,
         warnings,
         metadata
       ) VALUES (?, ?, 'PREVIEW', 'READY', ?, ?, ?, ?, ?)`,
      [
        template.id,
        template.template_code,
        request.planned_start_datetime,
        horizonEnd,
        JSON.stringify(request.equipment_codes ?? []),
        JSON.stringify(
          accumulator.risks
            .filter((risk) => risk.severity !== 'BLOCKING')
            .map((risk) => risk.message),
        ),
        JSON.stringify({
          minimum_snap_minutes: FIVE_MINUTES,
          requested_horizon_days: request.horizon_days ?? 7,
        }),
      ],
    );

    const runId = Number(runResult.insertId);

    const operations = [...accumulator.mainOperations, ...accumulator.auxOperations];
    if (operations.length) {
      const placeholders = operations
        .map(
          () =>
            '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .join(', ');
      const params: Array<string | number | null> = operations.flatMap((operation) => [
        runId,
        template.id,
        typeof operation.metadata.node_id === 'number' ? operation.metadata.node_id : null,
        operation.generator_rule_id,
        operation.generator_package_id,
        operation.operation_key,
        operation.operation_code,
        operation.operation_name,
        operation.role,
        operation.source,
        operation.equipment_code,
        operation.equipment_name,
        operation.equipment_mode,
        operation.material_state_ref,
        operation.start_datetime,
        operation.end_datetime,
        operation.window_start_datetime,
        operation.window_end_datetime,
        operation.role === 'MAIN' ? 'MAIN' : 'AUXILIARY',
        operation.is_user_adjusted ? 1 : 0,
        JSON.stringify(operation.metadata),
      ]);
      await connection.execute(
        `INSERT INTO ${v3Table('v3_projection_operations')} (
           run_id,
           template_id,
           node_id,
           rule_id,
           package_id,
           operation_key,
           operation_code,
           operation_name,
           role,
           source,
           equipment_code,
           equipment_name,
           equipment_mode,
           material_state_ref,
           start_datetime,
           end_datetime,
           window_start_datetime,
           window_end_datetime,
           display_lane,
           is_user_adjusted,
           metadata
         ) VALUES ${placeholders}`,
        params,
      );
    }

    if (accumulator.risks.length) {
      const placeholders = accumulator.risks
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const params: Array<string | number | null> = accumulator.risks.flatMap((risk) => [
        runId,
        template.id,
        risk.risk_code,
        risk.risk_type,
        risk.severity,
        risk.equipment_code,
        risk.material_code,
        risk.operation_key,
        risk.trigger_ref_code,
        risk.window_start_datetime,
        risk.window_end_datetime,
        risk.message,
        risk.is_blocking ? 1 : 0,
        JSON.stringify(risk.metadata),
      ]);
      await connection.execute(
        `INSERT INTO ${v3Table('v3_projection_risks')} (
           run_id,
           template_id,
           risk_code,
           risk_type,
           severity,
           equipment_code,
           material_code,
           operation_key,
           trigger_ref_code,
           window_start_datetime,
           window_end_datetime,
           message,
           is_blocking,
           metadata
         ) VALUES ${placeholders}`,
        params,
      );
    }

    if (accumulator.equipmentStateSegments.length) {
      const placeholders = accumulator.equipmentStateSegments
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const params = accumulator.equipmentStateSegments.flatMap((segment) => [
        segment.equipment_code,
        segment.equipment_name,
        segment.equipment_mode,
        segment.state_code,
        'PROJECTION',
        `RUN:${runId}`,
        segment.source_mode,
        segment.start_datetime,
        segment.end_datetime,
        JSON.stringify(segment.metadata),
      ]);
      await connection.execute(
        `INSERT INTO ${v3Table('v3_equipment_state_segments')} (
           resource_code,
           resource_name,
           equipment_mode,
           state_code,
           source_mode,
           source_ref,
           confidence,
           start_datetime,
           end_datetime,
           metadata
         ) VALUES ${placeholders}`,
        params,
      );
    }

    if (accumulator.materialStateSegments.length) {
      const placeholders = accumulator.materialStateSegments
        .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .join(', ');
      const params = accumulator.materialStateSegments.flatMap((segment) => [
        segment.material_code,
        segment.material_name,
        segment.state_code,
        'PROJECTION',
        `RUN:${runId}`,
        segment.source_mode,
        segment.start_datetime,
        segment.end_datetime,
        JSON.stringify(segment.metadata),
      ]);
      await connection.execute(
        `INSERT INTO ${v3Table('v3_material_state_segments')} (
           material_code,
           material_name,
           state_code,
           source_mode,
           source_ref,
           confidence,
           start_datetime,
           end_datetime,
           metadata
         ) VALUES ${placeholders}`,
        params,
      );
    }

    await connection.commit();
    return runId;
  } catch (error) {
    await connection.rollback();
    requireV3Availability(error);
  } finally {
    connection.release();
  }
}

export async function previewV3Projection(
  request: V3ProjectionPreviewRequest,
): Promise<V3ProjectionPreviewResponse> {
  if (!request.template_id || !Number.isFinite(Number(request.template_id))) {
    throw new Error('template_id is required');
  }

  if (!request.planned_start_datetime) {
    throw new Error('planned_start_datetime is required');
  }

  const plannedStart = parseDateTime(request.planned_start_datetime);
  const horizonEnd = addMinutes(plannedStart, Math.max(request.horizon_days ?? 7, 1) * 24 * 60);
  const context = await loadProjectionContext(Number(request.template_id));

  if (!context) {
    throw new Error(`V3 template ${request.template_id} was not found`);
  }

  const nodes = applyNodeBindingOverrides(context.nodes, request.draft_node_bindings);
  const accumulator = buildMainOperations(
    nodes,
    context.edges,
    plannedStart,
    request.draft_main_operation_overrides,
  );
  injectDraftStateSegments(nodes, accumulator, request.draft_state_segments);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (const rule of context.rules) {
    const targetNode = rule.target_node_id ? nodeById.get(rule.target_node_id) : null;
    const anchorOperation = targetNode ? accumulator.operationsByNodeId.get(targetNode.id) : undefined;
    const dependencyOperations =
      (rule.dependency_rule_code && accumulator.generatedByRuleCode.get(rule.dependency_rule_code))
      || (rule.anchor_ref_code && accumulator.generatedByRuleCode.get(rule.anchor_ref_code))
      || [];
    const dependencyTerminalOperation = dependencyOperations[dependencyOperations.length - 1];

    if (rule.trigger_mode === 'PACKAGE_BEFORE_START' && targetNode && anchorOperation) {
      const packageDefinition = context.packages.find(
        (pkg) => pkg.id === rule.generator_package_id,
      );

      if (packageDefinition) {
        instantiatePackageOperations(rule, packageDefinition, targetNode, anchorOperation, accumulator);
      }
      continue;
    }

    if (rule.trigger_mode === 'WINDOW' && targetNode && anchorOperation) {
      const anchorDate = resolveAnchorDateTime(rule.anchor_mode, anchorOperation, dependencyTerminalOperation);
      if (anchorDate) {
        const operation = instantiateWindowOperation(rule, targetNode, anchorDate);
        accumulator.auxOperations.push(operation);
        accumulator.generatedByRuleCode.set(rule.rule_code, [operation]);
      }
      continue;
    }

    if (rule.trigger_mode === 'RECURRING_WINDOW' && targetNode && anchorOperation) {
      const anchorDate = resolveAnchorDateTime(rule.anchor_mode, anchorOperation, dependencyTerminalOperation);
      const stopNodeOperation = rule.repeat_until_node_id
        ? accumulator.operationsByNodeId.get(rule.repeat_until_node_id)
        : undefined;
      const stopDate = stopNodeOperation
        ? parseDateTime(stopNodeOperation.start_datetime)
        : horizonEnd;
      if (anchorDate) {
        const operations = instantiateRecurringWindowOperations(rule, targetNode, anchorDate, stopDate);
        accumulator.auxOperations.push(...operations);
        accumulator.generatedByRuleCode.set(rule.rule_code, operations);
      }
      continue;
    }

    if (rule.trigger_mode === 'FOLLOW_DEPENDENCY' && targetNode) {
      const operations: V3ProjectionOperation[] = dependencyOperations.map((dependencyOperation, index) => {
        const anchorDate = parseDateTime(dependencyOperation.end_datetime);
        return {
          ...instantiateWindowOperation(rule, targetNode, anchorDate),
          operation_key: `RULE__${rule.rule_code}__${index + 1}`,
          metadata: {
            ...rule.metadata,
            dependency_operation_key: dependencyOperation.operation_key,
            occurrence_index: index + 1,
            target_node_key: targetNode.node_key,
          },
        };
      });

      accumulator.auxOperations.push(...operations);
      accumulator.generatedByRuleCode.set(rule.rule_code, operations);
      continue;
    }

    if (rule.trigger_mode === 'STATE_GATE' && targetNode && anchorOperation) {
      const gateDateTime = anchorOperation.start_datetime;
      const equipmentCode = targetNode.default_equipment_code;
      const materialCode = targetNode.default_material_code;

      if (rule.target_equipment_state) {
        const matchingEquipmentState = findMatchingEquipmentStateSegment(
          accumulator.equipmentStateSegments,
          rule.target_equipment_state,
          gateDateTime,
          equipmentCode,
        );

        if (!matchingEquipmentState) {
          pushGateRisk(accumulator, {
            risk_code: riskCode(['STATE_GAP', rule.rule_code, equipmentCode ?? targetNode.node_key]),
            risk_type: 'STATE_GAP',
            severity: riskSeverity(rule.is_blocking),
            equipment_code: equipmentCode,
            material_code: materialCode,
            operation_key: anchorOperation.operation_key,
            trigger_ref_code: rule.rule_code,
            window_start_datetime: gateDateTime,
            window_end_datetime: gateDateTime,
            message: `${targetNode.display_name} starts without required equipment state ${rule.target_equipment_state}.`,
            is_blocking: rule.is_blocking,
            metadata: { gate: 'equipment_state', required_state: rule.target_equipment_state },
          });
        }
      }

      if (rule.target_material_state) {
        const matchingMaterialState = findMatchingMaterialStateSegment(
          accumulator.materialStateSegments,
          rule.target_material_state,
          gateDateTime,
          materialCode,
        );

        if (!matchingMaterialState) {
          pushGateRisk(accumulator, {
            risk_code: riskCode(['STATE_GAP', rule.rule_code, materialCode ?? targetNode.node_key]),
            risk_type: 'STATE_GAP',
            severity: riskSeverity(rule.is_blocking),
            equipment_code: equipmentCode,
            material_code: materialCode,
            operation_key: anchorOperation.operation_key,
            trigger_ref_code: rule.rule_code,
            window_start_datetime: gateDateTime,
            window_end_datetime: gateDateTime,
            message: `${targetNode.display_name} starts without required material state ${rule.target_material_state}.`,
            is_blocking: rule.is_blocking,
            metadata: { gate: 'material_state', required_state: rule.target_material_state },
          });
        }
      }
    }
  }

  const pinnedEquipmentCodes = (request.visible_equipment_codes ?? []).map(normalizeEquipmentCode).filter(Boolean) as string[];
  const legacyFilteredCodes = request.visible_equipment_codes
    ? []
    : (request.equipment_codes ?? []).map(normalizeEquipmentCode).filter(Boolean) as string[];
  const draftStateEquipmentCodes = (request.draft_state_segments ?? [])
    .map((segment) => normalizeEquipmentCode(segment.equipment_code))
    .filter(Boolean) as string[];
  const candidateEquipmentCodes = [
    ...new Set(
      [
        ...nodes.map((node) => node.default_equipment_code).filter(Boolean),
        ...accumulator.mainOperations.map((operation) => operation.equipment_code).filter(Boolean),
        ...accumulator.auxOperations.map((operation) => operation.equipment_code).filter(Boolean),
        ...draftStateEquipmentCodes,
        ...pinnedEquipmentCodes,
        ...legacyFilteredCodes,
      ] as string[],
    ),
  ];
  const effectiveEquipmentCodes = legacyFilteredCodes.length
    ? candidateEquipmentCodes.filter((code) => legacyFilteredCodes.includes(code))
    : candidateEquipmentCodes;

  const mirrored = await loadMirroredResources(
    effectiveEquipmentCodes,
    formatDateTime(plannedStart)!,
    formatDateTime(horizonEnd)!,
  );

  for (const equipmentCode of effectiveEquipmentCodes) {
    if (mirrored.storage_mode !== 'schema') {
      continue;
    }

    if (!mirrored.resources.has(equipmentCode)) {
      accumulator.risks.push({
        risk_code: riskCode(['MISSING_MIRROR_RESOURCE', equipmentCode]),
        risk_type: 'MISSING_MIRROR_RESOURCE',
        severity: 'WARNING',
        equipment_code: equipmentCode,
        material_code: null,
        operation_key: null,
        trigger_ref_code: null,
        window_start_datetime: formatDateTime(plannedStart),
        window_end_datetime: formatDateTime(horizonEnd),
        message: `${equipmentCode} exists in V3 template bindings but is not present in mirrored legacy master data.`,
        is_blocking: false,
        metadata: { equipment_code: equipmentCode },
      });
    }
  }

  pushManualStateMaintenanceRisks(accumulator, mirrored.maintenance);

  const projectedOperations = [...accumulator.mainOperations, ...accumulator.auxOperations];
  const contextWindows = [
    ...mirrored.maintenance.map((window) => ({
      kind: 'MAINTENANCE_CONFLICT' as const,
      equipment_code: window.resource_code,
      label: window.window_type,
      start: parseDateTime(window.start_datetime),
      end: parseDateTime(window.end_datetime),
      blocking: true,
    })),
    ...mirrored.assignments.map((window) => ({
      kind: 'ASSIGNMENT_CONFLICT' as const,
      equipment_code: window.resource_code,
      label: window.notes ?? window.assignment_status,
      start: parseDateTime(window.start_datetime),
      end: parseDateTime(window.end_datetime),
      blocking: false,
    })),
  ];

  for (const operation of projectedOperations) {
    if (!operation.equipment_code) {
      continue;
    }

    const start = parseDateTime(operation.start_datetime);
    const end = parseDateTime(operation.end_datetime);

    for (const window of contextWindows) {
      if (window.equipment_code !== operation.equipment_code) {
        continue;
      }

      if (!overlaps(start, end, window.start, window.end)) {
        continue;
      }

      accumulator.risks.push({
        risk_code: riskCode([window.kind, operation.operation_key, operation.equipment_code]),
        risk_type: window.kind,
        severity: riskSeverity(window.blocking),
        equipment_code: operation.equipment_code,
        material_code: operation.material_state_ref,
        operation_key: operation.operation_key,
        trigger_ref_code: operation.generator_rule_code,
        window_start_datetime: formatDateTime(window.start),
        window_end_datetime: formatDateTime(window.end),
        message: `${operation.operation_name} overlaps with ${window.kind === 'MAINTENANCE_CONFLICT' ? 'maintenance' : 'an existing assignment'} (${window.label}).`,
        is_blocking: window.blocking,
        metadata: {
          conflict_label: window.label,
          operation_code: operation.operation_code,
        },
      });
    }
  }

  for (const segment of accumulator.materialStateSegments) {
    const holdWindowHours = Number(segment.metadata.hold_window_hours ?? 0);
    if (!holdWindowHours) {
      continue;
    }

    const start = parseDateTime(segment.start_datetime);
    const allowedEnd = addMinutes(start, holdWindowHours * 60);
    const actualEnd = parseDateTime(segment.end_datetime);
    if (actualEnd > allowedEnd) {
      accumulator.risks.push({
        risk_code: riskCode(['MATERIAL_HOLD_RISK', segment.material_code, segment.segment_key]),
        risk_type: 'MATERIAL_HOLD_RISK',
        severity: 'BLOCKING',
        equipment_code: null,
        material_code: segment.material_code,
        operation_key: null,
        trigger_ref_code: segment.segment_key,
        window_start_datetime: segment.start_datetime,
        window_end_datetime: segment.end_datetime,
        message: `${segment.material_code} exceeds configured hold window of ${holdWindowHours}h.`,
        is_blocking: true,
        metadata: {
          hold_window_hours: holdWindowHours,
          actual_hold_minutes: diffMinutes(start, actualEnd),
        },
      });
    }
  }

  const latestSync = await loadLatestSyncStatus();
  const rows = buildProjectionRows(
    context.template,
    accumulator,
    mirrored.resources,
    mirrored.maintenance,
    mirrored.assignments,
    effectiveEquipmentCodes,
    horizonEnd,
  );

  const filteredRows = rows;

  const runId = request.persist_run === false || context.storage_mode !== 'schema'
    ? null
    : await persistProjectionRun(
        context.template,
        request,
        formatDateTime(horizonEnd)!,
        accumulator,
      );

  return {
    run_id: runId,
    template: context.template,
    planned_start_datetime: formatDateTime(plannedStart)!,
    horizon_end_datetime: formatDateTime(horizonEnd)!,
    rows: filteredRows,
    material_state_segments: accumulator.materialStateSegments,
    risks: accumulator.risks,
    zoom_presets: {
      default_level: 'week',
      levels: V3_ZOOM_LEVELS,
      minimum_snap_minutes: FIVE_MINUTES,
    },
    sync_snapshot: {
      last_sync_at: latestSync.finished_at ?? latestSync.started_at,
      last_sync_status: latestSync.status,
    },
  };
}

export function isV3SchemaUnavailableError(error: unknown): error is V3SchemaUnavailableError {
  return error instanceof V3SchemaUnavailableError;
}
