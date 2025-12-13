import express from 'express';
import {
  listSchedulingRuns,
  listSchedulingRunEvents,
  createSchedulingRun,
  getSchedulingRunById,
  triggerSolve,
  getSchedulingResult,
  applySchedulingResult,
  receiveProgress,
} from '../controllers/schedulingRunController';

const router = express.Router();

// List all scheduling runs
router.get('/', listSchedulingRuns);

// Create a new scheduling run
router.post('/', createSchedulingRun);

// Get a scheduling run by ID
router.get('/:runId', getSchedulingRunById);

// Get events for a scheduling run
router.get('/:runId/events', listSchedulingRunEvents);

// Trigger solver for a scheduling run
router.post('/:runId/solve', triggerSolve);

// Get stored result for a scheduling run
router.get('/:runId/result', getSchedulingResult);

// Apply scheduling result to production tables
router.post('/:runId/apply', applySchedulingResult);

// Receive progress updates from solver (internal API)
router.post('/:runId/progress', receiveProgress);

export default router;
