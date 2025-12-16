import { Router } from 'express';
import {
    getTemplateShareGroups,
    getShareGroup,
    createShareGroup,
    updateShareGroup,
    deleteShareGroup,
    getBatchShareGroups,
    getShareGroupsForGantt,
    getShareGroupsByOperationId,
    assignOperationToShareGroup,
    removeOperationFromShareGroup
} from '../controllers/shareGroupController';

const router = Router();

// 获取模板的所有共享组
router.get('/template/:templateId', getTemplateShareGroups);

// 获取模板共享组（用于甘特图显示）
router.get('/template/:templateId/gantt', getShareGroupsForGantt);

// 获取批次的所有共享组
router.get('/batch/:batchPlanId', getBatchShareGroups);

// 获取操作所属的共享组
router.get('/operation/:scheduleId', getShareGroupsByOperationId);

// 获取单个共享组详情
router.get('/:id', getShareGroup);

// 创建共享组
router.post('/template/:templateId', createShareGroup);

// 将操作加入共享组
router.post('/assign', assignOperationToShareGroup);

// 更新共享组
router.put('/:id', updateShareGroup);

// 从共享组移除操作
router.delete('/operation/:scheduleId/group/:groupId', removeOperationFromShareGroup);

// 删除共享组
router.delete('/:id', deleteShareGroup);

export default router;

