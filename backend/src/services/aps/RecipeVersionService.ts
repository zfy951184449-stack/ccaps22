import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { RecipeVersion } from '../../domain/masterData/recipeTypes';
import { mapRecipeVersionRow } from '../../mappers/aps/RecipeVersionMapper';

export interface CreateDraftRecipeVersionInput {
  productId: number;
  recipeCode: string;
  recipeName: string;
  versionNo: string;
  scaleLiters?: number | null;
  sourceTemplateId?: number | null;
  createdBy?: number | null;
}

export interface DryRunPublishFromTemplateInput {
  templateId: number;
  productId?: number | null;
  recipeCode?: string | null;
  versionNo?: string | null;
}

export interface ProposedUnitOperation {
  sourceStageOperationId: number;
  unitOpCode: string;
  unitOpName: string;
  sequenceNo: number;
  processArea: string;
  defaultDurationMinutes: number | null;
  requiredPeople: number | null;
}

export interface ProposedOperationDependency {
  predecessorSourceStageOperationId: number;
  successorSourceStageOperationId: number;
  dependencyType: string;
  lagMinMinutes: number | null;
  lagMaxMinutes: number | null;
}

export interface DependencyValidationResult {
  isValid: boolean;
  blockers: string[];
  warnings: string[];
}

export interface DryRunPublishFromTemplateResult {
  templateId: number;
  recipeVersionProposed: boolean;
  proposedRecipeCode: string | null;
  proposedVersionNo: string | null;
  unitOperationsProposed: ProposedUnitOperation[];
  dependenciesProposed: ProposedOperationDependency[];
  blockers: string[];
  warnings: string[];
}

const toDependencyType = (value: unknown): string => {
  const numeric = Number(value ?? 1);
  if (numeric === 2) return 'SS';
  if (numeric === 3) return 'FF';
  if (numeric === 4) return 'SF';
  return 'FS';
};

export class RecipeVersionService {
  static async createDraft(input: CreateDraftRecipeVersionInput): Promise<RecipeVersion> {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO recipe_versions
        (product_id, recipe_code, recipe_name, version_no, scale_liters, source_template_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.productId,
        input.recipeCode,
        input.recipeName,
        input.versionNo,
        input.scaleLiters ?? null,
        input.sourceTemplateId ?? null,
        input.createdBy ?? null,
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM recipe_versions WHERE id = ?`,
      [result.insertId],
    );
    return mapRecipeVersionRow(rows[0]);
  }

  static async dryRunPublishFromTemplate(input: DryRunPublishFromTemplateInput): Promise<DryRunPublishFromTemplateResult> {
    const blockers: string[] = [];
    const warnings: string[] = [];

    const [templateRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, template_code, template_name FROM process_templates WHERE id = ? LIMIT 1`,
      [input.templateId],
    );

    if (templateRows.length === 0) {
      return {
        templateId: input.templateId,
        recipeVersionProposed: false,
        proposedRecipeCode: input.recipeCode ?? null,
        proposedVersionNo: input.versionNo ?? null,
        unitOperationsProposed: [],
        dependenciesProposed: [],
        blockers: ['TEMPLATE_NOT_FOUND'],
        warnings,
      };
    }

    if (!input.productId) {
      blockers.push('LEGACY_PRODUCT_REQUIRED');
    }

    const template = templateRows[0];
    const [operationRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         sos.id AS source_stage_operation_id,
         sos.operation_order,
         sos.operation_day,
         sos.recommended_time,
         ps.stage_code,
         ps.stage_name,
         ps.stage_order,
         o.operation_code,
         o.operation_name,
         o.standard_time,
         o.required_people
       FROM process_stages ps
       JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
       JOIN operations o ON o.id = sos.operation_id
       WHERE ps.template_id = ?
       ORDER BY ps.stage_order, sos.operation_day, sos.recommended_time, sos.operation_order, sos.id`,
      [input.templateId],
    );

    if (operationRows.length === 0) {
      blockers.push('TEMPLATE_WITHOUT_OPERATIONS');
    }

    const unitOperationsProposed: ProposedUnitOperation[] = operationRows.map((row, index) => {
      const durationHours = row.standard_time === null || row.standard_time === undefined ? null : Number(row.standard_time);
      if (durationHours === null || Number.isNaN(durationHours) || durationHours <= 0) {
        blockers.push('OPERATION_DURATION_MISSING');
      }

      return {
        sourceStageOperationId: Number(row.source_stage_operation_id),
        unitOpCode: String(row.operation_code || `OP-${row.source_stage_operation_id}`),
        unitOpName: String(row.operation_name || row.stage_name || `Operation ${index + 1}`),
        sequenceNo: index + 1,
        processArea: 'ANCILLARY',
        defaultDurationMinutes: durationHours === null || Number.isNaN(durationHours) ? null : Math.round(durationHours * 60),
        requiredPeople: row.required_people === null || row.required_people === undefined ? null : Number(row.required_people),
      };
    });

    const sourceIds = new Set(unitOperationsProposed.map((item) => item.sourceStageOperationId));
    const [constraintRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, schedule_id, predecessor_schedule_id, constraint_type, time_lag
       FROM operation_constraints
       WHERE schedule_id IN (
         SELECT sos.id
         FROM process_stages ps
         JOIN stage_operation_schedules sos ON sos.stage_id = ps.id
         WHERE ps.template_id = ?
       )`,
      [input.templateId],
    );

    const dependenciesProposed: ProposedOperationDependency[] = [];
    for (const row of constraintRows) {
      const predecessorId = Number(row.predecessor_schedule_id);
      const successorId = Number(row.schedule_id);
      if (!sourceIds.has(predecessorId) || !sourceIds.has(successorId)) {
        blockers.push('DEPENDENCY_TARGET_MISSING');
        continue;
      }
      dependenciesProposed.push({
        predecessorSourceStageOperationId: predecessorId,
        successorSourceStageOperationId: successorId,
        dependencyType: toDependencyType(row.constraint_type),
        lagMinMinutes: row.time_lag === null || row.time_lag === undefined ? null : Math.round(Number(row.time_lag) * 60),
        lagMaxMinutes: null,
      });
    }

    const validation = this.validateDependencies(dependenciesProposed);
    blockers.push(...validation.blockers);
    warnings.push(...validation.warnings);

    return {
      templateId: input.templateId,
      recipeVersionProposed: blockers.length === 0,
      proposedRecipeCode: input.recipeCode ?? String(template.template_code),
      proposedVersionNo: input.versionNo ?? 'v1',
      unitOperationsProposed,
      dependenciesProposed,
      blockers: Array.from(new Set(blockers)),
      warnings: Array.from(new Set(warnings)),
    };
  }

  static async publishFromTemplate(): Promise<never> {
    throw new Error('APS_RECIPE_PUBLISH_FROM_TEMPLATE_NOT_IMPLEMENTED');
  }

  static validateDependencies(dependencies: ProposedOperationDependency[]): DependencyValidationResult {
    const blockers: string[] = [];
    const warnings: string[] = [];
    const graph = new Map<number, number[]>();

    for (const dependency of dependencies) {
      if (dependency.predecessorSourceStageOperationId === dependency.successorSourceStageOperationId) {
        blockers.push('DEPENDENCY_SELF_REFERENCE');
      }
      const edges = graph.get(dependency.predecessorSourceStageOperationId) ?? [];
      edges.push(dependency.successorSourceStageOperationId);
      graph.set(dependency.predecessorSourceStageOperationId, edges);
    }

    const visiting = new Set<number>();
    const visited = new Set<number>();
    const visit = (node: number): boolean => {
      if (visiting.has(node)) return true;
      if (visited.has(node)) return false;
      visiting.add(node);
      for (const next of graph.get(node) ?? []) {
        if (visit(next)) return true;
      }
      visiting.delete(node);
      visited.add(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (visit(node)) {
        blockers.push('DEPENDENCY_CYCLE_DETECTED');
        break;
      }
    }

    return {
      isValid: blockers.length === 0,
      blockers: Array.from(new Set(blockers)),
      warnings,
    };
  }
}
