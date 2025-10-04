import express from 'express';
import {
  getStageOperations,
  addOperationToStage,
  updateStageOperation,
  removeOperationFromStage,
  batchAddOperations,
  reorderStageOperations,
  getAvailableOperations
} from '../controllers/stageOperationController';

const router = express.Router();

// 操作安排路由
router.get('/available', getAvailableOperations);
router.get('/stage/:stageId', getStageOperations);
router.post('/stage/:stageId', addOperationToStage);
router.post('/stage/:stageId/batch', batchAddOperations);
router.put('/:scheduleId', updateStageOperation);
router.delete('/:scheduleId', removeOperationFromStage);
router.put('/stage/:stageId/reorder', reorderStageOperations);

export default router;