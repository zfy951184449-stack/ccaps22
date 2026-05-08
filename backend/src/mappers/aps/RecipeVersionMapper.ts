import type { RowDataPacket } from 'mysql2/promise';
import type {
  OperationDependency,
  RecipeOperationSkillRequirement,
  RecipeUnitOperation,
  RecipeVersion,
} from '../../domain/masterData/recipeTypes';

const nullableNumber = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const nullableString = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));
const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === '1';

export const mapRecipeVersionRow = (row: RowDataPacket): RecipeVersion => ({
  id: Number(row.id),
  productId: Number(row.product_id),
  recipeCode: String(row.recipe_code),
  recipeName: String(row.recipe_name),
  versionNo: String(row.version_no),
  scaleLiters: nullableNumber(row.scale_liters),
  lifecycleStatus: row.lifecycle_status,
  effectiveFrom: nullableString(row.effective_from),
  effectiveTo: nullableString(row.effective_to),
  sourceTemplateId: nullableNumber(row.source_template_id),
  approvedBy: nullableNumber(row.approved_by),
  approvedAt: nullableString(row.approved_at),
  createdBy: nullableNumber(row.created_by),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
});

export const mapRecipeUnitOperationRow = (row: RowDataPacket): RecipeUnitOperation => ({
  id: Number(row.id),
  recipeVersionId: Number(row.recipe_version_id),
  unitOpCode: String(row.unit_op_code),
  unitOpName: String(row.unit_op_name),
  sequenceNo: Number(row.sequence_no),
  processArea: row.process_area,
  semanticType: nullableString(row.semantic_type),
  defaultDurationMinutes: nullableNumber(row.default_duration_minutes),
  minDurationMinutes: nullableNumber(row.min_duration_minutes),
  maxDurationMinutes: nullableNumber(row.max_duration_minutes),
  earliestOffsetMinutes: nullableNumber(row.earliest_offset_minutes),
  latestOffsetMinutes: nullableNumber(row.latest_offset_minutes),
  holdTimeLimitMinutes: nullableNumber(row.hold_time_limit_minutes),
  requiresQcStatusReady: toBoolean(row.requires_qc_status_ready),
  isContinuous: toBoolean(row.is_continuous),
  isBiologicalFixedDuration: toBoolean(row.is_biological_fixed_duration),
  requiredPeople: nullableNumber(row.required_people),
  sourceStageOperationId: nullableNumber(row.source_stage_operation_id),
  operationStatus: row.operation_status,
});

export const mapOperationDependencyRow = (row: RowDataPacket): OperationDependency => ({
  id: Number(row.id),
  recipeVersionId: Number(row.recipe_version_id),
  predecessorUnitOpId: Number(row.predecessor_unit_op_id),
  successorUnitOpId: Number(row.successor_unit_op_id),
  dependencyType: row.dependency_type,
  lagType: row.lag_type,
  lagMinMinutes: nullableNumber(row.lag_min_minutes),
  lagMaxMinutes: nullableNumber(row.lag_max_minutes),
  constraintCode: String(row.constraint_code),
  hardOrSoft: row.hard_or_soft,
  severity: row.severity,
  dependencyStatus: row.dependency_status,
  sourceOperationConstraintId: nullableNumber(row.source_operation_constraint_id),
});

export const mapRecipeOperationSkillRequirementRow = (row: RowDataPacket): RecipeOperationSkillRequirement => ({
  id: Number(row.id),
  recipeVersionId: Number(row.recipe_version_id),
  recipeUnitOperationId: Number(row.recipe_unit_operation_id),
  qualificationId: nullableNumber(row.qualification_id),
  skillCode: String(row.skill_code),
  requiredCount: Number(row.required_count),
  minLevel: nullableNumber(row.min_level),
  areaCode: nullableString(row.area_code),
  productScope: nullableString(row.product_scope),
  criticality: row.criticality,
  requiresSupervisor: toBoolean(row.requires_supervisor),
  requiresQaOnFloor: toBoolean(row.requires_qa_on_floor),
  requiresTwoPersonVerification: toBoolean(row.requires_two_person_verification),
  handoverOverlapMinutes: Number(row.handover_overlap_minutes ?? 0),
  gowningMinutes: Number(row.gowning_minutes ?? 0),
  requirementStatus: row.requirement_status,
});
