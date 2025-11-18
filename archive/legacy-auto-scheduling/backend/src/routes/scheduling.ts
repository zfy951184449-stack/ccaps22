import express from 'express';
import {
  autoPlan,
  autoPlanV2,
  autoPlanV3,
  autoPlanV4,
  workloadSnapshot,
  recommendForOperation,
  listRuns,
  getRun,
  publishRun,
  rollbackRun,
  retryAutoPlan,
  exportCoverageGaps,
  getRunEvents,
  streamRunProgress,
  predictWorkload,
  evaluateSchedule,
  checkComprehensiveConstraints,
} from '../controllers/schedulingController';
import {
  computeMetrics,
  getMetricsSnapshot,
  listMetricsSnapshots,
} from '../controllers/schedulingMetricsController';
import {
  lockShiftPlan,
  unlockShiftPlan,
} from '../controllers/lockController';

const router = express.Router();

router.post('/auto-plan', autoPlan);
router.post('/auto-plan/v2', autoPlanV2);
router.post('/auto-plan/v3', autoPlanV3);
router.post('/auto-plan/v4', autoPlanV4);
router.get('/workload', workloadSnapshot);
router.get('/recommend/:operationPlanId', recommendForOperation);
router.post('/auto-plan/retry/:operationPlanId', retryAutoPlan);
router.get('/gaps/export', exportCoverageGaps);
router.get('/runs', listRuns);
router.get('/runs/:runId', getRun);
router.get('/runs/:runId/progress', streamRunProgress);
router.get('/runs/:runId/events', getRunEvents);
router.post('/runs/:runId/publish', publishRun);
router.post('/runs/:runId/rollback', rollbackRun);
router.post('/metrics/compute', computeMetrics);
router.get('/metrics/history', listMetricsSnapshots);
router.get('/metrics/:snapshotId', getMetricsSnapshot);
router.post('/shift-plans/:shiftPlanId/lock', lockShiftPlan);
router.delete('/shift-plans/:shiftPlanId/lock', unlockShiftPlan);

// ML-based scheduling endpoints
router.post('/ml/predict-workload', predictWorkload);
router.post('/ml/evaluate', evaluateSchedule);
router.post('/comprehensive-work-time/check', checkComprehensiveConstraints);

export default router;
