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
  preloadHolidayData,
  getBatchOperations
} from '../controllers/calendarController';
import {
  lockOperationPlan,
  unlockOperationPlan,
} from '../controllers/lockController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';
const router = express.Router();

// scope resolver（日历侧写端点；注意 param 名为 :operationId / :batchId，非 :id）：
//   - operation 类写（排程/派人/锁定）：operations → operation_type_id → operation_types.team_id。
//   - batch 类动作（批量自动派人/激活/停用）：批次 → 模板 → team；与 batchPlanning.ts 的 batchScope 对齐。
const calendarOperationScope = (req: express.Request) =>
  ScopeService.resolveResourceUnit('operation', Number(req.params.operationId));
const calendarBatchScope = (req: express.Request) =>
  ScopeService.resolveResourceUnit('batch_plan', Number(req.params.batchId));

// 日历视图
router.get('/operations/day', requirePermission('APS_CALENDAR_READ'), getDayOperations);
router.get('/operations/week', requirePermission('APS_CALENDAR_READ'), getWeekOperations);
router.get('/operations/month', requirePermission('APS_CALENDAR_READ'), getMonthOperations);
router.get('/operations/active', requirePermission('APS_CALENDAR_READ'), getActiveBatchOperations);
router.get('/workdays', requirePermission('APS_CALENDAR_READ'), getWorkdayRange);
router.post('/batch-operations', requirePermission('APS_CALENDAR_READ'), getBatchOperations);

// 操作详情和人员
router.get('/operations/:operationId', requirePermission('APS_CALENDAR_READ'), getOperationDetail);
router.put('/operations/:operationId/schedule', requirePermission('APS_CALENDAR_WRITE'), requireScope(calendarOperationScope), updateOperationSchedule);
router.get('/operations/:operationId/recommended-personnel', requirePermission('APS_CALENDAR_READ'), getRecommendedPersonnel);
router.get('/operations/:operationId/available-employees', requirePermission('APS_CALENDAR_READ'), getAvailableEmployees);
router.post('/operations/:operationId/assign', requirePermission('APS_CALENDAR_WRITE'), requireScope(calendarOperationScope), assignPersonnel);
router.post('/operations/:operationId/assign-position', requirePermission('APS_CALENDAR_WRITE'), requireScope(calendarOperationScope), assignPositionPersonnel);
router.post('/operations/:operationId/lock', requirePermission('APS_CALENDAR_OPERATE'), requireScope(calendarOperationScope), lockOperationPlan);
router.delete('/operations/:operationId/lock', requirePermission('APS_CALENDAR_OPERATE'), requireScope(calendarOperationScope), unlockOperationPlan);
// 批量操作
router.post('/batch/:batchId/auto-assign', requirePermission('APS_CALENDAR_OPERATE'), requireScope(calendarBatchScope), bulkAutoAssign);
router.post('/batch/:batchId/activate', requirePermission('APS_BATCH_ACTIVATE'), requireScope(calendarBatchScope), activateBatch);
router.post('/batch/:batchId/deactivate', requirePermission('APS_BATCH_ACTIVATE'), requireScope(calendarBatchScope), deactivateBatch);

// 节假日管理
router.get('/test', requirePermission('APS_CALENDAR_READ'), (req, res) => {
  console.log('测试路由被访问');
  res.json({ message: '测试路由工作正常' });
});
router.get('/holidays/cache/stats', requirePermission('APS_CALENDAR_READ'), (req, res) => {
  console.log('访问缓存统计路由');
  return getHolidayCacheStats(req, res);
});
router.post('/holidays/cache/cleanup', requirePermission('APS_CALENDAR_HOLIDAY_OPERATE'), cleanupHolidayCache);
router.post('/holidays/preload', requirePermission('APS_CALENDAR_HOLIDAY_OPERATE'), preloadHolidayData);
router.post('/holidays/import', requirePermission('APS_CALENDAR_HOLIDAY_OPERATE'), importHolidays);

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
