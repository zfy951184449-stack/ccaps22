import type { RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import { RecipeOperationSkillRequirementService } from './RecipeOperationSkillRequirementService';
import { RecipeVersionService, ProposedOperationDependency } from './RecipeVersionService';

export type LegacyBackfillExceptionCode =
  | 'LEGACY_PRODUCT_REQUIRED'
  | 'TEMPLATE_WITHOUT_OPERATIONS'
  | 'OPERATION_DURATION_MISSING'
  | 'DEPENDENCY_TARGET_MISSING'
  | 'DEPENDENCY_CYCLE_DETECTED'
  | 'SKILL_REQUIREMENT_UNMAPPED'
  | 'BATCH_TEMPLATE_MISSING'
  | 'CAMPAIGN_GROUPING_AMBIGUOUS'
  | 'ORPHAN_LEGACY_REFERENCE'
  | 'MYSQL_VERSION_CHECK_REQUIRED';

export interface LegacyBackfillDryRunReport {
  templatesScanned: number;
  recipeVersionsProposed: number;
  unitOperationsProposed: number;
  dependenciesProposed: number;
  skillRequirementsProposed: number;
  batchSnapshotsProposed: number;
  campaignCandidatesProposed: number;
  blockers: LegacyBackfillExceptionCode[];
  warnings: LegacyBackfillExceptionCode[];
}

export class LegacyBackfillDryRunService {
  static async runDryRun(): Promise<LegacyBackfillDryRunReport> {
    const [templates, batches, dependencies, skillRequirements] = await Promise.all([
      this.scanTemplates(),
      this.scanBatches(),
      this.scanDependencies(),
      this.scanSkillRequirements(),
    ]);

    return this.buildReport({ templates, batches, dependencies, skillRequirements });
  }

  static async scanTemplates(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         pt.id AS template_id,
         pt.template_code,
         pt.template_name,
         COUNT(DISTINCT ps.id) AS stage_count,
         COUNT(DISTINCT sos.id) AS operation_count
       FROM process_templates pt
       LEFT JOIN process_stages ps ON ps.template_id = pt.id
       LEFT JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
       GROUP BY pt.id, pt.template_code, pt.template_name
       ORDER BY pt.id`,
    );
    return rows;
  }

  static async scanBatches(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         pbp.id AS batch_plan_id,
         pbp.batch_code,
         pbp.template_id,
         pbp.project_code,
         pt.id AS template_exists
       FROM production_batch_plans pbp
       LEFT JOIN process_templates pt ON pt.id = pbp.template_id
       ORDER BY pbp.id`,
    );
    return rows;
  }

  static async scanDependencies(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         oc.id AS operation_constraint_id,
         oc.schedule_id,
         oc.predecessor_schedule_id,
         from_sos.id AS predecessor_exists,
         to_sos.id AS successor_exists
       FROM operation_constraints oc
       LEFT JOIN stage_operation_schedules from_sos ON from_sos.id = oc.predecessor_schedule_id
       LEFT JOIN stage_operation_schedules to_sos ON to_sos.id = oc.schedule_id
       ORDER BY oc.id`,
    );
    return rows;
  }

  static async scanSkillRequirements(): Promise<RowDataPacket[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         oqr.id AS requirement_id,
         oqr.operation_id,
         oqr.qualification_id,
         q.id AS qualification_exists
       FROM operation_qualification_requirements oqr
       LEFT JOIN qualifications q ON q.id = oqr.qualification_id
       ORDER BY oqr.id`,
    );
    return rows;
  }

  static detectDependencyCycles(dependencies: ProposedOperationDependency[]): boolean {
    return !RecipeVersionService.validateDependencies(dependencies).isValid;
  }

  static async buildReport(input: {
    templates: RowDataPacket[];
    batches: RowDataPacket[];
    dependencies: RowDataPacket[];
    skillRequirements: RowDataPacket[];
  }): Promise<LegacyBackfillDryRunReport> {
    const blockers = new Set<LegacyBackfillExceptionCode>();
    const warnings = new Set<LegacyBackfillExceptionCode>();
    let unitOperationsProposed = 0;
    let dependenciesProposed = 0;

    for (const template of input.templates) {
      if (Number(template.operation_count ?? 0) === 0) {
        blockers.add('TEMPLATE_WITHOUT_OPERATIONS');
      }

      const templateDryRun = await RecipeVersionService.dryRunPublishFromTemplate({
        templateId: Number(template.template_id),
      });
      unitOperationsProposed += templateDryRun.unitOperationsProposed.length;
      dependenciesProposed += templateDryRun.dependenciesProposed.length;
      for (const blocker of templateDryRun.blockers) {
        if (isLegacyBackfillExceptionCode(blocker)) blockers.add(blocker);
      }
      for (const warning of templateDryRun.warnings) {
        if (isLegacyBackfillExceptionCode(warning)) warnings.add(warning);
      }
    }

    for (const batch of input.batches) {
      if (!batch.template_exists) blockers.add('BATCH_TEMPLATE_MISSING');
      if (!batch.project_code) warnings.add('CAMPAIGN_GROUPING_AMBIGUOUS');
    }

    for (const dependency of input.dependencies) {
      if (!dependency.predecessor_exists || !dependency.successor_exists) {
        blockers.add('DEPENDENCY_TARGET_MISSING');
      }
    }

    const skillDryRun = await RecipeOperationSkillRequirementService.dryRunMapFromLegacyRequirements();
    for (const requirement of skillDryRun) {
      for (const blocker of requirement.blockers) {
        if (isLegacyBackfillExceptionCode(blocker)) blockers.add(blocker);
      }
    }

    return {
      templatesScanned: input.templates.length,
      recipeVersionsProposed: input.templates.filter((row) => Number(row.operation_count ?? 0) > 0).length,
      unitOperationsProposed,
      dependenciesProposed,
      skillRequirementsProposed: input.skillRequirements.length,
      batchSnapshotsProposed: input.batches.filter((row) => Boolean(row.template_exists)).length,
      campaignCandidatesProposed: new Set(input.batches.map((row) => String(row.project_code || row.batch_code || ''))).size,
      blockers: Array.from(blockers),
      warnings: Array.from(warnings),
    };
  }
}

const EXCEPTION_CODES = new Set<string>([
  'LEGACY_PRODUCT_REQUIRED',
  'TEMPLATE_WITHOUT_OPERATIONS',
  'OPERATION_DURATION_MISSING',
  'DEPENDENCY_TARGET_MISSING',
  'DEPENDENCY_CYCLE_DETECTED',
  'SKILL_REQUIREMENT_UNMAPPED',
  'BATCH_TEMPLATE_MISSING',
  'CAMPAIGN_GROUPING_AMBIGUOUS',
  'ORPHAN_LEGACY_REFERENCE',
  'MYSQL_VERSION_CHECK_REQUIRED',
]);

const isLegacyBackfillExceptionCode = (value: string): value is LegacyBackfillExceptionCode => EXCEPTION_CODES.has(value);
