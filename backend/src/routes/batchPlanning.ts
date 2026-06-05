import express from 'express';
import {
  getAllBatchPlans,
  getBatchPlanById,
  createBatchPlan,
  updateBatchPlan,
  deleteBatchPlan,
  getBatchStatistics,
  getTemplatesForBatch,
  activateBatchPlan,
  deactivateBatchPlan,
  getTemplateDay0Offset,
  createBatchPlansInBulk,
  getBatchOperationsTree,
  createBatchPlanFromMfgPackage,
  createBatchPlansFromMfgPackageInBulk
} from '../controllers/batchPlanningController';
import requirePermission from '../middleware/requirePermission';
import requireScope from '../middleware/requireScope';
import { ScopeService } from '../services/governance/ScopeService';

const router = express.Router();

// scope resolver：批次写端点资源 id 在 :id，归属 = 批次→模板→team。
const batchScope = (req: express.Request) =>
  ScopeService.resolveResourceUnit('batch_plan', Number(req.params.id));

// Get batch statistics
router.get('/statistics', requirePermission('APS_BATCH_READ'), getBatchStatistics);

// Get templates for batch creation
router.get('/templates', requirePermission('APS_BATCH_READ'), getTemplatesForBatch);

// Get template day0 offset (新增：获取模版的day0偏移量)
router.get('/templates/:templateId/day0-offset', requirePermission('APS_BATCH_READ'), getTemplateDay0Offset);

// Bulk create batches (新增：批量创建批次)
router.post('/bulk', requirePermission('APS_BATCH_WRITE'), createBatchPlansInBulk);

// Create batch from a MFG day-anchor package.
router.post('/from-package', requirePermission('APS_BATCH_WRITE'), createBatchPlanFromMfgPackage);
router.post('/from-package/bulk', requirePermission('APS_BATCH_WRITE'), createBatchPlansFromMfgPackageInBulk);

// CRUD operations
router.get('/', requirePermission('APS_BATCH_READ'), getAllBatchPlans);
router.get('/:id', requirePermission('APS_BATCH_READ'), getBatchPlanById);
router.get('/:id/operations-tree', requirePermission('APS_BATCH_READ'), getBatchOperationsTree);
router.post('/', requirePermission('APS_BATCH_WRITE'), createBatchPlan);
router.put('/:id', requirePermission('APS_BATCH_WRITE'), requireScope(batchScope), updateBatchPlan);
router.delete('/:id', requirePermission('APS_BATCH_WRITE'), requireScope(batchScope), deleteBatchPlan);
router.post('/:id/activate', requirePermission('APS_BATCH_ACTIVATE'), requireScope(batchScope), activateBatchPlan);
router.post('/:id/deactivate', requirePermission('APS_BATCH_ACTIVATE'), requireScope(batchScope), deactivateBatchPlan);

export default router;
