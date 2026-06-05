import express from 'express';
import { listOperationQualificationRequirements } from '../controllers/operationQualificationController';
import requirePermission from '../middleware/requirePermission';

const router = express.Router();

// 平铺列表，供前端求解器加载
router.get('/', requirePermission('MASTER_OPERATION_READ'), listOperationQualificationRequirements);

export default router;
