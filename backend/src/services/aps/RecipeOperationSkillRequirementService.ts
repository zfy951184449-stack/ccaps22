import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import pool from '../../config/database';
import type { RecipeOperationSkillRequirement } from '../../domain/masterData/recipeTypes';
import { mapRecipeOperationSkillRequirementRow } from '../../mappers/aps/RecipeVersionMapper';

export interface CreateRecipeOperationSkillRequirementInput {
  recipeVersionId: number;
  recipeUnitOperationId: number;
  qualificationId?: number | null;
  skillCode: string;
  requiredCount?: number;
  minLevel?: number | null;
  areaCode?: string | null;
  productScope?: string | null;
  criticality?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresSupervisor?: boolean;
  requiresQaOnFloor?: boolean;
  requiresTwoPersonVerification?: boolean;
  handoverOverlapMinutes?: number;
  gowningMinutes?: number;
  sourceOperationQualificationRequirementId?: number | null;
}

export interface DryRunLegacySkillRequirement {
  sourceOperationQualificationRequirementId: number;
  sourceOperationId: number;
  qualificationId: number | null;
  skillCode: string | null;
  requiredCount: number;
  minLevel: number | null;
  blockers: string[];
  warnings: string[];
}

export class RecipeOperationSkillRequirementService {
  static async dryRunMapFromLegacyRequirements(operationId?: number): Promise<DryRunLegacySkillRequirement[]> {
    const params: any[] = [];
    const where = operationId ? 'WHERE oqr.operation_id = ?' : '';
    if (operationId) params.push(operationId);

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         oqr.id,
         oqr.operation_id,
         oqr.qualification_id,
         oqr.min_level,
         oqr.required_level,
         oqr.required_count,
         q.qualification_name
       FROM operation_qualification_requirements oqr
       LEFT JOIN qualifications q ON q.id = oqr.qualification_id
       ${where}
       ORDER BY oqr.operation_id, oqr.position_number, oqr.id`,
      params,
    );

    return rows.map((row) => {
      const blockers: string[] = [];
      const qualificationName = row.qualification_name === null || row.qualification_name === undefined
        ? null
        : String(row.qualification_name);
      if (!qualificationName) blockers.push('SKILL_REQUIREMENT_UNMAPPED');

      return {
        sourceOperationQualificationRequirementId: Number(row.id),
        sourceOperationId: Number(row.operation_id),
        qualificationId: row.qualification_id === null || row.qualification_id === undefined ? null : Number(row.qualification_id),
        skillCode: qualificationName,
        requiredCount: Number(row.required_count ?? 1),
        minLevel: row.min_level === null || row.min_level === undefined ? Number(row.required_level ?? 1) : Number(row.min_level),
        blockers,
        warnings: [],
      };
    });
  }

  static async createRequirement(
    input: CreateRecipeOperationSkillRequirementInput,
  ): Promise<RecipeOperationSkillRequirement> {
    const [existingRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id
       FROM recipe_operation_skill_requirements
       WHERE recipe_unit_operation_id = ?
         AND skill_code = ?
         AND COALESCE(area_code, '') = COALESCE(?, '')
         AND requirement_status = 'ACTIVE'
       LIMIT 1`,
      [input.recipeUnitOperationId, input.skillCode, input.areaCode ?? null],
    );
    if (existingRows.length > 0) {
      throw new Error('RECIPE_OPERATION_SKILL_REQUIREMENT_DUPLICATE_ACTIVE');
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO recipe_operation_skill_requirements
        (recipe_version_id, recipe_unit_operation_id, qualification_id, skill_code, required_count,
         min_level, area_code, product_scope, criticality, requires_supervisor, requires_qa_on_floor,
         requires_two_person_verification, handover_overlap_minutes, gowning_minutes,
         source_operation_qualification_requirement_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.recipeVersionId,
        input.recipeUnitOperationId,
        input.qualificationId ?? null,
        input.skillCode,
        input.requiredCount ?? 1,
        input.minLevel ?? null,
        input.areaCode ?? null,
        input.productScope ?? null,
        input.criticality ?? 'HIGH',
        input.requiresSupervisor ? 1 : 0,
        input.requiresQaOnFloor ? 1 : 0,
        input.requiresTwoPersonVerification ? 1 : 0,
        input.handoverOverlapMinutes ?? 0,
        input.gowningMinutes ?? 0,
        input.sourceOperationQualificationRequirementId ?? null,
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM recipe_operation_skill_requirements WHERE id = ?`,
      [result.insertId],
    );
    return mapRecipeOperationSkillRequirementRow(rows[0]);
  }

  static async listByRecipeOperation(recipeUnitOperationId: number): Promise<RecipeOperationSkillRequirement[]> {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT *
       FROM recipe_operation_skill_requirements
       WHERE recipe_unit_operation_id = ?
       ORDER BY requirement_status, skill_code, id`,
      [recipeUnitOperationId],
    );
    return rows.map(mapRecipeOperationSkillRequirementRow);
  }
}
