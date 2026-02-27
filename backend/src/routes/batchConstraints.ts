/**
 * Batch Constraint Routes
 * 
 * 批次约束 API 路由
 */

import express, { Request, Response } from 'express';
import {
    getBatchOperationConstraints,
    createBatchConstraint,
    updateBatchConstraint,
    deleteBatchConstraint,
    getBatchAvailableOperations,
    searchBatchOperations,
    getBatchOperationHierarchy
} from '../controllers/batchConstraintController';
import { runBatchValidation } from '../services/batchValidationService';

const router = express.Router();

// 获取批次操作的约束
router.get('/batch-operation-plans/:operationPlanId/constraints', getBatchOperationConstraints);

// 获取批次可用操作（用于创建约束）
router.get('/batches/:batchPlanId/available-operations', getBatchAvailableOperations);

// 搜索批次操作（支持跨批次）
router.get('/batch-operations/search', searchBatchOperations);
router.get('/batch-operations/hierarchy', getBatchOperationHierarchy);

// 约束 CRUD
router.post('/batch-constraints', createBatchConstraint);
router.put('/batch-constraints/:id', updateBatchConstraint);
router.delete('/batch-constraints/:id', deleteBatchConstraint);

// 批次校验
router.get('/batches/:batchPlanId/validate', async (req: Request, res: Response) => {
    try {
        const { batchPlanId } = req.params;
        const id = Number(batchPlanId);

        if (Number.isNaN(id)) {
            return res.status(400).json({ error: 'Invalid batch plan id' });
        }

        const result = await runBatchValidation(id);
        return res.json(result);
    } catch (error) {
        console.error('Error validating batch constraints:', error);
        return res.status(500).json({ error: 'Failed to validate batch constraints' });
    }
});

export default router;
