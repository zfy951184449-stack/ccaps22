/**
 * 独立操作路由
 */

import express from 'express';
import {
    batchCreateIndependentOperations,
    getIndependentOperations,
    deleteIndependentOperationsByGroup,
    deleteIndependentOperation
} from '../controllers/independentOperationController';

const router = express.Router();

// 批量创建独立操作
router.post('/batch', batchCreateIndependentOperations);

// 获取独立操作列表
router.get('/', getIndependentOperations);

// 按组删除独立操作
router.delete('/group/:groupId', deleteIndependentOperationsByGroup);

// 删除单个独立操作
router.delete('/:id', deleteIndependentOperation);

export default router;
