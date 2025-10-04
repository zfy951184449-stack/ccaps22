import express from 'express';
import {
  getOperationQualifications,
  setPositionQualifications,
  addPositionQualification,
  removePositionQualification,
  copyPositionQualifications,
  getAvailableQualifications
} from '../controllers/operationQualificationController';

const router = express.Router();

// 获取所有可用的资质
router.get('/available', getAvailableQualifications);

// 获取操作的资质要求（按位置分组）
router.get('/:operationId', getOperationQualifications);

// 设置某个位置的资质要求
router.put('/:operationId/position/:positionNumber', setPositionQualifications);

// 添加单个资质要求到指定位置
router.post('/:operationId/position/:positionNumber', addPositionQualification);

// 复制位置的资质要求
router.post('/:operationId/copy-position', copyPositionQualifications);

// 删除资质要求（使用记录ID）
router.delete('/requirement/:requirementId', removePositionQualification);

export default router;