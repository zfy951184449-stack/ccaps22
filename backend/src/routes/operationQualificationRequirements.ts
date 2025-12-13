import express from 'express';
import { listOperationQualificationRequirements } from '../controllers/operationQualificationController';

const router = express.Router();

// 平铺列表，供前端求解器加载
router.get('/', listOperationQualificationRequirements);

export default router;
