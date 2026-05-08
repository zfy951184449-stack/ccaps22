export type RecipeLifecycleStatus = 'DRAFT' | 'APPROVED' | 'EFFECTIVE' | 'RETIRED';
export type ProcessArea = 'USP' | 'DSP' | 'SPI' | 'QC' | 'QA' | 'WAREHOUSE' | 'ENGINEERING' | 'ANCILLARY';
export type RecipeOperationStatus = 'ACTIVE' | 'INACTIVE';
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';
export type DependencyLagType =
  | 'ASAP'
  | 'FIXED'
  | 'WINDOW'
  | 'NEXT_DAY'
  | 'NEXT_SHIFT'
  | 'COOLING'
  | 'BATCH_END'
  | 'MAX_HOLD'
  | 'ZERO_WAIT';

export interface RecipeVersion {
  id: number;
  productId: number;
  recipeCode: string;
  recipeName: string;
  versionNo: string;
  scaleLiters: number | null;
  lifecycleStatus: RecipeLifecycleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceTemplateId: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeUnitOperation {
  id: number;
  recipeVersionId: number;
  unitOpCode: string;
  unitOpName: string;
  sequenceNo: number;
  processArea: ProcessArea;
  semanticType: string | null;
  defaultDurationMinutes: number | null;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  earliestOffsetMinutes: number | null;
  latestOffsetMinutes: number | null;
  holdTimeLimitMinutes: number | null;
  requiresQcStatusReady: boolean;
  isContinuous: boolean;
  isBiologicalFixedDuration: boolean;
  requiredPeople: number | null;
  sourceStageOperationId: number | null;
  operationStatus: RecipeOperationStatus;
}

export interface OperationDependency {
  id: number;
  recipeVersionId: number;
  predecessorUnitOpId: number;
  successorUnitOpId: number;
  dependencyType: DependencyType;
  lagType: DependencyLagType;
  lagMinMinutes: number | null;
  lagMaxMinutes: number | null;
  constraintCode: string;
  hardOrSoft: 'hard' | 'soft';
  severity: 'info' | 'warning' | 'critical';
  dependencyStatus: 'ACTIVE' | 'INACTIVE';
  sourceOperationConstraintId: number | null;
}

export interface RecipeOperationSkillRequirement {
  id: number;
  recipeVersionId: number;
  recipeUnitOperationId: number;
  qualificationId: number | null;
  skillCode: string;
  requiredCount: number;
  minLevel: number | null;
  areaCode: string | null;
  productScope: string | null;
  criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  requiresSupervisor: boolean;
  requiresQaOnFloor: boolean;
  requiresTwoPersonVerification: boolean;
  handoverOverlapMinutes: number;
  gowningMinutes: number;
  requirementStatus: 'ACTIVE' | 'INACTIVE';
}
