import express from 'express';
import * as schedulingV4Controller from '../controllers/schedulingV4Controller';

const router = express.Router();

// 1. Trigger Solve
/**
 * @route POST /api/v4/scheduling/solve
 * @desc Trigger a new V4 solver task
 * @access Private
 */
router.post('/solve', schedulingV4Controller.createSolveTaskV4);

// 2. SSE Progress Stream
/**
 * @route GET /api/v4/scheduling/runs/:runId/progress
 * @desc Get real-time progress via SSE
 * @access Private
 */
router.get('/runs/:runId/progress', schedulingV4Controller.getSolveProgressSSEV4);

// 3. Internal Callback (for Python Solver)
router.post('/callback/progress', schedulingV4Controller.updateSolveProgressV4);

// 3b. Internal Callback for Final Result (for Python Solver)
router.post('/callback/result', schedulingV4Controller.receiveSolveResultV4);

// 4. Get Solve Results
/**
 * @route GET /api/v4/scheduling/runs/:runId/result
 * @desc Get the results of a V4 solver run
 * @access Private
 */
router.get('/runs/:runId/result', schedulingV4Controller.getSolveResultV4);

// 5. Stop Solver
/**
 * @route POST /api/v4/scheduling/runs/:runId/stop
 * @desc Manually stop a V4 solver run
 * @access Private
 */
router.post('/runs/:runId/stop', schedulingV4Controller.stopSolveV4);

// 6. Get Solve Status (Lightweight for polling)
/**
 * @route GET /api/v4/scheduling/runs/:runId/status
 * @desc Get the current status of a V4 solver run
 * @access Private
 */
router.get('/runs/:runId/status', schedulingV4Controller.getSolveStatusV4);

// 7. Apply Solver Result to Production Tables
/**
 * @route POST /api/v4/scheduling/runs/:runId/apply
 * @desc Apply V4 solver result to batch_personnel_assignments and employee_shift_plans
 * @access Private
 */
router.post('/runs/:runId/apply', schedulingV4Controller.applySolveResultV4);

export default router;

