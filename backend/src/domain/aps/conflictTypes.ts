import type { ConstraintSeverity, HardOrSoft } from './constraintTypes';

export type ConflictStatus = 'OPEN' | 'ACKNOWLEDGED' | 'WAIVED' | 'RESOLVED' | 'SUPERSEDED';

export interface ApsConflict {
  id: number;
  scenarioId: number;
  constraintCode: string;
  severity: ConstraintSeverity;
  hardOrSoft: HardOrSoft;
  entityType: string | null;
  entityId: number | null;
  batchPlanId: number | null;
  batchOperationPlanId: number | null;
  resourceId: number | null;
  materialLotId: number | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  violationReason: string;
  suggestedAction: string | null;
  conflictStatus: ConflictStatus;
  detectedAt: string;
  detectedByRunId: number | null;
  resolvedAt: string | null;
  resolvedBy: number | null;
  resolutionReason: string | null;
}

export interface CreateApsConflictInput {
  scenarioId: number;
  constraintCode: string;
  severity: ConstraintSeverity;
  hardOrSoft: HardOrSoft;
  entityType?: string | null;
  entityId?: number | null;
  batchPlanId?: number | null;
  batchOperationPlanId?: number | null;
  resourceId?: number | null;
  materialLotId?: number | null;
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  violationReason: string;
  suggestedAction?: string | null;
  detectedByRunId?: number | null;
}
