import { Router } from 'express';
import {
    getAllOperationTypes,
    getOperationTypesGroupedByTeam,
    getOperationTypeById,
    createOperationType,
    updateOperationType,
    deleteOperationType
} from '../controllers/operationTypeController';

const router = Router();

// GET /api/operation-types - 获取所有操作类型
router.get('/', getAllOperationTypes);

// GET /api/operation-types/grouped - 获取按Team分组的操作类型
router.get('/grouped', getOperationTypesGroupedByTeam);

// GET /api/operation-types/:id - 获取单个操作类型
router.get('/:id', getOperationTypeById);

// POST /api/operation-types - 创建新操作类型
router.post('/', createOperationType);

// PUT /api/operation-types/:id - 更新操作类型
router.put('/:id', updateOperationType);

// DELETE /api/operation-types/:id - 删除操作类型
router.delete('/:id', deleteOperationType);

export default router;
