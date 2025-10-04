import express from 'express';
import {
  getAllOperations,
  getOperationById,
  createOperation,
  updateOperation,
  deleteOperation,
  getNextOperationCode,
  getOperationStatistics
} from '../controllers/operationController';

const router = express.Router();

// 获取统计信息
router.get('/statistics', getOperationStatistics);

// 获取下一个操作编码预览
router.get('/next-code', getNextOperationCode);

// CRUD路由
router.get('/', getAllOperations);
router.get('/:id', getOperationById);
router.post('/', createOperation);
router.put('/:id', updateOperation);
router.delete('/:id', deleteOperation);

export default router;