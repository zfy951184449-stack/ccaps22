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

const router = express.Router();

// Get batch statistics
router.get('/statistics', getBatchStatistics);

// Get templates for batch creation
router.get('/templates', getTemplatesForBatch);

// Get template day0 offset (新增：获取模版的day0偏移量)
router.get('/templates/:templateId/day0-offset', getTemplateDay0Offset);

// Bulk create batches (新增：批量创建批次)
router.post('/bulk', createBatchPlansInBulk);

// Create batch from a MFG day-anchor package.
router.post('/from-package', createBatchPlanFromMfgPackage);
router.post('/from-package/bulk', createBatchPlansFromMfgPackageInBulk);

// CRUD operations
router.get('/', getAllBatchPlans);
router.get('/:id', getBatchPlanById);
router.get('/:id/operations-tree', getBatchOperationsTree);
router.post('/', createBatchPlan);
router.put('/:id', updateBatchPlan);
router.delete('/:id', deleteBatchPlan);
router.post('/:id/activate', activateBatchPlan);
router.post('/:id/deactivate', deactivateBatchPlan);

export default router;
