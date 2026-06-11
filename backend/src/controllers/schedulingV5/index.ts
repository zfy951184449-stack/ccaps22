/**
 * V5 Scheduling Controller - Barrel Export
 *
 * This file re-exports all route handlers from the split sub-modules,
 * maintaining backward compatibility with routes/schedulingV5.ts.
 *
 * Split modules:
 * - types.ts: Type definitions and shared constants (progressEmitterV5, SOLVER_V5_URL)
 * - helpers.ts: Pure utility functions, normalizers, and DB persistence helpers
 * - solveOrchestrator.ts: createSolveTaskV5, triggerSolveAsync
 * - solveProgressSSE.ts: getSolveProgressSSEV5, updateSolveProgressV5
 * - solveResultHandler.ts: getSolveResultV5, receiveSolveResultV5
 * - applyResultController.ts: applySolveResultV5
 * - solveLifecycle.ts: stopSolveV5, getSolveStatusV5, listRunsV5
 */

export { createSolveTaskV5 } from './solveOrchestrator';
export { getSolveProgressSSEV5, updateSolveProgressV5 } from './solveProgressSSE';
export { getSolveResultV5, receiveSolveResultV5 } from './solveResultHandler';
export { applySolveResultV5 } from './applyResultController';
export { stopSolveV5, getSolveStatusV5, listRunsV5 } from './solveLifecycle';
export { runPrecheckV5 } from './precheckHandler';
export { createPreviewProposalV5 } from './previewProposalController';
