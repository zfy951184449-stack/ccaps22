import express from 'express';
import {
  getDayOperations,
  getWeekOperations,
  getMonthOperations,
  getActiveBatchOperations,
  getOperationDetail,
  updateOperationSchedule,
  getRecommendedPersonnel,
  assignPersonnel,
  bulkAutoAssign,
  activateBatch,
  deactivateBatch,
  importHolidays
} from '../controllers/calendarController';
import {
  lockOperationPlan,
  unlockOperationPlan,
} from '../controllers/lockController';

const router = express.Router();

// 日历视图
router.get('/operations/day', getDayOperations);
router.get('/operations/week', getWeekOperations);
router.get('/operations/month', getMonthOperations);
router.get('/operations/active', getActiveBatchOperations);

// 操作详情和人员
router.get('/operations/:operationId', getOperationDetail);
router.put('/operations/:operationId/schedule', updateOperationSchedule);
router.get('/operations/:operationId/recommended-personnel', getRecommendedPersonnel);
router.post('/operations/:operationId/assign', assignPersonnel);
router.post('/operations/:operationId/lock', lockOperationPlan);
router.delete('/operations/:operationId/lock', unlockOperationPlan);

// 批量操作
router.post('/batch/:batchId/auto-assign', bulkAutoAssign);
router.post('/batch/:batchId/activate', activateBatch);
router.post('/batch/:batchId/deactivate', deactivateBatch);
router.post('/holidays/import', importHolidays);

export default router;
