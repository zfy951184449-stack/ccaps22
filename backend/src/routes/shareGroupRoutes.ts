import { Router } from 'express';
import {
    getTemplateShareGroups,
    getShareGroup,
    createShareGroup,
    updateShareGroup,
    deleteShareGroup,
    getBatchShareGroups,
    getShareGroupsForGantt,
    getShareGroupsForBatchGantt,
    getShareGroupsByOperationId,
    getShareGroupsByBatchOperationId,
    assignOperationToShareGroup,
    assignBatchOperationToShareGroup,
    removeOperationFromShareGroup,
    removeBatchOperationFromShareGroup,
    mergeBatchOperationsToShareGroup,
    createBatchShareGroup
} from '../controllers/shareGroupController';

const router = Router();

// 获取模板的所有共享组
router.get('/template/:templateId', getTemplateShareGroups);

// 获取模板共享组（用于甘特图显示）
router.get('/template/:templateId/gantt', getShareGroupsForGantt);

// 获取批次共享组（用于批次甘特图显示）
router.get('/batches/gantt', getShareGroupsForBatchGantt);

// 获取批次的所有共享组
router.get('/batch/:batchPlanId', getBatchShareGroups);

// 获取操作所属的共享组 (模板级别)
router.get('/operation/:scheduleId', getShareGroupsByOperationId);

// 获取批次操作所属的共享组 (批次级别)
router.get('/batch-operation/:operationPlanId', getShareGroupsByBatchOperationId);

// 获取单个共享组详情
router.get('/:id', getShareGroup);

// 创建共享组
router.post('/template/:templateId', createShareGroup);

// 将操作加入共享组 (模板级别)
router.post('/assign', assignOperationToShareGroup);

// 将批次操作加入共享组 (批次级别)
router.post('/:groupId/operations', assignBatchOperationToShareGroup);

// 合并批次操作到共享组 (自动创建或合并)
router.post('/batch-operations/merge', mergeBatchOperationsToShareGroup);

// 批量创建批次共享组 (支持跨批次)
router.post('/batch-operations/bulk', createBatchShareGroup);

// 更新共享组
router.put('/:id', updateShareGroup);

// 从共享组移除操作 (模板级别)
router.delete('/operation/:scheduleId/group/:groupId', removeOperationFromShareGroup);

// 从批次共享组移除操作 (批次级别)
router.delete('/:groupId/operations/:operationPlanId', removeBatchOperationFromShareGroup);

// 删除共享组
router.delete('/:id', deleteShareGroup);

export default router;

