import express from 'express';
import {
  autoPlan,
  workloadSnapshot,
  recommendForOperation,
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
router.get('/workload', workloadSnapshot);
router.get('/recommend/:operationPlanId', recommendForOperation);
router.post('/metrics/compute', computeMetrics);
router.get('/metrics/history', listMetricsSnapshots);
router.get('/metrics/:snapshotId', getMetricsSnapshot);
router.post('/shift-plans/:shiftPlanId/lock', lockShiftPlan);
router.delete('/shift-plans/:shiftPlanId/lock', unlockShiftPlan);

export default router;
