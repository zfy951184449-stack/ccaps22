import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../backend/src/config/database';

export interface PreflightReport {
  status: 'PASS' | 'FAIL';
  mysqlVersion: string | null;
  supportsCheckConstraints: boolean | null;
  blockers: string[];
  warnings: string[];
  suggestedActions: string[];
  existingColumns: string[];
  existingIndexes: string[];
  existingForeignKeys: string[];
}

interface ColumnSpec {
  tableName: string;
  columnName: string;
}

interface IndexSpec {
  tableName: string;
  indexName: string;
}

interface ForeignKeySpec {
  tableName: string;
  constraintName: string;
}

const REQUIRED_LEGACY_TABLES = [
  'employees',
  'scheduling_runs',
  'scheduling_results',
  'production_batch_plans',
  'batch_operation_plans',
  'process_templates',
  'process_stages',
  'stage_operation_schedules',
  'operation_constraints',
  'batch_operation_constraints',
  'operation_qualification_requirements',
  'qualifications',
  'resources',
];

const PHASE0A_COLUMNS: ColumnSpec[] = [
  { tableName: 'scheduling_runs', columnName: 'scenario_id' },
  { tableName: 'scheduling_runs', columnName: 'run_context' },
  { tableName: 'scheduling_results', columnName: 'scenario_id' },
  { tableName: 'scheduling_results', columnName: 'result_context' },
  { tableName: 'production_batch_plans', columnName: 'product_id' },
  { tableName: 'production_batch_plans', columnName: 'recipe_version_id' },
  { tableName: 'production_batch_plans', columnName: 'campaign_id' },
  { tableName: 'production_batch_plans', columnName: 'recipe_snapshot_id' },
  { tableName: 'production_batch_plans', columnName: 'planning_status' },
  { tableName: 'batch_operation_plans', columnName: 'recipe_unit_operation_id' },
  { tableName: 'batch_operation_plans', columnName: 'operation_planning_status' },
  { tableName: 'process_templates', columnName: 'migrated_recipe_version_id' },
  { tableName: 'stage_operation_schedules', columnName: 'migrated_recipe_unit_operation_id' },
  { tableName: 'operation_constraints', columnName: 'migrated_operation_dependency_id' },
  { tableName: 'batch_operation_constraints', columnName: 'source_operation_dependency_id' },
];

const PHASE0A_INDEXES: IndexSpec[] = [
  { tableName: 'scheduling_runs', indexName: 'idx_scheduling_runs_scenario' },
  { tableName: 'scheduling_runs', indexName: 'idx_scheduling_runs_context_status' },
  { tableName: 'scheduling_results', indexName: 'idx_scheduling_results_scenario' },
  { tableName: 'scheduling_results', indexName: 'idx_scheduling_results_context_state' },
  { tableName: 'production_batch_plans', indexName: 'idx_pbp_product' },
  { tableName: 'production_batch_plans', indexName: 'idx_pbp_recipe_version' },
  { tableName: 'production_batch_plans', indexName: 'idx_pbp_campaign' },
  { tableName: 'production_batch_plans', indexName: 'idx_pbp_recipe_snapshot' },
  { tableName: 'batch_operation_plans', indexName: 'idx_bop_recipe_unit_operation' },
  { tableName: 'batch_operation_plans', indexName: 'idx_bop_operation_planning_status' },
  { tableName: 'process_templates', indexName: 'idx_process_templates_migrated_recipe' },
  { tableName: 'stage_operation_schedules', indexName: 'idx_sos_migrated_unit_operation' },
  { tableName: 'operation_constraints', indexName: 'idx_operation_constraints_migrated_dependency' },
  { tableName: 'batch_operation_constraints', indexName: 'idx_batch_constraints_source_dependency' },
];

const PHASE0A_FOREIGN_KEYS: ForeignKeySpec[] = [
  { tableName: 'scheduling_runs', constraintName: 'fk_scheduling_runs_scenario' },
  { tableName: 'scheduling_results', constraintName: 'fk_scheduling_results_scenario' },
  { tableName: 'production_batch_plans', constraintName: 'fk_pbp_product' },
  { tableName: 'production_batch_plans', constraintName: 'fk_pbp_recipe_version' },
  { tableName: 'production_batch_plans', constraintName: 'fk_pbp_campaign' },
  { tableName: 'production_batch_plans', constraintName: 'fk_pbp_recipe_snapshot' },
  { tableName: 'batch_operation_plans', constraintName: 'fk_bop_recipe_unit_operation' },
  { tableName: 'process_templates', constraintName: 'fk_process_templates_migrated_recipe' },
  { tableName: 'stage_operation_schedules', constraintName: 'fk_sos_migrated_unit_operation' },
  { tableName: 'operation_constraints', constraintName: 'fk_operation_constraints_migrated_dependency' },
  { tableName: 'batch_operation_constraints', constraintName: 'fk_batch_constraints_source_dependency' },
];

export async function tableExists(tableName: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

export async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}

export async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
     LIMIT 1`,
    [tableName, indexName],
  );
  return rows.length > 0;
}

export async function foreignKeyExists(tableName: string, constraintName: string): Promise<boolean> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT 1
     FROM information_schema.table_constraints
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?
       AND constraint_type = 'FOREIGN KEY'
     LIMIT 1`,
    [tableName, constraintName],
  );
  return rows.length > 0;
}

const countRows = async (sql: string): Promise<number> => {
  const [rows] = await pool.execute<RowDataPacket[]>(sql);
  return Number(rows[0]?.count ?? 0);
};

const parseCheckSupport = (version: string | null): boolean | null => {
  if (!version) return null;
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (major > 8) return true;
  if (major < 8) return false;
  if (minor > 0) return true;
  return patch >= 16;
};

const checkColumnForDisallowedText = async (
  tableName: string,
  columnName: string,
  disallowedText: string,
): Promise<boolean> => {
  if (!(await columnExists(tableName, columnName))) return false;
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT column_type
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [tableName, columnName],
  );
  return String(rows[0]?.column_type ?? '').includes(disallowedText);
};

export async function runPreflight(): Promise<PreflightReport> {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const suggestedActions: string[] = [];
  const existingColumns: string[] = [];
  const existingIndexes: string[] = [];
  const existingForeignKeys: string[] = [];

  const [versionRows] = await pool.execute<RowDataPacket[]>(`SELECT VERSION() AS version`);
  const mysqlVersion = versionRows[0] ? String(versionRows[0].version) : null;
  const supportsCheckConstraints = parseCheckSupport(mysqlVersion);
  if (supportsCheckConstraints === null) {
    warnings.push('MYSQL_VERSION_CHECK_REQUIRED');
    suggestedActions.push('Confirm whether this MySQL build enforces CHECK constraints; service-layer validation remains mandatory.');
  }

  for (const tableName of REQUIRED_LEGACY_TABLES) {
    if (!(await tableExists(tableName))) {
      blockers.push(`MISSING_LEGACY_TABLE:${tableName}`);
    }
  }

  for (const spec of PHASE0A_COLUMNS) {
    if (await columnExists(spec.tableName, spec.columnName)) {
      existingColumns.push(`${spec.tableName}.${spec.columnName}`);
      warnings.push(`COLUMN_EXISTS_SKIP:${spec.tableName}.${spec.columnName}`);
    }
  }

  for (const spec of PHASE0A_INDEXES) {
    if (await indexExists(spec.tableName, spec.indexName)) {
      existingIndexes.push(`${spec.tableName}.${spec.indexName}`);
      warnings.push(`INDEX_EXISTS_SKIP:${spec.tableName}.${spec.indexName}`);
    }
  }

  for (const spec of PHASE0A_FOREIGN_KEYS) {
    if (await foreignKeyExists(spec.tableName, spec.constraintName)) {
      existingForeignKeys.push(`${spec.tableName}.${spec.constraintName}`);
      warnings.push(`FK_EXISTS_SKIP:${spec.tableName}.${spec.constraintName}`);
    }
  }

  if ((await tableExists('production_batch_plans')) && (await tableExists('process_templates'))) {
    const orphanBatches = await countRows(`
      SELECT COUNT(*) AS count
      FROM production_batch_plans pbp
      LEFT JOIN process_templates pt ON pt.id = pbp.template_id
      WHERE pt.id IS NULL
    `);
    if (orphanBatches > 0) blockers.push(`ORPHAN_LEGACY_REFERENCE:production_batch_plans.template_id:${orphanBatches}`);
  }

  if ((await tableExists('operation_constraints')) && (await tableExists('stage_operation_schedules'))) {
    const orphanTemplateDependencies = await countRows(`
      SELECT COUNT(*) AS count
      FROM operation_constraints oc
      LEFT JOIN stage_operation_schedules cur ON cur.id = oc.schedule_id
      LEFT JOIN stage_operation_schedules pred ON pred.id = oc.predecessor_schedule_id
      WHERE cur.id IS NULL OR pred.id IS NULL
    `);
    if (orphanTemplateDependencies > 0) {
      blockers.push(`ORPHAN_LEGACY_REFERENCE:operation_constraints.stage_operation_schedules:${orphanTemplateDependencies}`);
    }
  }

  if ((await tableExists('batch_operation_constraints')) && (await tableExists('batch_operation_plans'))) {
    const orphanBatchDependencies = await countRows(`
      SELECT COUNT(*) AS count
      FROM batch_operation_constraints boc
      LEFT JOIN batch_operation_plans cur ON cur.id = boc.batch_operation_plan_id
      LEFT JOIN batch_operation_plans pred ON pred.id = boc.predecessor_batch_operation_plan_id
      WHERE cur.id IS NULL OR pred.id IS NULL
    `);
    if (orphanBatchDependencies > 0) {
      blockers.push(`ORPHAN_LEGACY_REFERENCE:batch_operation_constraints.batch_operation_plans:${orphanBatchDependencies}`);
    }
  }

  const legacyQualitySystemToken = ['G', 'XP'].join('');
  if (await checkColumnForDisallowedText('roles', 'role_scope', legacyQualitySystemToken)) {
    blockers.push('DISALLOWED_LEGACY_QUALITY_ROLE_SCOPE_ENUM');
  }
  if (await checkColumnForDisallowedText('permissions', 'permission_domain', legacyQualitySystemToken)) {
    blockers.push('DISALLOWED_LEGACY_QUALITY_PERMISSION_DOMAIN_ENUM');
  }

  return {
    status: blockers.length === 0 ? 'PASS' : 'FAIL',
    mysqlVersion,
    supportsCheckConstraints,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    suggestedActions,
    existingColumns,
    existingIndexes,
    existingForeignKeys,
  };
}

if (require.main === module) {
  runPreflight()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      return pool.end().then(() => process.exit(report.status === 'PASS' ? 0 : 1));
    })
    .catch((error) => {
      console.error(JSON.stringify({
        status: 'FAIL',
        blockers: ['PREFLIGHT_EXECUTION_FAILED'],
        warnings: [],
        suggestedActions: [error instanceof Error ? error.message : String(error)],
      }, null, 2));
      pool.end().finally(() => process.exit(1));
    });
}
