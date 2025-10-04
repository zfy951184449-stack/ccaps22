import { Router } from 'express';
import {
  getTemplateShareGroups,
  createShareGroup,
  updateShareGroup,
  deleteShareGroup,
  assignOperationToGroup,
  removeOperationFromGroup,
  getOperationShareGroups,
  calculatePersonnelOptimization
} from '../controllers/shareGroupController';

const router = Router();

// 获取模板的所有共享组
router.get('/template/:templateId', getTemplateShareGroups);

// 计算模板的人员优化
router.get('/template/:templateId/optimization', calculatePersonnelOptimization);

// 获取操作的共享组
router.get('/operation/:scheduleId', getOperationShareGroups);

// 创建共享组
router.post('/', createShareGroup);

// 更新共享组
router.put('/:id', updateShareGroup);

// 删除共享组
router.delete('/:id', deleteShareGroup);

// 分配操作到共享组
router.post('/assign', assignOperationToGroup);

// 从共享组移除操作
router.delete('/operation/:scheduleId/group/:groupId', removeOperationFromGroup);

export default router;