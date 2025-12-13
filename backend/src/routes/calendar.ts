import express from 'express';
import {
  getDayOperations,
  getWeekOperations,
  getMonthOperations,
  getActiveBatchOperations,
  getOperationDetail,
  updateOperationSchedule,
  getRecommendedPersonnel,
  getAvailableEmployees,
  assignPersonnel,
  assignPositionPersonnel,
  bulkAutoAssign,
  activateBatch,
  deactivateBatch,
  importHolidays,
  getWorkdayRange,
  getHolidayCacheStats,
  cleanupHolidayCache,
  preloadHolidayData
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
router.get('/workdays', getWorkdayRange);

// 操作详情和人员
router.get('/operations/:operationId', getOperationDetail);
router.put('/operations/:operationId/schedule', updateOperationSchedule);
router.get('/operations/:operationId/recommended-personnel', getRecommendedPersonnel);
router.get('/operations/:operationId/available-employees', getAvailableEmployees);
router.post('/operations/:operationId/assign', assignPersonnel);
router.post('/operations/:operationId/assign-position', assignPositionPersonnel);
router.post('/operations/:operationId/lock', lockOperationPlan);
router.delete('/operations/:operationId/lock', unlockOperationPlan);
// 批量操作
router.post('/batch/:batchId/auto-assign', bulkAutoAssign);
router.post('/batch/:batchId/activate', activateBatch);
router.post('/batch/:batchId/deactivate', deactivateBatch);

// 节假日管理
router.get('/test', (req, res) => {
  console.log('测试路由被访问');
  res.json({ message: '测试路由工作正常' });
});
router.get('/holidays/cache/stats', (req, res) => {
  console.log('访问缓存统计路由');
  return getHolidayCacheStats(req, res);
});
router.post('/holidays/cache/cleanup', cleanupHolidayCache);
router.post('/holidays/preload', preloadHolidayData);
router.post('/holidays/import', importHolidays);

// 调试路由 - 捕获所有未匹配的请求
router.use('*', (req, res) => {
  console.log(`未匹配的路由: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    url: req.originalUrl,
    baseUrl: req.baseUrl,
    path: req.path
  });
});

export default router;
