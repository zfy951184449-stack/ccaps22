export type BatchRecipeSnapshotStatus = 'ACTIVE' | 'SUPERSEDED';

export interface BatchRecipeSnapshot {
  id: number;
  batchPlanId: number;
  recipeVersionId: number;
  recipeVersionNo: string;
  snapshotVersion: number;
  snapshotJson: unknown;
  unitOperationsJson: unknown;
  dependenciesJson: unknown;
  bomSnapshotJson: unknown | null;
  snapshotStatus: BatchRecipeSnapshotStatus;
  snapshottedAt: string;
  snapshottedBy: number | null;
}

export interface DryRunBatchRecipeSnapshot {
  batchPlanId: number;
  recipeVersionId: number;
  recipeVersionNo: string;
  nextSnapshotVersion: number;
  unitOperationCount: number;
  dependencyCount: number;
  blockers: string[];
  warnings: string[];
}
