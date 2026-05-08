export type ConstraintCategory =
  | 'FLOW_WINDOW'
  | 'QUALITY_GATE'
  | 'EQUIPMENT_STATE'
  | 'UTILITY_CAPACITY'
  | 'SPACE_SEGREGATION'
  | 'WORKFORCE_COVERAGE'
  | 'ROSTER_QUALIFICATION'
  | 'ROSTER_HANDOVER'
  | 'ROSTER_TRANSITION'
  | 'ROSTER_REST';

export type HardOrSoft = 'hard' | 'soft';
export type ConstraintSeverity = 'info' | 'warning' | 'critical';
export type ConstraintOwnerDomain = 'APS' | 'ROSTER' | 'MASTER_DATA' | 'GOVERNANCE' | 'INTEGRATION';
export type ConstraintLifecycleStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type PlanningCriticality = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ConstraintDefinition {
  id: number;
  constraintCode: string;
  constraintName: string;
  category: ConstraintCategory;
  hardOrSoftDefault: HardOrSoft;
  defaultSeverity: ConstraintSeverity;
  violationMessageTemplate: string;
  suggestedActionTemplate: string | null;
  ownerDomain: ConstraintOwnerDomain;
  lifecycleStatus: ConstraintLifecycleStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  planningCriticality: PlanningCriticality;
  qualityRelevant: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeedConstraintDefinitionInput {
  constraintCode: string;
  constraintName: string;
  category: ConstraintCategory;
  hardOrSoftDefault: HardOrSoft;
  defaultSeverity: ConstraintSeverity;
  violationMessageTemplate: string;
  suggestedActionTemplate?: string | null;
  ownerDomain?: ConstraintOwnerDomain;
  lifecycleStatus?: ConstraintLifecycleStatus;
  planningCriticality?: PlanningCriticality;
  qualityRelevant?: boolean;
}
