/**
 * V4 Scheduling Controller - Barrel Export
 * 
 * This file re-exports all route handlers from the split sub-modules,
 * maintaining backward compatibility with routes/schedulingV4.ts.
 * 
 * Split modules:
 * - types.ts: Type definitions and shared constants (progressEmitter, SOLVER_V4_URL)
 * - helpers.ts: Pure utility functions, normalizers, and DB persistence helpers  
 * - solveOrchestrator.ts: createSolveTaskV4, triggerSolveAsync
 * - solveProgressSSE.ts: getSolveProgressSSEV4, updateSolveProgressV4
 * - solveResultHandler.ts: getSolveResultV4, receiveSolveResultV4
 * - applyResultController.ts: applySolveResultV4
 * - solveLifecycle.ts: stopSolveV4, getSolveStatusV4, listRunsV4
 */

export { createSolveTaskV4 } from './solveOrchestrator';
export { getSolveProgressSSEV4, updateSolveProgressV4 } from './solveProgressSSE';
export { getSolveResultV4, receiveSolveResultV4 } from './solveResultHandler';
export { applySolveResultV4 } from './applyResultController';
export { stopSolveV4, getSolveStatusV4, listRunsV4 } from './solveLifecycle';
