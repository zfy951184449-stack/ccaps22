import express from 'express';
import {
  getAllBatchPlans,
  getBatchPlanById,
  createBatchPlan,
  updateBatchPlan,
  deleteBatchPlan,
  getBatchStatistics,
  getTemplatesForBatch
} from '../controllers/batchPlanningController';

const router = express.Router();

// Get batch statistics
router.get('/statistics', getBatchStatistics);

// Get templates for batch creation
router.get('/templates', getTemplatesForBatch);

// CRUD operations
router.get('/', getAllBatchPlans);
router.get('/:id', getBatchPlanById);
router.post('/', createBatchPlan);
router.put('/:id', updateBatchPlan);
router.delete('/:id', deleteBatchPlan);

export default router;